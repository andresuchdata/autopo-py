import numpy as np
from pathlib import Path
from dotenv import load_dotenv
import pandas as pd
import os


raw_files = os.listdir('data/rawpo/xlsx')
display(raw_files)

def convert_xlsx_to_csv(directory):
    """
    Convert all .xlsx files in the specified directory to .csv format.
    Skips files that already have a corresponding .csv file.
    
    Args:
        directory (str): Path to the directory containing .xlsx files
    """
    # Convert to Path object for easier handling
    dir_path = Path(directory)
    
    # Find all .xlsx files in the directory
    xlsx_files = list(dir_path.glob('*.xlsx'))
    
    if not xlsx_files:
        print(f"No .xlsx files found in {directory}")
        return
    
    print(f"Found {len(xlsx_files)} .xlsx files to process...")
    
    for xlsx_file in xlsx_files:
        # Create output filename with .csv extension
        csv_file = xlsx_file.with_suffix('.csv')
        
        # Skip if CSV already exists
        if csv_file.exists():
            print(f"Skipping {xlsx_file.name} - {csv_file.name} already exists")
            continue
            
        try:
            # Read the Excel file
            print(f"\n===========================================Converting {xlsx_file.name} to {csv_file.name}...")
            df = pd.read_excel(xlsx_file)
            
            # Write to CSV
            df.to_csv(csv_file, index=False, encoding='utf-8')
            print(f"Successfully created {csv_file.name}")
            
        except Exception as e:
            print(f"Error processing {xlsx_file.name}: {str(e)}")
    
    print("Conversion complete!")

# Example usage:
convert_xlsx_to_csv('data/rawpo/xlsx')
# Read the Excel file, converting 'INF' to numpy.inf
ori_df = pd.read_csv('data/rawpo/01 Miss Glam Padang.csv', sep=';', decimal=',')

# Convert all numeric columns, handling infinity and NaN values
for col in ori_df.select_dtypes(include=[np.number]).columns:
    ori_df[col] = pd.to_numeric(ori_df[col], errors='coerce')

df = ori_df.copy()
df = df.rename(columns={'Stok': 'Stock'})

pd.set_option('display.max_columns', None)

# extract only the columns we need
display(df.info())
df = df[['Brand', 'SKU', 'Nama', 'Stock', 'Daily Sales', 'Max. Daily Sales', 'Lead Time', 'Max. Lead Time', 'Sedang PO', 'Min. Order', 'HPP']]

display(df)

# contribution dictionary for each store location
contribution_dict = {
    'payakumbuh': 0.47,
}
# supplier mapping
# to map an SKU and brand to specific supplier

raw_supplier_df = pd.read_csv('data/supplier.csv', sep=';', decimal=',')
raw_supplier_df = raw_supplier_df.fillna('')

display(raw_supplier_df)
# First, convert object columns to numeric where possible
numeric_columns = ['Stock', 'Daily Sales', 'Lead Time', 'Max. Daily Sales', 'Max. Lead Time']

df_clean = df.copy()
display('Raw DataFrame: ', df)

# Convert all columns to numeric, coercing errors to NaN
for col in numeric_columns:
    df_clean[col] = pd.to_numeric(df_clean[col], errors='coerce')

# Now fill NA with 0 and convert to int
df_clean = df_clean.fillna(0)

# For non-numeric columns, keep them as they are
non_numeric_columns = ['Brand', 'SKU']  # Add other non-numeric columns if needed
for col in non_numeric_columns:
    df_clean[col] = df[col]  # Keep original values

# add new column 'Lead Time Sedang PO' default to 2 days
df_clean['Lead Time Sedang PO'] = 5

# Display the cleaned DataFrame
print("Cleaned DataFrame:")
display(df_clean)

# Show info of the cleaned DataFrame
print("\nDataFrame Info: Expected to have maximal non-null values...")
df_clean.info()
pd.set_option('display.float_format', '{:.2f}'.format)

