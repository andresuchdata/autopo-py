#!/usr/bin/env python3
"""Test script to verify Excel reading with NAN/INF values."""

import pandas as pd
from pathlib import Path

# Test reading one of the problematic Excel files
test_file = Path("data/uploads/28. Miss Glam Aceh.xlsx")

if test_file.exists():
    print(f"Testing: {test_file}")
    print("-" * 50)
    
    # Test 1: Read without parameters (the failing case)
    print("\n1. Reading WITHOUT dtype=str and na_filter=False:")
    try:
        df1 = pd.read_excel(test_file)
        print(f"   ✓ Success! Shape: {df1.shape}")
        print(f"   Columns: {list(df1.columns)[:5]}...")
    except Exception as e:
        print(f"   ✗ Failed: {e}")
    
    # Test 2: Read with dtype=str only
    print("\n2. Reading WITH dtype=str:")
    try:
        df2 = pd.read_excel(test_file, dtype=str)
        print(f"   ✓ Success! Shape: {df2.shape}")
        print(f"   Columns: {list(df2.columns)[:5]}...")
    except Exception as e:
        print(f"   ✗ Failed: {e}")
    
    # Test 3: Read with dtype=str and na_filter=False
    print("\n3. Reading WITH dtype=str AND na_filter=False:")
    try:
        df3 = pd.read_excel(test_file, dtype=str, na_filter=False)
        print(f"   ✓ Success! Shape: {df3.shape}")
        print(f"   Columns: {list(df3.columns)[:5]}...")
        print(f"\n   Sample data types: {df3.dtypes[:5]}")
        print(f"\n   First row sample: {df3.iloc[0][:5].to_dict()}")
    except Exception as e:
        print(f"   ✗ Failed: {e}")
    
    print("\n" + "=" * 50)
else:
    print(f"Test file not found: {test_file}")
    print("Please ensure you have uploaded the Excel files to data/uploads/")
