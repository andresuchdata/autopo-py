#!/usr/bin/env python3
"""Test store name extraction from various filename formats."""

import sys
import re
from pathlib import Path

def get_store_name_from_filename(filename: str) -> str:
    """Extract store name from filename, looking for text after 'glam'."""
    # Remove file extension
    name = Path(filename).stem
    
    # Use regex to find "glam" (case-insensitive) followed by the location
    # Pattern: optional number/dot/space, then "miss", then "glam", then capture everything after
    match = re.search(r'glam\s+(.+)', name, re.IGNORECASE)
    
    if match:
        # Extract the location part (everything after "glam ")
        location = match.group(1).strip()
        # Clean up: remove leading numbers, dots, spaces
        location = re.sub(r'^[\d\.\s]+', '', location).strip()
        return location.upper()
    
    # Fallback: if "glam" not found, try to extract from "Miss Glam X" pattern
    parts = name.split()
    for i, part in enumerate(parts):
        if part.lower() == 'glam' and i + 1 < len(parts):
            # Return everything after "glam"
            return ' '.join(parts[i+1:]).strip().upper()
    
    # Last resort: return the whole name without extension
    return name.upper()

# Test cases
test_filenames = [
    "1.Miss glam Padang.xlsx",
    "1. Miss glam Padang.xlsx",
    "01 Miss Glam Padang.csv",
    "002 Miss Glam Pekanbaru.csv",
    "Miss glam Medan.xlsx",
    "7.Miss glam Lampung.xlsx",
    "10.Miss glam Palembang.xlsx",
    "28. Miss Glam Aceh.xlsx",
    "33. Miss Glam Balikpapan.xlsx",
    "26. Miss Glam dr Mansur .xlsx",
    "Miss Glam Soeta.xlsx",
]

print("Testing store name extraction:")
print("=" * 70)
for filename in test_filenames:
    location = get_store_name_from_filename(filename)
    print(f"{filename:40} -> {location}")
