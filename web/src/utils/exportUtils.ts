interface ColumnDefinition {
    key: string;
    label: string;
}

export const exportToCsv = (data: any[], columns: ColumnDefinition[], filename: string) => {
    const headers = columns.map(c => `"${c.label.replace(/"/g, '""')}"`).join(',');
    
    const rows = data.map(item =>
        columns.map(col => {
            const val = item[col.key];
            if (val === undefined || val === null) return '';
            const strVal = String(val);
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        }).join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// M2 Export Configuration
export const m2ExportConfig = {
    columns: [
        { key: 'Toko', label: 'Toko' },
        { key: 'SKU', label: 'SKU' },
        { key: 'HPP', label: 'HPP' },
        { key: 'final_updated_regular_po_qty', label: 'Qty' }
    ],
    filename: `m2_export_${new Date().toISOString().split('T')[0]}.csv`
};

// Emergency Export Configuration
export const emergencyExportConfig = {
    columns: [
        { key: 'Brand', label: 'Brand' },
        { key: 'SKU', label: 'SKU' },
        { key: 'Nama', label: 'Nama' },
        { key: 'Toko', label: 'Toko' },
        { key: 'HPP', label: 'HPP' },
        { key: 'emergency_po_qty', label: 'Emergency PO Qty' },
        { key: 'emergency_po_cost', label: 'Emergency PO Cost' }
    ],
    filename: `emergency_export_${new Date().toISOString().split('T')[0]}.csv`
};
