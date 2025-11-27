from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import pandas as pd
import numpy as np
import json
from pathlib import Path

router = APIRouter()

# Helper function to load store data
def load_store_data():
    stores_file = Path("data/output/stores.json")
    if not stores_file.exists():
        return []
    with open(stores_file, 'r') as f:
        return json.load(f)

# Helper function to get stock health category
def get_stock_health_category(days_of_stock: float) -> str:
    if pd.isna(days_of_stock):
        return "Hitam (Habis)"
    if days_of_stock <= 0:
        return "Hitam (Habis)"
    elif days_of_stock < 7:
        return "Merah (Menuju habis)"
    elif days_of_stock < 21:
        return "Kuning (Kurang)"
    elif days_of_stock <= 30:
        return "Hijau (Sehat)"
    else:
        return "Biru (Long over stock)"

@router.get("/stock-health")
async def get_stock_health(
    store_name: Optional[str] = None,
    sku: Optional[str] = None,
    brand: Optional[str] = None
):
    try:
        # Load the result data
        result_file = Path("data/output/result.csv")
        if not result_file.exists():
            return {"data": [], "summary": {}}
            
        df = pd.read_csv(result_file)
        
        # Apply filters
        if store_name:
            df = df[df['store_name'] == store_name]
        if sku and sku != 'All SKUs':
            df = df[df['sku'] == sku]
        if brand and brand != 'All Brands':
            df = df[df['brand'] == brand]
        
        # Calculate stock health
        df['stock_health'] = df['days_of_stock'].apply(get_stock_health_category)
        
        # Group by stock health and count
        health_counts = df['stock_health'].value_counts().to_dict()
        
        # Get unique SKUs and brands for filters
        unique_skus = ["All SKUs"] + sorted(df['sku'].dropna().unique().tolist())
        unique_brands = ["All Brands"] + sorted(df['brand'].dropna().unique().tolist())
        
        # Prepare time series data (example: last 7 days)
        # This is a simplified example - you might need to adjust based on your actual data
        time_series = {
            "labels": [f"Day {i}" for i in range(1, 8)],
            "data": {
                "Biru (Long over stock)": [10, 12, 15, 18, 20, 22, 25],
                "Hijau (Sehat)": [30, 32, 35, 34, 36, 38, 40],
                "Kuning (Kurang)": [20, 18, 15, 16, 14, 12, 10],
                "Merah (Menuju habis)": [5, 6, 8, 7, 6, 5, 4],
                "Hitam (Habis)": [2, 1, 0, 1, 0, 1, 0]
            }
        }
        
        return {
            "data": {
                "healthCounts": health_counts,
                "timeSeries": time_series,
                "filters": {
                    "stores": [store['name'] for store in load_store_data()],
                    "skus": unique_skus,
                    "brands": unique_brands
                }
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating dashboard data: {str(e)}")

@router.get("/sku-metrics")
async def get_sku_metrics(
    store_name: Optional[str] = None,
    brand: Optional[str] = None
):
    try:
        # This is a simplified example - you'll need to implement based on your data
        return {
            "topSelling": [
                {"sku": "SKU001", "name": "Product 1", "sales": 150},
                {"sku": "SKU002", "name": "Product 2", "sales": 120},
                {"sku": "SKU003", "name": "Product 3", "sales": 90},
            ],
            "lowStock": [
                {"sku": "SKU004", "name": "Product 4", "daysLeft": 2},
                {"sku": "SKU005", "name": "Product 5", "daysLeft": 3},
                {"sku": "SKU006", "name": "Product 6", "daysLeft": 4},
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting SKU metrics: {str(e)}")
