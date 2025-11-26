#!/usr/bin/env python3
"""Test store name matching with contribution file."""

import sys
sys.path.insert(0, '/Users/andresuchitra/dev/missglam/autopo/backend')

from app.services.po_processor import POProcessor
from pathlib import Path

# Initialize processor
processor = POProcessor()

# Test filenames from the actual uploads
test_filenames = [
    "1.Miss glam Padang.xlsx",
    "2.Miss glam Pekanbaru.xlsx",
    "3.Miss glam Jambi.xlsx",
    "4.Miss glam Bukittinggi.xlsx",
    "5.Miss glam Panam.xlsx",
    "6.Miss glam Muaro bungo.xlsx",
    "7.Miss glam Lampung.xlsx",
    "8.Miss glam Bengkulu.xlsx",
    "9.Miss glam Medan.xlsx",
    "10.Miss glam Palembang.xlsx",
    "11.Miss glam Damar.xlsx",
    "12.Miss glam Bangka.xlsx",
    "13.Miss glam Payakumbuh.xlsx",
    "14.Miss glam Solok.xlsx",
    "15.Miss glam Tembilahan.xlsx",
    "16.Miss glam Lubuk Linggau.xlsx",
    "17.Miss glam Dumai.xlsx",
    "26. Miss Glam dr Mansur .xlsx",
    "32. Miss Glam Soeta.xlsx",
    "33. Miss Glam Balikpapan.xlsx",
]

print("Testing store name extraction and contribution lookup:")
print("=" * 80)

# Load contribution data
contrib_file = Path("../data/store_contribution.csv")
if contrib_file.exists():
    store_contrib = processor.load_store_contribution(contrib_file)
    print(f"Loaded {len(store_contrib)} store contributions\n")
    
    for filename in test_filenames:
        location = processor.get_store_name_from_filename(filename)
        contrib_pct = processor.get_contribution_pct(location, store_contrib)
        status = "✓" if contrib_pct < 100 else "⚠"
        print(f"{status} {filename:40} -> {location:20} ({contrib_pct}%)")
else:
    print(f"Contribution file not found: {contrib_file}")
