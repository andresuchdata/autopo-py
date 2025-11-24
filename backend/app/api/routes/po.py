from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import List, Optional
from app.services.po_processor import POProcessor
import shutil
import os
import pandas as pd
import numpy as np

router = APIRouter()
processor = POProcessor()

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    uploaded_filenames = []
    try:
        for file in files:
            file_path = processor.upload_dir / file.filename
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            uploaded_filenames.append(file.filename)
        
        return {"status": "success", "uploaded_files": uploaded_filenames}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload files: {str(e)}")

@router.post("/process")
async def process_po(
    files: List[UploadFile] = File(...),
    supplier_file: Optional[UploadFile] = File(None),
    contribution_file: Optional[UploadFile] = File(None)
):
    try:
        # Save all uploaded files
        saved_filenames = []
        for file in files:
            file_path = processor.upload_dir / file.filename
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_filenames.append(file.filename)
            
        # Handle optional supplier file
        supplier_path = None
        if supplier_file:
            supplier_path = processor.upload_dir / "supplier_data.csv" # Standardize name
            with supplier_path.open("wb") as buffer:
                shutil.copyfileobj(supplier_file.file, buffer)
                
        # Handle optional contribution file
        if contribution_file:
            contrib_path = processor.upload_dir / "store_contribution.csv" # Standardize name
            with contrib_path.open("wb") as buffer:
                shutil.copyfileobj(contribution_file.file, buffer)

        # Process
        result = processor.process_files(saved_filenames, str(supplier_path) if supplier_path else None)
        
        if result["status"] == "error":
            return JSONResponse(
                status_code=500,
                content={"message": result["message"]}
            )
            
        return result
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"message": f"Processing failed: {str(e)}"}
        )

@router.get("/results")
async def get_results():
    try:
        output_file = processor.output_dir / "result.csv"
        if not output_file.exists():
            return {"data": []}
            
        df = pd.read_csv(output_file)
        df = df.replace({np.nan: None})
        
        return {
            "data": df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")

@router.get("/suppliers")
async def get_suppliers():
    try:
        suppliers = processor.get_supplier_data()
        return {"data": suppliers}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading suppliers: {str(e)}")

@router.get("/contributions")
async def get_contributions():
    try:
        contributions = processor.get_contribution_data()
        return {"data": contributions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading contributions: {str(e)}")