# 1. Safety stock = (max sales x max lead time) - (avg sales x avg lead time)
df_clean['Safety stock'] = (df_clean['Max. Daily Sales'] * df_clean['Max. Lead Time']) - (df_clean['Daily Sales'] * df_clean['Lead Time'])
# round up safety stock
df_clean['Safety stock'] = df_clean['Safety stock'].apply(lambda x: np.ceil(x)).astype(int)

# 2. Reorder point = (avg sales x avg lead time) + safety stock
df_clean['Reorder point'] = np.ceil((df_clean['Daily Sales'] * df_clean['Lead Time']) + 
                                   df_clean['Safety stock']).astype(int)

# 3. Stock cover days (in Qty) for 30 days = avg sales x 30 
df_clean['Stock cover 30 days'] = df_clean['Daily Sales'] * 30
df_clean['Stock cover 30 days'] = df_clean['Stock cover 30 days'].apply(lambda x: np.ceil(x)).astype(int)

# 5. Current stock days cover (in days) = Current stock / avg sales
df_clean['current_stock_days_cover'] = (df_clean['Stock'].astype(float) * 1.0 ) / df_clean['Daily Sales'].astype(float)

# 6. Is_open_po (1 -> Current stock < Reorder point, 0 -> otherwise)
df_clean['is_open_po'] = np.where((df_clean['current_stock_days_cover'] <= 30) & (df_clean['Stock'] <= df_clean['Reorder point']), 1, 0)

# 7. Initial_Qty_PO = Stock cover 30 days - Current stock - sedang PO
df_clean['initial_qty_po'] = df_clean['Stock cover 30 days'] - df_clean['Stock'] - df_clean['Sedang PO']
df_clean['initial_qty_po'] = np.where(df_clean['is_open_po'] == 1, df_clean['initial_qty_po'], 0)
df_clean['initial_qty_po'] = df_clean['initial_qty_po'].apply(lambda x: x if x > 0 else 0).astype(int)

# 9. Emergency_PO_Qty = (max lead time - Current stock days cover) x Avg sales
# First, ensure 'Sedang PO' column exists and handle potential missing values
if 'Sedang PO' not in df_clean.columns:
    df_clean['Sedang PO'] = 0  # Default to 0 if column doesn't exist

# Calculate emergency_po_qty based on the condition
df_clean['emergency_po_qty'] = np.where(
    df_clean['Sedang PO'] > 0,  # If there is 'Sedang PO' quantity
    np.maximum(0, (df_clean['Lead Time Sedang PO'] - df_clean['current_stock_days_cover']) * 
              df_clean['Daily Sales']),
    # Else use the original formula
    np.ceil((df_clean['Max. Lead Time'] - df_clean['current_stock_days_cover']) * 
            df_clean['Daily Sales'])
)

# First, handle any infinite values and NaN values
df_clean['emergency_po_qty'] = (
    df_clean['emergency_po_qty']
    .replace([np.inf, -np.inf], 0)  # Replace infinities with 0
    .fillna(0)                      # Fill any remaining NaNs with 0
    .astype(int)                    # Now safely convert to integers
)

# If you want to ensure no negative values (since it's a quantity)
df_clean['emergency_po_qty'] = df_clean['emergency_po_qty'].clip(lower=0)

# calculate updated po quantity
df_clean['updated_regular_po_qty'] = df_clean['initial_qty_po'] - df_clean['emergency_po_qty']
df_clean['updated_regular_po_qty'] = df_clean['updated_regular_po_qty'].apply(lambda x: x if x > 0 else 0).astype(int)

# Final check updated regular PO - if less than Min. Order, use Min. Order qty
df_clean['final_updated_regular_po_qty'] = np.where((df_clean['updated_regular_po_qty'] > 0) & (df_clean['updated_regular_po_qty'] < df_clean['Min. Order']), df_clean['Min. Order'], df_clean['updated_regular_po_qty'])


# Calculate total cost (HPP * qty) for emergency PO and final updated regular PO
df_clean['total_cost_emergency_po'] = df_clean['emergency_po_qty'] * df_clean['HPP']
df_clean['total_cost_final_updated_regular_po'] = df_clean['final_updated_regular_po_qty'] * df_clean['HPP']

