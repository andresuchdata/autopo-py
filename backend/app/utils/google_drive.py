from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from app.core.config import get_settings

SCOPES = ["https://www.googleapis.com/auth/drive"]


class GoogleDriveNotConfigured(Exception):
    """Raised when Google Drive integration is requested but not configured."""


class GoogleDriveClient:
    def __init__(self) -> None:
        settings = get_settings()
        if not settings.google_service_account_file:
            raise GoogleDriveNotConfigured("Google Drive credentials not configured.")

        credentials = service_account.Credentials.from_service_account_file(
            settings.google_service_account_file,
            scopes=SCOPES,
        )

        self.service = build("drive", "v3", credentials=credentials)
        self.default_folder_id = settings.google_drive_folder_id

    def download_file(self, file_id: str, destination: Path) -> dict:
        request = self.service.files().get_media(fileId=file_id)
        fh = io.FileIO(destination, "wb")
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            status, done = downloader.next_chunk()
        fh.close()
        metadata = (
            self.service.files()
            .get(fileId=file_id, fields="id,name,mimeType,webViewLink,webContentLink")
            .execute()
        )
        return metadata

    def upload_file(self, file_path: Path, filename: Optional[str] = None, folder_id: Optional[str] = None) -> dict:
        metadata: dict = {"name": filename or file_path.name}
        target_folder = folder_id or self.default_folder_id
        if target_folder:
            metadata["parents"] = [target_folder]

        media = MediaFileUpload(file_path, resumable=True)
        try:
            file = (
                self.service.files()
                .create(body=metadata, media_body=media, fields="id,webViewLink,webContentLink")
                .execute()
            )
        except HttpError as exc:  # pragma: no cover - network errors
            raise RuntimeError(f"Google Drive upload failed: {exc}") from exc

        # Attempt to make the file accessible via link if a folder was provided
        if target_folder:
            try:
                self.service.permissions().create(
                    fileId=file["id"],
                    body={"type": "anyone", "role": "reader"},
                    fields="id",
                ).execute()
            except HttpError:
                pass  # best effort only

        return file
