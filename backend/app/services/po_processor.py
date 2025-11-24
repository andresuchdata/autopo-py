import pandas as pd
import numpy as np
from pathlib import Path
import os
from typing import List, Dict, Any, Optional
import shutil
import re

# Monkey-patch openpyxl to handle 'NAN' and 'INF' strings in numeric cells
# This fixes Excel files where cells are marked as numeric but contain text like 'NAN' or 'INF'
try:
    from openpyxl.worksheet import _reader
    
    # Store original function
    _original_cast_number = _reader._cast_number
    
    def _patched_cast_number(value):
        """Patched version that handles NAN/INF strings gracefully."""
        if isinstance(value, str):
            value_upper = value.upper().strip()
            if value_upper in ('NAN', 'INF', '-INF', '#N/A', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#NULL!'):
                return 0  # Return 0 for any Excel error or NAN/INF
        try:
            return _original_cast_number(value)
        except (ValueError, TypeError):
            # If conversion fails, return the string as-is
            return str(value) if value is not None else ''
    
    # Apply the patch
    _reader._cast_number = _patched_cast_number
    print("✓ Applied openpyxl monkey-patch for NAN/INF handling")
except Exception as e:
    print(f"⚠ Warning: Could not apply openpyxl patch: {e}")


class POProcessor:
    def __init__(self, upload_dir: str = "data/uploads", output_dir: str = "data/output"):
        self.upload_dir = Path(upload_dir)
        self.output_dir = Path(output_dir)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Ensure subdirectories exist
        (self.output_dir / "complete").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "m2").mkdir(parents=True, exist_ok=True)
        (self.output_dir / "emergency").mkdir(parents=True, exist_ok=True)

    def get_store_name_from_filename(self, filename: str) -> str:
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

    def read_csv_file(self, file_path: Path) -> Optional[pd.DataFrame]:
        # Handle Excel files
        if file_path.suffix.lower() in ['.xlsx', '.xls']:
            try:
                # Read Excel with default engine (openpyxl for xlsx)
                # Use dtype=str AND na_filter=False to prevent pandas/openpyxl from trying to 
                # interpret 'NAN'/'INF' strings as special values
                # We will handle type conversion and NA values in clean_po_data
                df = pd.read_excel(file_path, dtype=str, na_filter=False)
                return df
            except Exception as e:
                print(f"Error reading Excel file {file_path}: {e}")
                return None

        # List of (separator, encoding) combinations to try
        formats_to_try = [
            (',', 'utf-8'),      # Standard CSV with comma
            (';', 'utf-8'),      # Semicolon with UTF-8
            (',', 'latin1'),     # Comma with Latin1
            (';', 'latin1'),     # Semicolon with Latin1
            (',', 'cp1252'),     # Windows-1252 encoding
            (';', 'cp1252')
        ]
        
        for sep, enc in formats_to_try:
            try:
                df = pd.read_csv(
                    file_path,
                    sep=sep,
                    decimal=',',
                    thousands='.',
                    encoding=enc,
                    engine='python'  # More consistent behavior with Python engine
                )
                # If we get here, the file was read successfully
                if not df.empty:
                    return df
            except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError):
                continue  # Try next format
            except Exception as e:
                print(f"Unexpected error reading {file_path} with sep='{sep}', encoding='{enc}': {str(e)}")
                continue
        
        print(f"Failed to read {file_path} with any known format")
        return None

    def load_supplier_data(self, supplier_path: Path) -> pd.DataFrame:
        """Load and clean supplier data."""
        print("Loading supplier data...")
        try:
            df = pd.read_csv(supplier_path, sep=';', decimal=',').fillna('')
            if 'Nama Brand' in df.columns:
                df['Nama Brand'] = df['Nama Brand'].str.strip()
            return df
        except Exception as e:
            print(f"Error loading supplier data: {e}")
            return pd.DataFrame()

    def load_store_contribution(self, store_contribution_path: Path) -> pd.DataFrame:
        """Load and prepare store contribution data."""
        try:
            store_contrib = pd.read_csv(store_contribution_path, header=None, 
                                    names=['store', 'contribution_pct'])
            # Convert store names to lowercase for case-insensitive matching
            store_contrib['store_lower'] = store_contrib['store'].str.lower()
            return store_contrib
        except Exception as e:
            print(f"Error loading store contribution: {e}")
            return pd.DataFrame(columns=['store', 'contribution_pct', 'store_lower'])

    def get_contribution_pct(self, location: str, store_contrib: pd.DataFrame) -> float:
        """Get contribution percentage for a given location."""
        if store_contrib.empty:
            return 100.0
            
        location_lower = location.lower()
        contrib_row = store_contrib[store_contrib['store_lower'] == location_lower]
        if not contrib_row.empty:
            return float(contrib_row['contribution_pct'].values[0])
        print(f"Warning: No contribution percentage found for {location}")
        return 100.0

    def clean_po_data(self, df: pd.DataFrame, location: str, contribution_pct: float, padang_sales: Optional[pd.DataFrame]) -> pd.DataFrame:
        """Clean and prepare PO data with contribution calculations."""
        try:
            # Create a copy to avoid modifying the original DataFrame
            df = df.copy()

            # Keep original column names but strip any extra whitespace
            df.columns = df.columns.str.strip()

            # Define required columns (using original case)
            required_columns = [
                'Brand', 'SKU', 'Nama', 'Toko', 'Stok', 'Stock',
                'Daily Sales', 'Max. Daily Sales', 'Lead Time',
                'Max. Lead Time', 'Min. Order', 'Sedang PO', 'HPP'
            ]
            
            # Find actual column names in the DataFrame (case-sensitive)
            available_columns = {col.strip(): col for col in df.columns}
            columns_to_keep = []
            
            for col in required_columns:
                if col in available_columns:
                    columns_to_keep.append(available_columns[col])
                else:
                    # Add as empty column if it's required
                    if col in ['Brand', 'SKU', 'HPP']:  # These are critical
                        df[col] = ''
                        columns_to_keep.append(col)
                    elif col in ['Stok', 'Stock', 'Daily Sales', 'Max. Daily Sales', 'Lead Time', 'Max. Lead Time', 'Min. Order', 'Sedang PO']:
                        df[col] = 0
                        columns_to_keep.append(col)

            # Select only the columns we need
            # Filter out columns that might have been added but not in df yet
            valid_cols = [col for col in columns_to_keep if col in df.columns]
            df = df[valid_cols]

            # Clean brand column
            if 'Brand' in df.columns:
                df['Brand'] = df['Brand'].astype(str).str.strip()

            # Convert numeric columns with better error handling
            numeric_columns = [
                'Stok', 'Stock', 'Daily Sales', 'Max. Daily Sales', 'Lead Time',
                'Max. Lead Time', 'Sedang PO', 'HPP', 'Min. Order'
            ]

            for col in numeric_columns:
                if col in df.columns:
                    try:
                        # Handle string conversion carefully
                        # 1. Convert to string
                        # 2. Replace 'NAN', 'INF' (case insensitive) with '0'
                        # 3. Remove non-numeric chars except . , -
                        # 4. Replace , with .
                        # 5. Convert to float
                        
                        # Fill NA first to avoid 'nan' string
                        df[col] = df[col].fillna(0)
                        
                        df[col] = df[col].astype(str).str.upper()
                        df[col] = df[col].replace(['NAN', 'INF', '-INF', 'NONE', 'NULL'], '0')
                        
                        df[col] = (
                            df[col]
                            .str.replace(r'[^\d.,-]', '', regex=True)  # Remove non-numeric except .,-
                            .str.replace(',', '.', regex=False)         # Convert commas to decimal points
                            .replace('', '0')                           # Empty strings to '0'
                            .astype(float)                              # Convert to float
                            .fillna(0)                                  # Fill any remaining NaNs with 0
                        )
                    except Exception as e:
                        # print(f"Warning: Failed to convert column {col} to numeric: {e}")
                        df[col] = 0  # Set to 0 if conversion fails

            # Add contribution percentage and calculate costs
            contribution_pct = float(contribution_pct)
            df['contribution_pct'] = contribution_pct
            df['contribution_ratio'] = contribution_pct / 100.0

            # Add default values for other required columns
            if 'Lead Time Sedang PO' not in df.columns:
                df['Lead Time Sedang PO'] = 5 # Default value

            location_upper = location.upper()
            exempt_stores = {"PADANG", "SOETA", "BALIKPAPAN"}
            needs_padang_override = (location_upper not in exempt_stores) or (contribution_pct < 100)

            # Add 'Is in Padang' column
            if padang_sales is not None:
                padang_skus = set(padang_sales['SKU'].astype(str).unique())
                df['Is in Padang'] = df['SKU'].astype(str).isin(padang_skus).astype(int)
            else:
                df['Is in Padang'] = 0

            if not needs_padang_override:
                return df

            if padang_sales is None:
                # If Padang sales missing but needed, we can't override. 
                # Just return df as is but warn? Or raise error?
                # Notebook raises ValueError. We'll try to proceed without override to avoid crashing everything.
                print("Warning: Padang sales data required for override but not provided.")
                return df

            # Process Padang sales data
            padang_df = padang_sales.copy()
            padang_df.columns = padang_df.columns.str.strip()
            
            # Save original sales columns if they exist
            if 'Daily Sales' in df.columns:
                df['Orig Daily Sales'] = df['Daily Sales']
            if 'Max. Daily Sales' in df.columns:
                df['Orig Max. Daily Sales'] = df['Max. Daily Sales']

            contribution_ratio = contribution_pct / 100.0

            # Merge with Padang's sales data
            # Ensure SKU types match
            df['SKU'] = df['SKU'].astype(str)
            padang_df['SKU'] = padang_df['SKU'].astype(str)

            df = df.merge(
                padang_df[['SKU', 'Daily Sales', 'Max. Daily Sales']].rename(columns={
                    'Daily Sales': 'Padang Daily Sales',
                    'Max. Daily Sales': 'Padang Max Daily Sales'
                }),
                on='SKU',
                how='left'
            )

            # Calculate adjusted sales
            if 'Padang Daily Sales' in df.columns:
                df['Daily Sales'] = np.where(
                    df['Is in Padang'] == 1,
                    df['Padang Daily Sales'].fillna(0) * contribution_ratio,
                    df.get('Orig Daily Sales', 0)
                )
                
            if 'Padang Max Daily Sales' in df.columns:
                df['Max. Daily Sales'] = np.where(
                    df['Is in Padang'] == 1,
                    df['Padang Max Daily Sales'].fillna(0) * contribution_ratio,
                    df.get('Orig Max. Daily Sales', 0)
                )

            # Drop intermediate columns
            columns_to_drop = ['Padang Daily Sales', 'Padang Max Daily Sales', 'Orig Daily Sales', 'Orig Max. Daily Sales']
            df = df.drop(columns=[col for col in columns_to_drop if col in df.columns], errors='ignore')

            return df

        except Exception as e:
            print(f"Error in clean_po_data: {str(e)}")
            import traceback
            traceback.print_exc()
            return pd.DataFrame()

    def merge_with_suppliers(self, df_clean: pd.DataFrame, supplier_df: pd.DataFrame) -> pd.DataFrame:
        """Merge PO data with supplier information."""
        if supplier_df.empty:
            return df_clean

        # Ensure SKU types match for merging
        # Notebook merges on 'Brand' -> 'Nama Brand'
        # Let's follow notebook logic exactly
        
        # Get Padang suppliers (priority)
        padang_suppliers = supplier_df[supplier_df['Nama Store'] == 'Miss Glam Padang']
        other_suppliers = supplier_df[supplier_df['Nama Store'] != 'Miss Glam Padang']
        
        # First merge with Padang suppliers
        merged_df = pd.merge(
            df_clean,
            padang_suppliers,
            left_on='Brand',
            right_on='Nama Brand',
            how='left',
            suffixes=('_clean', '_supplier')
        )
        
        # Then try other suppliers for unmatched brands
        if 'Nama Brand' in merged_df.columns:
            no_padang_match = merged_df[merged_df['Nama Brand'].isna()].index
            if len(no_padang_match) > 0:
                brands_needing_suppliers = merged_df.loc[no_padang_match, 'Brand'].unique()
                first_supplier_per_brand = other_suppliers.drop_duplicates(subset='Nama Brand')
                
                for brand in brands_needing_suppliers:
                    supplier_data = first_supplier_per_brand[first_supplier_per_brand['Nama Brand'] == brand]
                    if not supplier_data.empty:
                        brand_mask = (merged_df['Brand'] == brand) & (merged_df['Nama Brand'].isna())
                        for col in supplier_data.columns:
                            if col in merged_df.columns and col != 'Brand':
                                merged_df.loc[brand_mask, col] = supplier_data[col].values[0]
        
        # Clean up supplier columns
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
                    # For numeric columns, fill with 0
                    merged_df[col] = merged_df[col].fillna(0)
        
        return merged_df

    def calculate_inventory_metrics(self, df_clean: pd.DataFrame) -> pd.DataFrame:
        """Calculate various inventory metrics."""
        df = df_clean.copy()
        
        # Normalise stock column name
        stock_col = 'Stok' if 'Stok' in df.columns else 'Stock'

        # Force numeric
        numeric_cols = [
            stock_col, 'Daily Sales', 'Max. Daily Sales', 'Lead Time',
            'Max. Lead Time', 'Sedang PO', 'HPP', 'Lead Time Sedang PO'
        ]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
        
        try:
            # 1. Safety stock
            df['Safety stock'] = (df['Max. Daily Sales'] * df['Max. Lead Time']) - (df['Daily Sales'] * df['Lead Time'])
            df['Safety stock'] = df['Safety stock'].apply(lambda x: np.ceil(x)).fillna(0).astype(int)
            
            # 2. Reorder point
            df['Reorder point'] = np.ceil((df['Daily Sales'] * df['Lead Time']) + df['Safety stock']).fillna(0).astype(int)
            
            # 3. Stock cover 30 days
            df['Stock cover 30 days'] = (df['Daily Sales'] * 30).apply(lambda x: np.ceil(x)).fillna(0).astype(int)
            
            # 4. Current stock days cover
            df['current_stock_days_cover'] = np.where(
                df['Daily Sales'] > 0,
                df[stock_col] / df['Daily Sales'],
                0
            )
            
            # 5. Is open PO
            df['is_open_po'] = np.where(
                (df['current_stock_days_cover'] < 30) & 
                (df[stock_col] <= df['Reorder point']), 1, 0
            )
            
            # 6. Initial PO qty
            df['initial_qty_po'] = df['Stock cover 30 days'] - df[stock_col] - df.get('Sedang PO', 0)
            df['initial_qty_po'] = np.where(df['is_open_po'] == 1, df['initial_qty_po'], 0)
            df['initial_qty_po'] = df['initial_qty_po'].clip(lower=0).astype(int)
            
            # 7. Emergency PO qty
            lead_time_sedang_po = df.get('Lead Time Sedang PO', 5) # Default to 5 if missing
            df['emergency_po_qty'] = np.where(
                df.get('Sedang PO', 0) > 0,
                np.maximum(0, (lead_time_sedang_po - df['current_stock_days_cover']) * df['Daily Sales']),
                np.ceil((df['Max. Lead Time'] - df['current_stock_days_cover']) * df['Daily Sales'])
            )
            df['emergency_po_qty'] = df['emergency_po_qty'].replace([np.inf, -np.inf], 0).fillna(0).clip(lower=0).astype(int)
            
            # 8. Updated regular PO
            df['updated_regular_po_qty'] = (df['initial_qty_po'] - df['emergency_po_qty']).clip(lower=0).astype(int)
            
            # 9. Final updated regular PO (Min Order)
            min_order = df.get('Min. Order', 1)
            df['final_updated_regular_po_qty'] = np.where(
                (df['updated_regular_po_qty'] > 0) & 
                (df['updated_regular_po_qty'] < min_order),
                min_order,
                df['updated_regular_po_qty']
            ).astype(int)
            
            # 10. Costs
            df['emergency_po_cost'] = (df['emergency_po_qty'] * df['HPP']).round(2)
            df['final_updated_regular_po_cost'] = (df['final_updated_regular_po_qty'] * df['HPP']).round(2)
            
            return df.fillna(0)
            
        except Exception as e:
            print(f"Error in metrics calculation: {str(e)}")
            import traceback
            traceback.print_exc()
            raise e # Re-raise to be caught by process_files

    def process_files(self, filenames: List[str], supplier_file_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Process uploaded files and return results.
        """
        processed_data = []
        errors = []
        
        # 1. Load Supplier Data
        supplier_df = pd.DataFrame()
        if supplier_file_path and os.path.exists(supplier_file_path):
             supplier_df = self.load_supplier_data(Path(supplier_file_path))

        # 2. Load Store Contribution (if exists)
        # Assuming it might be uploaded or we look for it in data/store_contribution.csv
        # For now, let's assume default 100% if not found, or check if user uploaded it
        store_contrib = pd.DataFrame(columns=['store', 'contribution_pct', 'store_lower'])
        # Check if 'store_contribution.csv' is in uploads
        if 'store_contribution.csv' in filenames:
            store_contrib = self.load_store_contribution(self.upload_dir / 'store_contribution.csv')

        # 3. Find Padang Data (Reference)
        # Look for a file that looks like Padang data
        df_padang = None
        padang_filename = None
        
        for fname in filenames:
            if 'padang' in fname.lower() and 'miss' in fname.lower() and 'glam' in fname.lower():
                padang_filename = fname
                break
        
        if padang_filename:
            print(f"Found Padang reference file: {padang_filename}")
            df_padang = self.read_csv_file(self.upload_dir / padang_filename)

        # 4. Process Each File
        for filename in filenames:
            # Skip non-data files
            if filename in ['supplier_data.csv', 'store_contribution.csv']:
                continue
                
            file_path = self.upload_dir / filename
            if not file_path.exists():
                continue

            try:
                # Extract location
                location = self.get_store_name_from_filename(filename)
                contribution_pct = self.get_contribution_pct(location, store_contrib)
                
                # Read CSV
                df = self.read_csv_file(file_path)
                if df is None or df.empty:
                    errors.append(f"{filename}: Failed to read or empty")
                    continue
                
                # Clean Data
                df_clean = self.clean_po_data(df, location, contribution_pct, df_padang)
                if df_clean.empty:
                    errors.append(f"{filename}: Cleaning failed")
                    continue
                
                # Merge Suppliers
                merged_df = self.merge_with_suppliers(df_clean, supplier_df)
                
                # Calculate Metrics
                final_df = self.calculate_inventory_metrics(merged_df)
                
                # Add metadata
                final_df['Source File'] = filename
                final_df['Location'] = location
                
                processed_data.append(final_df)

            except Exception as e:
                print(f"Error processing {filename}: {e}")
                import traceback
                traceback.print_exc()
                errors.append(f"{filename}: {str(e)}")

        if not processed_data:
            return {"status": "error", "message": f"No data processed. Errors: {'; '.join(errors)}"}

        final_result = pd.concat(processed_data, ignore_index=True)
        
        # Save result
        output_file = self.output_dir / "result.csv"
        final_result.to_csv(output_file, index=False, sep=';', encoding='utf-8-sig')
        
        # Calculate summary
        summary = {
            "total_skus": len(final_result),
            "total_emergency_po_cost": float(final_result['emergency_po_cost'].sum()),
            "total_regular_po_cost": float(final_result['final_updated_regular_po_cost'].sum()),
            "items_to_order": int(len(final_result[final_result['final_updated_regular_po_qty'] > 0]))
        }
        
        # Replace NaN/Inf for JSON serialization
        final_result = final_result.replace([np.inf, -np.inf], 0).fillna(0)
        
        return {
            "status": "success",
            "data": final_result.to_dict(orient="records"),
            "summary": summary
        }
