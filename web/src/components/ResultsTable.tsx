import React, { useState, useMemo } from 'react';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, Search, Filter } from 'lucide-react';
import { clsx } from 'clsx';

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

type SortConfig = {
    key: keyof ResultItem | null;
    direction: 'asc' | 'desc';
};

export function ResultsTable({ data }: ResultsTableProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
    const [searchTerm, setSearchTerm] = useState('');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [showFilters, setShowFilters] = useState(false);

    if (!data || data.length === 0) return null;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
    };

    const formatNumber = (val: number) => {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val);
    };

    // Columns configuration
    const columns = [
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

    // Filter and Sort Logic
    const processedData = useMemo(() => {
        let filtered = [...data];

        // Global Search
        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            filtered = filtered.filter(item =>
                Object.values(item).some(val =>
                    String(val).toLowerCase().includes(lowerTerm)
                )
            );
        }

        // Column Filters
        Object.entries(columnFilters).forEach(([key, value]) => {
            if (value) {
                const lowerValue = value.toLowerCase();
                filtered = filtered.filter(item =>
                    String(item[key]).toLowerCase().includes(lowerValue)
                );
            }
        });

        // Sorting
        if (sortConfig.key) {
            filtered.sort((a, b) => {
                const aVal = a[sortConfig.key!];
                const bVal = b[sortConfig.key!];

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [data, searchTerm, columnFilters, sortConfig]);

    // Pagination Logic
    const totalPages = Math.ceil(processedData.length / rowsPerPage);
    const paginatedData = processedData.slice(
        (currentPage - 1) * rowsPerPage,
        currentPage * rowsPerPage
    );

    const handleSort = (key: keyof ResultItem) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleFilterChange = (key: string, value: string) => {
        setColumnFilters(prev => ({ ...prev, [key]: value }));
        setCurrentPage(1); // Reset to first page on filter
    };

    const exportCSV = () => {
        // Simple CSV export implementation
        const headers = columns.map(c => c.label).join(',');
        const rows = processedData.map(item =>
            columns.map(c => {
                const val = item[c.key];
                // Handle commas in strings
                if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
                return val;
            }).join(',')
        );
        const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "autopo_results.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Header Controls */}
            <div className="p-6 border-b border-gray-100 space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-xl font-bold text-gray-800">
                        Processing Results
                        <span className="ml-2 text-sm font-normal text-gray-500">({processedData.length} items)</span>
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={clsx(
                                "flex items-center px-4 py-2 rounded-lg border transition-colors",
                                showFilters ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                            )}
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            Filters
                        </button>
                        <button
                            onClick={exportCSV}
                            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                        >
                            <Download className="w-4 h-4 mr-2" />
                            Export CSV
                        </button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Search all columns..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">Rows per page:</span>
                        <select
                            className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap"
                                    onClick={() => handleSort(col.key as keyof ResultItem)}
                                >
                                    <div className="flex items-center gap-1">
                                        {col.label}
                                        <ArrowUpDown className="w-3 h-3 text-gray-400" />
                                    </div>
                                </th>
                            ))}
                        </tr>
                        {showFilters && (
                            <tr className="bg-gray-50">
                                {columns.map((col) => (
                                    <th key={`${col.key}-filter`} className="px-6 py-2">
                                        <input
                                            type="text"
                                            placeholder={`Filter ${col.label}...`}
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal"
                                            value={columnFilters[col.key] || ''}
                                            onChange={(e) => handleFilterChange(col.key, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                    </th>
                                ))}
                            </tr>
                        )}
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedData.map((item, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                {columns.map((col) => (
                                    <td key={col.key} className="px-6 py-4 whitespace-nowrap text-sm">
                                        <div className={clsx(
                                            col.type === 'number' || col.type === 'currency' ? "text-right" : "text-left",
                                            col.highlight === 'blue' && "font-bold text-blue-600",
                                            col.highlight === 'red' && "font-bold text-red-600",
                                            col.maxWidth && "truncate"
                                        )}
                                            style={col.maxWidth ? { maxWidth: col.maxWidth } : {}}
                                            title={col.maxWidth ? String(item[col.key]) : undefined}
                                        >
                                            {col.type === 'currency'
                                                ? formatCurrency(item[col.key])
                                                : col.type === 'number'
                                                    ? formatNumber(item[col.key])
                                                    : item[col.key]
                                            }
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                <div className="text-sm text-gray-500">
                    Showing <span className="font-medium">{Math.min((currentPage - 1) * rowsPerPage + 1, processedData.length)}</span> to <span className="font-medium">{Math.min(currentPage * rowsPerPage, processedData.length)}</span> of <span className="font-medium">{processedData.length}</span> results
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center px-4 text-sm font-medium text-gray-700">
                        Page {currentPage} of {totalPages}
                    </div>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
