#!/usr/bin/env python3
"""Test script using the patched po_processor module."""

import sys
sys.path.insert(0, '/Users/andresuchitra/dev/missglam/autopo/backend')

# Import the module with the monkey-patch
from app.services.po_processor import POProcessor

from pathlib import Path

# Test reading one of the problematic Excel files
test_file = Path("data/uploads/28. Miss Glam Aceh.xlsx")

if test_file.exists():
    print(f"\nTesting with patched POProcessor: {test_file}")
    print("-" * 50)
    
    processor = POProcessor()
    df = processor.read_csv_file(test_file)
    
    if df is not None:
        print(f"✓ SUCCESS! Read Excel file successfully")
        print(f"  Shape: {df.shape}")
        print(f"  Columns: {list(df.columns)[:10]}")
        print(f"\n  First row sample:")
        for col in list(df.columns)[:5]:
            print(f"    {col}: {df[col].iloc[0]}")
    else:
        print(f"✗ FAILED: Could not read the file")
else:
    print(f"Test file not found: {test_file}")
