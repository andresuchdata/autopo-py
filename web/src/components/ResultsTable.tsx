import React from 'react';
import { DataTable, ColumnDef } from './DataTable';

interface ResultItem {
    Brand: string;
    SKU: string | number;
    Nama: string;
    Toko: string;
    Location: string;
    Stok: number;
    'Daily Sales': number;
    'Max. Daily Sales': number;
    'Lead Time': number;
    'Max. Lead Time': number;
    'Safety stock': number;
    'Reorder point': number;
    'Stock cover 30 days': number;
    'current_stock_days_cover': number;
    'is_open_po': number;
    'initial_qty_po': number;
    'emergency_po_qty': number;
    'updated_regular_po_qty': number;
    'final_updated_regular_po_qty': number;
    'HPP': number;
    'emergency_po_cost': number;
    'final_updated_regular_po_cost': number;
    [key: string]: any;
}

interface ResultsTableProps {
    data: ResultItem[];
}

export function ResultsTable({ data }: ResultsTableProps) {
    // Columns configuration
    const columns: ColumnDef<ResultItem>[] = [
        { key: 'Brand', label: 'Brand', type: 'text' },
        { key: 'SKU', label: 'SKU', type: 'text' },
        { key: 'Nama', label: 'Product Name', type: 'text', maxWidth: '300px' },
        { key: 'Location', label: 'Location', type: 'text' },
        { key: 'Stok', label: 'Stock', type: 'number' },
        { key: 'Daily Sales', label: 'Daily Sales', type: 'number' },
        { key: 'Max. Daily Sales', label: 'Max Sales', type: 'number' },
        { key: 'Lead Time', label: 'LT', type: 'number' },
        { key: 'Safety stock', label: 'Safety Stock', type: 'number' },
        { key: 'Reorder point', label: 'ROP', type: 'number' },
        { key: 'current_stock_days_cover', label: 'Days Cover', type: 'number' },
        { key: 'final_updated_regular_po_qty', label: 'Regular PO', type: 'number', highlight: 'blue' },
        { key: 'emergency_po_qty', label: 'Emergency PO', type: 'number', highlight: 'red' },
        { key: 'HPP', label: 'HPP', type: 'currency' },
        { key: 'final_updated_regular_po_cost', label: 'Reg. PO Cost', type: 'currency' },
        { key: 'emergency_po_cost', label: 'Emerg. PO Cost', type: 'currency' },
    ];

    return (
        <DataTable
            data={data}
            columns={columns}
            title="Processing Results"
            filename="autopo_results.csv"
        />
    );
}