# Handle any NaN or infinite values by replacing them with 0
df_clean = df_clean.fillna(0)
df_clean = df_clean.replace([np.inf, -np.inf], 0)

# Display the updated DataFrame with new columns
df_clean
# Create output directory if it doesn't exist
os.makedirs('output', exist_ok=True)

# Export to CSV
csv_path = 'output/result.csv'
df_clean.to_csv(csv_path, index=False, sep=';', encoding='utf-8-sig')
print(f"CSV file saved to: {csv_path}")
import pandas as pd
import numpy as np

# Make copies to avoid modifying originals
df_clean_trimmed = df_clean.copy()
raw_supplier_trimmed = raw_supplier_df.copy()

# Trim whitespace from brand names
df_clean_trimmed['Brand'] = df_clean_trimmed['Brand'].str.strip()
raw_supplier_trimmed['Nama Brand'] = raw_supplier_trimmed['Nama Brand'].str.strip()

# First, get all Padang suppliers
padang_suppliers = raw_supplier_trimmed[
    raw_supplier_trimmed['Nama Store'] == 'Miss Glam Padang'
]

# Then get all other suppliers (non-Padang)
other_suppliers = raw_supplier_trimmed[
    raw_supplier_trimmed['Nama Store'] != 'Miss Glam Padang'
]

# Step 1: Left join with Padang suppliers first (priority)
merged_df = pd.merge(
    df_clean_trimmed,
    padang_suppliers,
    left_on='Brand',
    right_on='Nama Brand',
    how='left',
    suffixes=('_clean', '_supplier')
)

# Step 2: For rows without Padang supplier, try to find other suppliers
# Get the indices of rows that didn't get a match with Padang suppliers
no_padang_match = merged_df[merged_df['Nama Brand'].isna()].index

if len(no_padang_match) > 0:
    # Get the brands that need non-Padang suppliers
    brands_needing_suppliers = merged_df.loc[no_padang_match, 'Brand'].unique()
    
    # Get the first matching supplier for each brand (you can change this logic if needed)
    first_supplier_per_brand = other_suppliers.drop_duplicates(subset='Nama Brand')
    
    # Update the rows that didn't have Padang suppliers
    for brand in brands_needing_suppliers:
        supplier_data = first_supplier_per_brand[first_supplier_per_brand['Nama Brand'] == brand]
        if not supplier_data.empty:
            # Update the corresponding rows in merged_df
            brand_mask = (merged_df['Brand'] == brand) & (merged_df['Nama Brand'].isna())
            for col in supplier_data.columns:
                if col in merged_df.columns and col != 'Brand':  # Don't overwrite the Brand column
                    merged_df.loc[brand_mask, col] = supplier_data[col].values[0]

# Clean up: For any remaining NaN values in supplier columns, fill with empty string or as needed
supplier_columns = [
    'ID Supplier', 'Nama Supplier', 'ID Brand', 'ID Store', 
    'Nama Store', 'Hari Order', 'Min. Purchase', 'Trading Term',
    'Promo Factor', 'Delay Factor'
]

for col in supplier_columns:
    if col in merged_df.columns:
        if merged_df[col].dtype == 'object':
            merged_df[col] = merged_df[col].fillna('')
        else:
            merged_df[col] = merged_df[col].fillna(0)

# Show summary
print(f"Total rows in df_clean: {len(df_clean_trimmed)}")
print(f"Total rows after merge: {len(merged_df)}")

# Count how many rows got Padang suppliers vs other suppliers vs no suppliers
padang_count = (merged_df['Nama Store'] == 'Miss Glam Padang').sum()
other_supplier_count = ((merged_df['Nama Store'] != 'Miss Glam Padang') & 
                       (merged_df['Nama Store'] != '')).sum()
no_supplier = (merged_df['Nama Store'] == '').sum()

print(f"\nSuppliers matched:")
print(f"- 'Miss Glam Padang' suppliers: {padang_count} rows")
print(f"- Other suppliers: {other_supplier_count} rows")
print(f"- No supplier data: {no_supplier} rows")

