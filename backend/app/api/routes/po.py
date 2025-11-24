from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from typing import List, Optional
from app.services.po_processor import POProcessor
import shutil
import os

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
    supplier_file: Optional[UploadFile] = File(None),
    contribution_file: Optional[UploadFile] = File(None)
):
    try:
        # Save supplier file if provided
        supplier_path = None
        if supplier_file:
            supplier_path = processor.upload_dir / "supplier_data.csv"
            with open(supplier_path, "wb") as buffer:
                shutil.copyfileobj(supplier_file.file, buffer)
            supplier_path = str(supplier_path)
            
        # Save contribution file if provided
        if contribution_file:
            contrib_path = processor.upload_dir / "store_contribution.csv"
            with open(contrib_path, "wb") as buffer:
                shutil.copyfileobj(contribution_file.file, buffer)
        
        # Get all files in upload dir
        files = [f for f in os.listdir(processor.upload_dir) if f.endswith('.csv') or f.endswith('.xlsx')]
        
        result = processor.process_files(files, supplier_path)
        
        if result["status"] == "error":
             raise HTTPException(status_code=400, detail=result["message"])
             
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

@router.get("/results")
async def get_results():
    try:
        # For now, return the last processed result if available
        # In a real app, we might want to store results in a DB or cache
        # Here we re-read the output file
        output_file = processor.output_dir / "result.csv"
        if not output_file.exists():
            return {"data": [], "summary": None}
            
        import pandas as pd
        import numpy as np
        df = pd.read_csv(output_file, sep=';')
        df = df.replace([np.inf, -np.inf], 0).fillna(0)
        return {
            "status": "success",
            "data": df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")
