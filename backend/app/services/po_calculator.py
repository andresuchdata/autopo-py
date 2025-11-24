"""Port of the notebook logic for PO calculations."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

LOGGER = logging.getLogger(__name__)


def load_store_contribution(store_contribution_path: Path) -> pd.DataFrame:
    store_contrib = pd.read_csv(store_contribution_path, header=None, names=["store", "contribution_pct"])
    store_contrib["store_lower"] = store_contrib["store"].str.lower()
    return store_contrib


def get_contribution_pct(location: str, store_contrib: pd.DataFrame) -> float:
    contrib_row = store_contrib[store_contrib["store_lower"] == location.lower()]
    if not contrib_row.empty:
        return float(contrib_row["contribution_pct"].values[0])
    LOGGER.warning("No contribution pct found for %s; defaulting to 100", location)
    return 100.0


def load_supplier_data(supplier_path: Path) -> pd.DataFrame:
    df = pd.read_csv(supplier_path, sep=";", decimal=",").fillna("")
    df["Nama Brand"] = df["Nama Brand"].str.strip()
    return df


def merge_with_suppliers(df_clean: pd.DataFrame, supplier_df: pd.DataFrame) -> pd.DataFrame:
    padang_suppliers = supplier_df[supplier_df["Nama Store"] == "Miss Glam Padang"]
    other_suppliers = supplier_df[supplier_df["Nama Store"] != "Miss Glam Padang"]

    merged_df = pd.merge(
        df_clean,
        padang_suppliers,
        left_on="Brand",
        right_on="Nama Brand",
        how="left",
        suffixes=("_clean", "_supplier"),
    )

    no_padang_match = merged_df[merged_df["Nama Brand"].isna()].index
    if len(no_padang_match) > 0:
        brands_needing_suppliers = merged_df.loc[no_padang_match, "Brand"].unique()
        first_supplier_per_brand = other_suppliers.drop_duplicates(subset="Nama Brand")

        for brand in brands_needing_suppliers:
            supplier_data = first_supplier_per_brand[first_supplier_per_brand["Nama Brand"] == brand]
            if not supplier_data.empty:
                brand_mask = (merged_df["Brand"] == brand) & (merged_df["Nama Brand"].isna())
                for col in supplier_data.columns:
                    if col in merged_df.columns and col != "Brand":
                        merged_df.loc[brand_mask, col] = supplier_data[col].values[0]

    supplier_columns = [
        "ID Supplier",
        "Nama Supplier",
        "ID Brand",
        "ID Store",
        "Nama Store",
        "Hari Order",
        "Min. Purchase",
        "Trading Term",
        "Promo Factor",
        "Delay Factor",
    ]
    for col in supplier_columns:
        if col in merged_df.columns:
            merged_df[col] = merged_df[col].fillna("" if merged_df[col].dtype == "object" else 0)

    return merged_df


def calculate_inventory_metrics(df_clean: pd.DataFrame) -> pd.DataFrame:
    df = df_clean.copy()

    stock_col = "Stok" if "Stok" in df.columns else "Stock"

    numeric_cols = [
        stock_col,
        "Daily Sales",
        "Max. Daily Sales",
        "Lead Time",
        "Max. Lead Time",
        "Sedang PO",
        "HPP",
        "Lead Time Sedang PO",
    ]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    df["Safety stock"] = (df["Max. Daily Sales"] * df["Max. Lead Time"] - df["Daily Sales"] * df["Lead Time"]).apply(
        lambda x: np.ceil(x)
    )
    df["Safety stock"] = df["Safety stock"].fillna(0).astype(int)

    df["Reorder point"] = np.ceil(df["Daily Sales"] * df["Lead Time"] + df["Safety stock"]).fillna(0).astype(int)

    df["Stock cover 30 days"] = np.ceil(df["Daily Sales"] * 30).fillna(0).astype(int)

    df["current_stock_days_cover"] = np.where(
        df["Daily Sales"] > 0,
        df[stock_col] / df["Daily Sales"],
        0,
    )

    df["is_open_po"] = np.where(
        (df["current_stock_days_cover"] < 30) & (df[stock_col] <= df["Reorder point"]),
        1,
        0,
    )

    df["initial_qty_po"] = df["Stock cover 30 days"] - df[stock_col] - df.get("Sedang PO", 0)
    df["initial_qty_po"] = (
        pd.Series(np.where(df["is_open_po"] == 1, df["initial_qty_po"], 0), index=df.index).clip(lower=0).astype(int)
    )

    df["emergency_po_qty"] = np.where(
        df.get("Sedang PO", 0) > 0,
        np.maximum(0, (df["Lead Time Sedang PO"] - df["current_stock_days_cover"]) * df["Daily Sales"]),
        np.ceil((df["Max. Lead Time"] - df["current_stock_days_cover"]) * df["Daily Sales"]),
    )

    df["emergency_po_qty"] = (
        df["emergency_po_qty"]
        .replace([np.inf, -np.inf], 0)
        .fillna(0)
        .clip(lower=0)
        .astype(int)
    )

    df["updated_regular_po_qty"] = (df["initial_qty_po"] - df["emergency_po_qty"]).clip(lower=0).astype(int)

    df["final_updated_regular_po_qty"] = np.where(
        (df["updated_regular_po_qty"] > 0) & (df["updated_regular_po_qty"] < df["Min. Order"]),
        df["Min. Order"],
        df["updated_regular_po_qty"],
    ).astype(int)

    df["emergency_po_cost"] = (df["emergency_po_qty"] * df["HPP"]).round(2)
    df["final_updated_regular_po_cost"] = (df["final_updated_regular_po_qty"] * df["HPP"]).round(2)

    return df.fillna(0)


def _format_number_for_csv(x):
    if pd.isna(x) or x == "":
        return x
    try:
        if isinstance(x, (int, float)):
            if x == int(x):
                return f"{int(x):,d}".replace(",", ".")
            return f"{x:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        return x
    except Exception:  # pragma: no cover - defensive
        return x


def save_to_csv(df: pd.DataFrame, output_path: Path) -> None:
    df_output = df.copy()
    if "SKU" in df_output.columns:
        df_output["SKU"] = df_output["SKU"].apply(lambda x: f'="{x}"')
    numeric_cols = df_output.select_dtypes(include=["number"]).columns
    for col in numeric_cols:
        df_output[col] = df_output[col].apply(_format_number_for_csv)
    df_output.to_csv(output_path, index=False, sep=";", decimal=",", encoding="utf-8-sig")


def save_to_m2_format(df: pd.DataFrame, output_path: Path) -> None:
    df_output = df[["Toko", "SKU", "HPP", "final_updated_regular_po_qty"]].copy()
    if "SKU" in df_output.columns:
        df_output["SKU"] = df_output["SKU"].apply(lambda x: f"{x}")
    df_output.to_csv(output_path, index=False, sep=";", decimal=",", encoding="utf-8-sig")


def save_to_emergency_format(df: pd.DataFrame, output_path: Path) -> None:
    df_output = df[["Brand", "SKU", "Nama", "Toko", "HPP", "emergency_po_qty", "emergency_po_cost"]].copy()
    if "SKU" in df_output.columns:
        df_output["SKU"] = df_output["SKU"].apply(lambda x: f"{x}")
    df_output.to_csv(output_path, index=False, sep=";", decimal=",", encoding="utf-8-sig")


def get_store_name_from_filename(filename: str) -> str:
    name_parts = Path(filename).stem.split()
    if len(name_parts) >= 3 and name_parts[1].lower() == "miss" and name_parts[2].lower() == "glam":
        return " ".join(name_parts[3:]).strip().upper()
    if len(name_parts) >= 2 and name_parts[0].lower() == "miss" and name_parts[1].lower() == "glam":
        return " ".join(name_parts[2:]).strip().upper()
    if " " in filename:
        return " ".join(name_parts[1:]).strip().upper()
    return name_parts[0].upper()


def read_csv_file(file_path: Path) -> pd.DataFrame:
    formats = [
        (",", "utf-8"),
        (";", "utf-8"),
        (",", "latin1"),
        (";", "latin1"),
        (",", "cp1252"),
        (";", "cp1252"),
    ]
    for sep, enc in formats:
        try:
            df = pd.read_csv(
                file_path,
                sep=sep,
                decimal=",",
                thousands=".",
                encoding=enc,
                engine="python",
            )
            if not df.empty:
                return df
        except (UnicodeDecodeError, pd.errors.ParserError, pd.errors.EmptyDataError):
            continue
        except Exception as exc:  # pragma: no cover
            LOGGER.warning("Unexpected error reading %s: %s", file_path, exc)
            continue
    raise ValueError(f"Failed to read {file_path}")


def load_padang_data(padang_path: Path) -> pd.DataFrame:
    return pd.read_csv(padang_path, sep=";", decimal=",", thousands=".")


def clean_po_data(
    df: pd.DataFrame,
    location: str,
    contribution_pct: float,
    padang_sales: Optional[pd.DataFrame] = None,
) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip()

    required_columns = [
        "Brand",
        "SKU",
        "Nama",
        "Toko",
        "Stok",
        "Daily Sales",
        "Max. Daily Sales",
        "Lead Time",
        "Max. Lead Time",
        "Min. Order",
        "Sedang PO",
        "HPP",
    ]

    available_columns = {col.strip(): col for col in df.columns}
    columns_to_keep = [available_columns[col] for col in required_columns if col in available_columns]
    df = df[columns_to_keep]

    df["Brand"] = df["Brand"].astype(str).str.strip()

    numeric_columns = [
        "Stok",
        "Daily Sales",
        "Max. Daily Sales",
        "Lead Time",
        "Max. Lead Time",
        "Sedang PO",
        "HPP",
    ]

    for col in numeric_columns:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(r"[^\d.,-]", "", regex=True)
                .str.replace(",", ".", regex=False)
                .replace("", "0")
                .astype(float)
                .fillna(0)
            )

    contribution_ratio = contribution_pct / 100
    df["contribution_pct"] = contribution_pct
    df["contribution_ratio"] = contribution_ratio

    if "Lead Time Sedang PO" not in df.columns:
        df["Lead Time Sedang PO"] = 5

    if padang_sales is None:
        df["Is in Padang"] = 0
        return df

    padang_df = padang_sales.copy()
    padang_df.columns = padang_df.columns.str.strip()

    if "Daily Sales" in df.columns and "Orig Daily Sales" not in df.columns:
        df = df.rename(columns={"Daily Sales": "Orig Daily Sales"})
    if "Max. Daily Sales" in df.columns and "Orig Max. Daily Sales" not in df.columns:
        df = df.rename(columns={"Max. Daily Sales": "Orig Max. Daily Sales"})

    df = df.merge(
        padang_df[["SKU", "Daily Sales", "Max. Daily Sales"]].rename(
            columns={"Daily Sales": "Padang Daily Sales", "Max. Daily Sales": "Padang Max Daily Sales"}
        ),
        on="SKU",
        how="left",
    )

    df["Is in Padang"] = df["Padang Daily Sales"].notna().astype(int)

    if "Padang Daily Sales" in df.columns and "Orig Daily Sales" in df.columns:
        df["Daily Sales"] = np.where(
            df["Is in Padang"] == 1,
            df["Padang Daily Sales"] * contribution_ratio,
            df["Orig Daily Sales"],
        )
    if "Padang Max Daily Sales" in df.columns and "Orig Max. Daily Sales" in df.columns:
        df["Max. Daily Sales"] = np.where(
            df["Is in Padang"] == 1,
            df["Padang Max Daily Sales"] * contribution_ratio,
            df["Orig Max. Daily Sales"],
        )

    df = df.drop(columns=["Padang Daily Sales", "Padang Max Daily Sales"], errors="ignore")

    return df


def process_po_file(
    file_path: Path,
    supplier_df: pd.DataFrame,
    store_contrib: pd.DataFrame,
    df_padang: Optional[pd.DataFrame],
    store_name: Optional[str] = None,
    contribution_override: Optional[float] = None,
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    location = (store_name or get_store_name_from_filename(file_path.name)).upper()
    contribution_pct = (
        float(contribution_override)
        if contribution_override is not None
        else get_contribution_pct(location, store_contrib)
    )

    df = read_csv_file(file_path)
    if df.empty:
        raise ValueError("File is empty")

    df_clean = clean_po_data(df, location, contribution_pct, df_padang)
    if df_clean.empty:
        raise ValueError("Data cleaning failed")

    merged_df = merge_with_suppliers(df_clean, supplier_df)
    merged_df = calculate_inventory_metrics(merged_df)

    summary = {
        "location": location,
        "contribution_pct": contribution_pct,
        "total_rows": len(merged_df),
    }

    return merged_df, summary


def compute_outputs(
    store_files: List[Dict[str, Any]],
    supplier_path: Path,
    store_contrib_path: Path,
    padang_path: Optional[Path] = None,
) -> List[Tuple[str, pd.DataFrame, Dict[str, Any]]]:
    supplier_df = load_supplier_data(supplier_path)
    store_contrib = load_store_contribution(store_contrib_path)
    df_padang = load_padang_data(padang_path) if padang_path else None

    outputs: List[Tuple[str, pd.DataFrame, Dict[str, Any]]] = []
    for store_file in store_files:
        file_path = Path(store_file["path"])
        store_name = store_file.get("store_name")
        contribution_pct = store_file.get("contribution_pct")
        label = store_file.get("label") or file_path.name

        merged_df, summary = process_po_file(
            file_path,
            supplier_df,
            store_contrib,
            df_padang,
            store_name=store_name,
            contribution_override=contribution_pct,
        )
        summary["label"] = label
        outputs.append((label, merged_df, summary))
    return outputs