# Save the result
os.makedirs('output', exist_ok=True)
output_path = 'output/merged_with_suppliers.csv'
merged_df.to_csv(output_path, index=False, sep=';', encoding='utf-8-sig')
print(f"\nResults saved to: {output_path}")

# Show a sample of the results
print("\nSample of merged data (first 5 rows):")
display(merged_df.head())
# Merge df_clean with raw_supplier_df to see all supplier matches
all_suppliers_merge = pd.merge(
    df_clean_trimmed,
    raw_supplier_trimmed,
    left_on='Brand',
    right_on='Nama Brand',
    how='left'
)

# Group by Brand and SKU to count unique suppliers
supplier_counts = all_suppliers_merge.groupby(['Brand', 'SKU'])['Nama Supplier'].nunique().reset_index()
supplier_counts.columns = ['Brand', 'SKU', 'Supplier_Count']

# Filter for brands/SKUs with multiple suppliers
multi_supplier_items = supplier_counts[supplier_counts['Supplier_Count'] > 1]

print(f"Found {len(multi_supplier_items)} brand/SKU combinations with multiple suppliers")
print("\nSample of items with multiple suppliers:")
display(multi_supplier_items.head())

# If you want to see the actual supplier details for these items
if not multi_supplier_items.empty:
    print("\nDetailed supplier information for multi-supplier items:")
    multi_supplier_details = all_suppliers_merge.merge(
        multi_supplier_items[['Brand', 'SKU']],
        on=['Brand', 'SKU']
    )
    display(multi_supplier_details[['Brand', 'SKU', 'Nama Supplier', 'Nama Store']].drop_duplicates().sort_values(['Brand', 'SKU']))

    # List of SKUs to check
skus_to_check = [
    '8995232702124',  # ACNEMED
    '8992821100293',  # ACNES
    '8992821100309',  # ACNES
    '8992821100323',  # ACNES
    '8992821100354'   # ACNES
]

# Convert SKUs to integers (since they appear as integers in df_clean)
skus_to_check = [int(sku) for sku in skus_to_check]

# Check if these SKUs exist in df_clean
found_skus = merged_df[merged_df['SKU'].isin(skus_to_check)]

if not found_skus.empty:
    print("Found matching SKUs in df_clean:")
    display(found_skus[['Brand', 'SKU', 'Nama']])
else:
    print("None of these SKUs were found in df_clean.")
    print("\nChecking if there are any similar SKUs...")
    
    # Check for any SKUs that contain these numbers
    for sku in skus_to_check:
        similar = merged_df[merged_df['SKU'].astype(str).str.contains(str(sku)[:8])]
        if not similar.empty:
            print(f"\nSKUs similar to {sku}:")
            display(similar[['Brand', 'SKU', 'Nama']])
    
    # Check the data types to ensure we're comparing correctly
    print("\nData type of SKU column:", merged_df['SKU'].dtype)
    print("Sample SKUs from df_clean:", merged_df['SKU'].head().tolist())
# Find brands in df_clean that don't have a match in raw_supplier_df
missing_brands = set(df_clean['Brand']) - set(raw_supplier_df['Nama Brand'].dropna().unique())

print(f"Number of brands in df_clean: {len(df_clean['Brand'].unique())}")
print(f"Number of brands in raw_supplier_df: {len(raw_supplier_df['Nama Brand'].unique())}")
print(f"\nNumber of brands missing supplier data: {len(missing_brands)}")
print("\nFirst 20 missing brands (alphabetical order):")
print(sorted(list(missing_brands))[:20])

# Count how many rows are affected per missing brand
missing_brand_counts = df_clean[df_clean['Brand'].isin(missing_brands)]['Brand'].value_counts()
print("\nTop 20 missing brands by row count:")
print(missing_brand_counts)
import os
import pandas as pd

# Create output directory
output_dir = 'output_po'
os.makedirs(output_dir, exist_ok=True)

# Create a directory for brands without suppliers
no_supplier_dir = os.path.join(output_dir, '0_no_suppliers')
os.makedirs(no_supplier_dir, exist_ok=True)

# Function to sanitize folder names
def sanitize_folder_name(name):
    # Remove or replace invalid characters
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.strip()

