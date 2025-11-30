#!/bin/bash

# Exit on error
set -e

# Configuration
DB_NAME="your_database_name"  # Update with your database name
DB_USER="your_username"       # Update with your database username
DB_PASSWORD="your_password"   # Update with your database password
DB_HOST="localhost"
DB_PORT="5432"

# Function to run psql command
run_psql() {
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "$1"
}

# Function to import CSV with headers
import_csv() {
    local table=$1
    local file=$2
    local columns=$3
    
    echo "Importing $file to $table..."
    
    # Detect delimiter (check if first line contains semicolon)
    local delimiter=","
    if head -n 1 "$file" | grep -q ";"; then
        delimiter=";"
    fi
    
    # Use the detected delimiter for the import
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\COPY $table($columns) FROM '$file' WITH (FORMAT csv, HEADER true, NULL '', DELIMITER '$delimiter')"
}

# Main script
echo "Starting data import..."

# 1. Import master data (brands, stores, suppliers)
echo "Importing master data..."
for table in brands stores suppliers; do
    import_csv "$table" "./data/seeds/master_data/${table}.csv" "original_id, name"
done

# 2. Import products from product_brand_store_supplier_mappings.csv
echo "Importing products..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<-EOSQL
    -- Create temp table for product mappings
    CREATE TEMP TABLE temp_product_mappings (
        sku_code VARCHAR(255),
        product_name VARCHAR(255),
        brand_original_id VARCHAR(255),
        store_original_id VARCHAR(255),
        supplier_original_id VARCHAR(255)
    );

    -- Load data into temp table
    \COPY temp_product_mappings(sku_code, product_name, brand_original_id, store_original_id, supplier_original_id) 
    FROM './data/seeds/master_data/product_brand_store_supplier_mappings.csv' 
    WITH (FORMAT csv, HEADER true, NULL '');

    -- Insert unique products
    INSERT INTO products (sku_code, name, brand_id, supplier_id, created_at, updated_at)
    SELECT DISTINCT 
        t.sku_code,
        t.product_name,
        b.id as brand_id,
        s.id as supplier_id,
        NOW(),
        NOW()
    FROM temp_product_mappings t
    JOIN brands b ON t.brand_original_id = b.original_id
    JOIN suppliers s ON t.supplier_original_id = s.original_id
    ON CONFLICT (sku_code) DO NOTHING;

    -- Log and handle duplicate product mappings
    echo "Checking for duplicate product mappings..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    WITH duplicates AS (
        SELECT 
            t.sku_code,
            t.brand_original_id,
            t.store_original_id,
            t.supplier_original_id,
            COUNT(*) OVER (
                PARTITION BY p.id, b.id, st.id, s.id
            ) as dup_count
        FROM temp_product_mappings t
        JOIN products p ON t.sku_code = p.sku_code
        JOIN brands b ON t.brand_original_id = b.original_id
        JOIN stores st ON t.store_original_id = st.original_id
        JOIN suppliers s ON t.supplier_original_id = s.original_id
        LEFT JOIN product_mappings pm ON 
            pm.product_id = p.id AND 
            pm.brand_id = b.id AND 
            pm.store_id = st.id AND 
            pm.supplier_id = s.id
        WHERE pm.id IS NOT NULL
    )
    SELECT 
        'WARNING: Duplicate product mapping (skipping)' as message,
        sku_code,
        brand_original_id as brand_id,
        store_original_id as store_id,
        supplier_original_id as supplier_id
    FROM duplicates
    WHERE dup_count > 0;"

    -- Insert into product_mappings with internal IDs, skipping duplicates
    echo "Inserting product mappings..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO product_mappings (product_id, brand_id, store_id, supplier_id, original_sku, created_at, updated_at)
    SELECT 
        p.id as product_id,
        b.id as brand_id,
        st.id as store_id,
        s.id as supplier_id,
        t.sku_code as original_sku,
        NOW() as created_at,
        NOW() as updated_at
    FROM temp_product_mappings t
    JOIN products p ON t.sku_code = p.sku_code
    JOIN brands b ON t.brand_original_id = b.original_id
    JOIN stores st ON t.store_original_id = st.original_id
    JOIN suppliers s ON t.supplier_original_id = s.original_id
    WHERE NOT EXISTS (
        SELECT 1 FROM product_mappings pm 
        WHERE pm.product_id = p.id 
        AND pm.brand_id = b.id 
        AND pm.store_id = st.id 
        AND pm.supplier_id = s.id
    );
    SELECT CONCAT(COUNT(*), ' product mappings inserted') as result FROM product_mappings;"

    -- Clean up
    DROP TABLE temp_product_mappings;
EOSQL

# 3. Import supplier_brand_mappings
echo "Importing supplier-brand mappings..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<-EOSQL
    -- Create temp table for supplier-brand mappings
    CREATE TEMP TABLE temp_supplier_brand_mappings (
        supplier_original_id VARCHAR(255),
        brand_original_id VARCHAR(255),
        CONSTRAINT unique_mapping UNIQUE (supplier_original_id, brand_original_id)
    );

    -- Load data into temp table, skipping duplicates
    \COPY temp_supplier_brand_mappings(supplier_original_id, brand_original_id) 
    FROM './data/seeds/master_data/supplier_brand_mappings.csv' 
    WITH (FORMAT csv, HEADER true, NULL '')
    ON CONFLICT (supplier_original_id, brand_original_id) DO NOTHING;

    -- Log duplicate supplier-brand mappings
    echo "Checking for duplicate supplier-brand mappings..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    WITH duplicates AS (
        SELECT 
            t.supplier_original_id,
            t.brand_original_id,
            COUNT(*) OVER (
                PARTITION BY s.id, b.id
            ) as dup_count
        FROM temp_supplier_brand_mappings t
        JOIN suppliers s ON t.supplier_original_id = s.original_id
        JOIN brands b ON t.brand_original_id = b.original_id
        JOIN supplier_brand_mappings sbm ON 
            sbm.supplier_id = s.id AND 
            sbm.brand_id = b.id
    )
    SELECT 
        'WARNING: Duplicate supplier-brand mapping (skipping)' as message,
        supplier_original_id,
        brand_original_id
    FROM duplicates
    WHERE dup_count > 0;"

    -- Insert into supplier_brand_mappings with internal IDs, skipping duplicates
    echo "Inserting supplier-brand mappings..."
    PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "
    INSERT INTO supplier_brand_mappings (supplier_id, brand_id, created_at, updated_at)
    SELECT 
        s.id as supplier_id,
        b.id as brand_id,
        NOW() as created_at,
        NOW() as updated_at
    FROM temp_supplier_brand_mappings t
    JOIN suppliers s ON t.supplier_original_id = s.original_id
    JOIN brands b ON t.brand_original_id = b.original_id
    WHERE NOT EXISTS (
        SELECT 1 FROM supplier_brand_mappings sbm 
        WHERE sbm.supplier_id = s.id 
        AND sbm.brand_id = b.id
    );
    SELECT CONCAT(COUNT(*), ' supplier-brand mappings inserted') as result FROM supplier_brand_mappings;"

    -- Clean up
    DROP TABLE temp_supplier_brand_mappings;
EOSQL

echo "Data import completed successfully."
