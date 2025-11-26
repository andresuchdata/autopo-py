#!/usr/bin/env python3
"""Test script using openpyxl directly."""

import pandas as pd
from pathlib import Path
import openpyxl

# Test reading one of the problematic Excel files
test_file = Path("data/uploads/28. Miss Glam Aceh.xlsx")

if test_file.exists():
    print(f"Testing: {test_file}")
    print("-" * 50)
    
    # Test with openpyxl directly
    print("\n1. Using openpyxl directly with data_only=True:")
    try:
        # Open workbook with data_only=True to read values, not formulas
        wb = openpyxl.load_workbook(test_file, data_only=True)
        ws = wb.active
        print(f"   ✓ Opened workbook successfully")
        print(f"   Worksheet: {ws.title}")
        print(f"   Dimensions: {ws.dimensions}")
        
        # Try to read first few rows
        print("\n   First 3 rows:")
        for i, row in enumerate(ws.iter_rows(values_only=True), 1):
            if i <= 3:
                print(f"   Row {i}: {row[:5]}...")
            else:
                break
                
    except Exception as e:
        print(f"   ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 2: pd.read_excel with engine='openpyxl' and data_only
    print("\n2. Using pd.read_excel with engine_kwargs:")
    try:
        df = pd.read_excel(
            test_file, 
            engine='openpyxl',
            engine_kwargs={'data_only': True}
        )
        print(f"   ✓ Success! Shape: {df.shape}")
    except Exception as e:
        print(f"   ✗ Failed: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 50)
else:
    print(f"Test file not found: {test_file}")