# Process each group
for (supplier_id, supplier_name, brand), group in final_df.groupby(['ID Supplier', 'Nama Supplier', 'Brand']):
    # Skip if no supplier (shouldn't happen as we replaced NaN with defaults)
    if pd.isna(supplier_id) or not supplier_name:
        # Save to no_supplier_dir
        brand_file = os.path.join(no_supplier_dir, f'{sanitize_folder_name(brand)}.csv')
        group.to_csv(brand_file, index=False, sep=';', encoding='utf-8-sig')
        continue
    
    # Create supplier directory
    supplier_dir = os.path.join(output_dir, f'{int(supplier_id)}_{sanitize_folder_name(supplier_name)}')
    os.makedirs(supplier_dir, exist_ok=True)
    
    # Save brand file
    brand_file = os.path.join(supplier_dir, f'{sanitize_folder_name(brand)}.csv')
    group.to_csv(brand_file, index=False, sep=';', encoding='utf-8-sig')

print("Data has been organized into supplier and brand-based folders in 'output_po'")
def merge_with_suppliers(df_clean, supplier_df):
    """Merge PO data with supplier information."""
    print("Merging with suppliers...")
    
    # Clean supplier data
    supplier_clean = supplier_df.copy()
    supplier_clean['Nama Brand'] = supplier_clean['Nama Brand'].astype(str).str.strip()
    supplier_clean['Nama Store'] = supplier_clean['Nama Store'].astype(str).str.strip()
    
    # Deduplicate to prevent row explosion - Unique Brand+Store
    supplier_clean = supplier_clean.drop_duplicates(subset=['Nama Brand', 'Nama Store'])
    
    # Ensure PO data has clean columns for merging
    df_clean['Brand'] = df_clean['Brand'].astype(str).str.strip()
    df_clean['Toko'] = df_clean['Toko'].astype(str).str.strip()
    
    # 1. Primary Merge: Match on Brand AND Store (Toko)
    # This prioritizes the specific supplier for that store
    merged_df = pd.merge(
        df_clean,
        supplier_clean,
        left_on=['Brand', 'Toko'],
        right_on=['Nama Brand', 'Nama Store'],
        how='left',
        suffixes=('_clean', '_supplier')
    )
    
    # 2. Fallback: For unmatched rows, try to find ANY supplier for that Brand
    # Identify rows where merge failed (Nama Brand is NaN)
    unmatched_mask = merged_df['Nama Brand'].isna()
    
    if unmatched_mask.any():
        print(f"Found {unmatched_mask.sum()} rows without direct store match. Attempting fallback...")
        
        # Get the unmatched rows and drop the empty supplier columns
        unmatched_rows = merged_df[unmatched_mask].copy()
        supplier_cols = [col for col in supplier_clean.columns if col in unmatched_rows.columns and col != 'Brand']
        unmatched_rows = unmatched_rows.drop(columns=supplier_cols)
        
        # Create fallback supplier list (one per brand)
        # We take the first one found for each brand
        fallback_suppliers = supplier_clean.drop_duplicates(subset=['Nama Brand'])
        
        # Merge unmatched rows with fallback suppliers
        matched_fallback = pd.merge(
            unmatched_rows,
            fallback_suppliers,
            left_on='Brand',
            right_on='Nama Brand',
            how='left',
            suffixes=('_clean', '_supplier')
        )
        
        # Combine the initially matched rows with the fallback-matched rows
        matched_initial = merged_df[~unmatched_mask]
        merged_df = pd.concat([matched_initial, matched_fallback], ignore_index=True)
    
    # Clean up supplier columns
    supplier_columns = [
        'ID Supplier', 'Nama Supplier', 'ID Brand', 'ID Store', 
        'Nama Store', 'Hari Order', 'Min. Purchase', 'Trading Term',
        'Promo Factor', 'Delay Factor'
    ]
    for col in supplier_columns:
        if col in merged_df.columns:
            merged_df[col] = merged_df[col].fillna('' if merged_df[col].dtype == 'object' else 0)
    
    return merged_df
