from __future__ import annotations

import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlmodel import Session, select

from app.models.run import (
    FileUpload,
    POResult,
    ResultVariant,
    Run,
    RunStatus,
    StoreUpload,
)
from app.schemas.run import RunCreate
from app.services import po_calculator
from app.storage.local_storage import LocalStorage
from app.utils.google_drive import GoogleDriveClient, GoogleDriveNotConfigured


class RunService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _get_file_upload(self, upload_id: int) -> FileUpload:
        upload = self.session.get(FileUpload, upload_id)
        if not upload:
            raise HTTPException(status_code=404, detail=f"File upload {upload_id} not found")
        return upload

    def create_run(self, payload: RunCreate) -> Run:
        run = Run(
            note=payload.note,
            supplier_upload_id=payload.supplier_upload_id,
            store_contribution_upload_id=payload.store_contribution_upload_id,
            padang_reference_upload_id=payload.padang_reference_upload_id,
        )
        self.session.add(run)
        self.session.flush()

        for store_file in payload.store_files:
            file_upload = self._get_file_upload(store_file.file_upload_id)
            store_name = (
                store_file.store_name
                or po_calculator.get_store_name_from_filename(file_upload.original_name or file_upload.file_name)
            )
            store_upload = StoreUpload(
                run_id=run.id,
                file_upload_id=file_upload.id,
                store_name=store_name,
                file_path=file_upload.file_path,
                contribution_pct=store_file.contribution_pct,
            )
            self.session.add(store_upload)

        self.session.commit()
        self.session.refresh(run)
        return run

    def list_runs(self) -> List[Run]:
        runs = self.session.exec(select(Run).order_by(Run.created_at.desc())).all()
        return runs

    def get_run(self, run_id: int) -> Run:
        run = self.session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        return run

    def get_results_for_run(self, run_id: int) -> List[POResult]:
        stmt = select(POResult).where(POResult.run_id == run_id)
        return self.session.exec(stmt).all()


class RunExecutor:
    def __init__(self, session: Session, storage: Optional[LocalStorage] = None) -> None:
        self.session = session
        self.storage = storage or LocalStorage()
        self._drive_client: Optional[GoogleDriveClient] = None

    def _get_drive_client(self) -> Optional[GoogleDriveClient]:
        if self._drive_client is not None:
            return self._drive_client
        try:
            self._drive_client = GoogleDriveClient()
        except GoogleDriveNotConfigured:
            self._drive_client = None
        return self._drive_client

    def _ensure_paths(self, run: Run) -> Dict[str, str]:
        paths: Dict[str, str] = {}
        if not run.supplier_upload_id or not run.store_contribution_upload_id:
            raise HTTPException(status_code=400, detail="Run requires supplier and store contribution files")
        supplier_upload = self.session.get(FileUpload, run.supplier_upload_id)
        store_contrib_upload = self.session.get(FileUpload, run.store_contribution_upload_id)
        if not supplier_upload or not store_contrib_upload:
            raise HTTPException(status_code=404, detail="Required reference files not found")
        paths["supplier"] = supplier_upload.file_path
        paths["store_contrib"] = store_contrib_upload.file_path
        if run.padang_reference_upload_id:
            padang_upload = self.session.get(FileUpload, run.padang_reference_upload_id)
            if not padang_upload:
                raise HTTPException(status_code=404, detail="Padang reference file not found")
            paths["padang"] = padang_upload.file_path
        return paths

    def execute(self, run_id: int) -> Run:
        run = self.session.get(Run, run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Run not found")
        if run.status == RunStatus.RUNNING:
            raise HTTPException(status_code=409, detail="Run already in progress")

        run.status = RunStatus.RUNNING
        run.updated_at = datetime.now(timezone.utc)
        self.session.commit()
        self.session.refresh(run)

        try:
            return self._execute_run(run)
        except Exception as exc:
            run.status = RunStatus.FAILED
            run.note = f"Run failed: {exc}"
            run.updated_at = datetime.now(timezone.utc)
            self.session.commit()
            traceback.print_exc()
            raise

    def _execute_run(self, run: Run) -> Run:
        paths = self._ensure_paths(run)

        store_uploads = self.session.exec(select(StoreUpload).where(StoreUpload.run_id == run.id)).all()
        if not store_uploads:
            raise HTTPException(status_code=400, detail="Run has no store uploads")

        store_files: List[Dict[str, Any]] = []
        for store_upload in store_uploads:
            store_files.append(
                {
                    "path": store_upload.file_path,
                    "store_name": store_upload.store_name,
                    "contribution_pct": store_upload.contribution_pct,
                    "label": store_upload.store_name,
                }
            )

        outputs = po_calculator.compute_outputs(
            store_files,
            supplier_path=Path(paths["supplier"]),
            store_contrib_path=Path(paths["store_contrib"]),
            padang_path=Path(paths["padang"]) if "padang" in paths else None,
        )

        drive_client = self._get_drive_client()

        for label, merged_df, summary in outputs:
            complete_path = self.storage.build_output_path(label, ResultVariant.COMPLETE)
            po_calculator.save_to_csv(merged_df, complete_path)

            m2_path = self.storage.build_output_path(label, ResultVariant.M2)
            po_calculator.save_to_m2_format(merged_df, m2_path)

            emergency_path = self.storage.build_output_path(label, ResultVariant.EMERGENCY)
            po_calculator.save_to_emergency_format(merged_df, emergency_path)

            for variant, path in [
                (ResultVariant.COMPLETE, complete_path),
                (ResultVariant.M2, m2_path),
                (ResultVariant.EMERGENCY, emergency_path),
            ]:
                drive_url = None
                if drive_client:
                    uploaded = drive_client.upload_file(path, filename=path.name)
                    drive_url = uploaded.get("webViewLink") or uploaded.get("webContentLink")
                result = POResult(
                    run_id=run.id,
                    store_name=summary["location"],
                    variant=variant,
                    local_path=str(path),
                    drive_url=drive_url,
                    contribution_pct=summary["contribution_pct"],
                )
                self.session.add(result)

        run.status = RunStatus.READY
        run.updated_at = datetime.now(timezone.utc)
        run.note = f"Processed {len(outputs)} stores"
        self.session.commit()
        self.session.refresh(run)
        return run
