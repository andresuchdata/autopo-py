import React, { useState, useMemo } from 'react';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, Search, Filter } from 'lucide-react';
import { clsx } from 'clsx';
import { exportToCsv, m2ExportConfig, emergencyExportConfig } from '@/utils/exportUtils';
import { formatCurrencyIDR } from '@/utils/formatters';

export interface ColumnDef<T> {
    key: keyof T | string;
    label: string;
    type?: 'text' | 'number' | 'currency';
    maxWidth?: string;
    highlight?: 'blue' | 'red';
    format?: (value: any) => React.ReactNode;
}

interface DataTableProps<T> {
    data: T[];
    columns: ColumnDef<T>[];
    title: string;
    searchPlaceholder?: string;
    filename?: string;
}

type SortConfig<T> = {
    key: keyof T | string | null;
    direction: 'asc' | 'desc';
};

export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    title,
    searchPlaceholder = "Search...",
    filename = "export.csv"
}: DataTableProps<T>) {
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [sortConfig, setSortConfig] = useState<SortConfig<T>>({ key: null, direction: 'asc' });
    const [searchTerm, setSearchTerm] = useState('');
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
    const [showFilters, setShowFilters] = useState(false);

    if (!data) return null;

    const formatCurrency = (val: number) => formatCurrencyIDR(val);

    const formatNumber = (val: number) => {
        return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(val);
    };

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
                const aVal = a[sortConfig.key as string];
                const bVal = b[sortConfig.key as string];

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

    const handleSort = (key: keyof T | string) => {
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
        exportToCsv(processedData, columns as any, filename);
    };

    const exportM2CSV = () => {
        exportToCsv(data, m2ExportConfig.columns, m2ExportConfig.filename);
    };

    const exportEmergencyCSV = () => {
        exportToCsv(data, emergencyExportConfig.columns, emergencyExportConfig.filename);
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-full">
            {/* Header Controls */}
            <div className="p-4 border-b border-gray-100 space-y-4 flex-shrink-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <h2 className="text-lg font-bold text-gray-800">
                        {title}
                        <span className="ml-2 text-sm font-normal text-gray-500">({processedData.length})</span>
                    </h2>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={clsx(
                                "flex items-center px-3 py-1.5 text-sm rounded-lg border transition-colors",
                                showFilters ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                            )}
                        >
                            <Filter className="w-4 h-4 mr-2" />
                            Filters
                        </button>
                        <button
                            onClick={exportCSV}
                            className="flex items-center px-3 py-1.5 text-sm bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <Download className="w-4 h-4 mr-1.5" />
                            Export Complete
                        </button>
                        <button
                            onClick={exportM2CSV}
                            className="flex items-center px-3 py-1.5 text-sm bg-blue-50 border border-blue-100 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                            <Download className="w-4 h-4 mr-1.5" />
                            M2 Export
                        </button>
                        <button
                            onClick={exportEmergencyCSV}
                            className="flex items-center px-3 py-1.5 text-sm bg-red-50 border border-red-100 text-red-700 rounded-lg hover:bg-red-100 transition-colors"
                        >
                            <Download className="w-4 h-4 mr-1.5" />
                            Emergency Export
                        </button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600">Rows:</span>
                        <select
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="overflow-auto flex-grow">
                <table className="min-w-full divide-y divide-gray-200 relative">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {columns.map((col) => (
                                <th
                                    key={String(col.key)}
                                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors whitespace-nowrap bg-gray-50"
                                    onClick={() => handleSort(col.key)}
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
                                    <th key={`${String(col.key)}-filter`} className="px-6 py-2 bg-gray-50">
                                        <input
                                            type="text"
                                            placeholder={`Filter...`}
                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal"
                                            value={columnFilters[String(col.key)] || ''}
                                            onChange={(e) => handleFilterChange(String(col.key), e.target.value)}
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
                                    <td key={String(col.key)} className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                                        <div className={clsx(
                                            col.type === 'number' || col.type === 'currency' ? "text-right" : "text-left",
                                            col.highlight === 'blue' && "font-bold text-blue-600",
                                            col.highlight === 'red' && "font-bold text-red-600",
                                            col.maxWidth && "truncate"
                                        )}
                                            style={col.maxWidth ? { maxWidth: col.maxWidth } : {}}
                                            title={col.maxWidth ? String(item[String(col.key)]) : undefined}
                                        >
                                            {col.format ? col.format(item[String(col.key)]) : (
                                                col.type === 'currency'
                                                    ? formatCurrency(item[String(col.key)])
                                                    : col.type === 'number'
                                                        ? formatNumber(item[String(col.key)])
                                                        : item[String(col.key)]
                                            )}
                                        </div>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50 flex-shrink-0">
                <div className="text-xs text-gray-500">
                    <span className="font-medium">{Math.min((currentPage - 1) * rowsPerPage + 1, processedData.length)}</span> - <span className="font-medium">{Math.min(currentPage * rowsPerPage, processedData.length)}</span> of <span className="font-medium">{processedData.length}</span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center px-2 text-xs font-medium text-gray-700">
                        Page {currentPage} / {totalPages}
                    </div>
                    <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
