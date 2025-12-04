import React, { useState, useEffect } from 'react';
import { FileUpload } from './FileUpload';
import { ResultsTable } from './ResultsTable';
import { Sidebar, Store } from './Sidebar';
import { getResults, poService } from '../services/api';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { m2ExportConfig, emergencyExportConfig } from '../utils/exportUtils';

type ColumnDefinition = {
    key: string;
    label: string;
    type: string;
    maxWidth?: string;
};

// Helper function to generate CSV content
const generateCsvContent = (data: any[], columns: ColumnDefinition[]) => {
    // Create header row
    const headers = columns.map(col => `"${col.label}"`).join(',');

    // Create data rows
    const rows = data.map(item => {
        return columns.map(col => {
            // Handle potential undefined or null values
            const value = item[col.key] ?? '';
            // Escape quotes and wrap in quotes
            return `"${String(value).replace(/"/g, '\\"')}"`;
        }).join(',');
    });

    return [headers, ...rows].join('\n');
};

export function Dashboard() {
    const [poFiles, setPoFiles] = useState<File[]>([]);
    const [supplierFile, setSupplierFile] = useState<File | null>(null);
    const [contributionFile, setContributionFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [summary, setSummary] = useState<any>(null);

    // Sidebar and store state
    const [stores, setStores] = useState<Store[]>([]);
    const [selectedStore, setSelectedStore] = useState<string | null>(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [loading, setLoading] = useState(false);
    const [uploadSectionCollapsed, setUploadSectionCollapsed] = useState(false);

    useEffect(() => {
        loadStores();
    }, []);

    const loadStores = async () => {
        try {
            const response = await poService.getStores();
            if (response.data && response.data.length > 0) {
                setStores(response.data);
                // Auto-select first store
                if (!selectedStore) {
                    setSelectedStore(response.data[0].name);
                    loadStoreResults(response.data[0].name);
                }
            }
        } catch (error) {
            console.error('Failed to load stores:', error);
        }
    };

    const loadStoreResults = async (storeName: string) => {
        try {
            setLoading(true);
            const response = await poService.getStoreResults(storeName);
            if (response.data) {
                setResults(response.data);
                // Calculate summary for this store
                calculateSummary(response.data);
                // Auto-collapse upload section when results are available
                if (response.data.length > 0) {
                    setUploadSectionCollapsed(true);
                }
            }
        } catch (error) {
            console.error(`Failed to load results for ${storeName}:`, error);
            setResults([]);
            setSummary(null);
        } finally {
            setLoading(false);
        }
    };

    const calculateSummary = (data: any[]) => {
        if (!data || data.length === 0) {
            setSummary(null);
            return;
        }

        const totalEmergencyCost = data.reduce((sum, row) => sum + (parseFloat(row.emergency_po_cost) || 0), 0);
        const totalRegularCost = data.reduce((sum, row) => sum + (parseFloat(row.final_updated_regular_po_cost) || 0), 0);
        const itemsToOrder = data.filter(row => (parseFloat(row.final_updated_regular_po_qty) || 0) > 0).length;

        setSummary({
            total_skus: data.length,
            total_emergency_po_cost: totalEmergencyCost,
            total_regular_po_cost: totalRegularCost,
            items_to_order: itemsToOrder
        });
    };

    const handleSelectStore = (storeName: string) => {
        setSelectedStore(storeName);
        loadStoreResults(storeName);
    };

    // Auto-expand upload section when there are no results
    useEffect(() => {
        if (results.length === 0 && !loading) {
            setUploadSectionCollapsed(false);
        }
    }, [results, loading]);

    const handleProcess = async () => {
        if (poFiles.length === 0) {
            setErrorMessage("Please upload at least one PO file.");
            setStatus('error');
            return;
        }

        try {
            setStatus('uploading');
            setIsProcessing(true);
            setErrorMessage('');

            // Create FormData
            const formData = new FormData();
            poFiles.forEach((file) => {
                formData.append('files', file);
            });

            if (supplierFile) {
                formData.append('supplier_file', supplierFile);
            }
            if (contributionFile) {
                formData.append('contribution_file', contributionFile);
            }

            // Process
            setStatus('processing');
            const response = await poService.processPO(formData);

            if (response.status === 'success') {
                setStatus('success');

                // Load stores and select first one
                if (response.stores && response.stores.length > 0) {
                    setStores(response.stores);
                    setSelectedStore(response.stores[0].name);
                    loadStoreResults(response.stores[0].name);
                } else {
                    // Fallback: reload stores
                    await loadStores();
                }

                // Clear files after successful processing
                setTimeout(() => {
                    setPoFiles([]);
                    setSupplierFile(null);
                    setContributionFile(null);
                }, 2000);
            } else {
                setStatus('error');
                setErrorMessage(response.message || 'Processing failed');
            }
        } catch (error: any) {
            setStatus('error');
            setErrorMessage(error.message || 'An error occurred during processing');
        } finally {
            setIsProcessing(false);
        }
    };

    // Common function to export stores with custom columns and filters
    const exportStoresWithConfig = async ({
        columns,
        filterFn = () => true,
        zipPrefix = 'po_export'
    }: {
        columns: ColumnDefinition[];
        filterFn?: (item: any) => boolean;
        zipPrefix?: string;
    }): Promise<{ zip: any; zipPrefix: string } | null> => {
        if (!stores || stores.length === 0) {
            setErrorMessage('No stores available to export.');
            setStatus('error');
            return null;
        }
        try {
            // Ensure JSZip is available (load from CDN if needed)
            let JSZipConstructor: any = (window as any).JSZip;
            if (!JSZipConstructor) {
                await new Promise<void>((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.0/jszip.min.js';
                    script.onload = () => resolve();
                    script.onerror = () => reject(new Error('Failed to load JSZip library'));
                    document.body.appendChild(script);
                });
                JSZipConstructor = (window as any).JSZip;
            }
            const zip = new JSZipConstructor();
            let hasData = false;

            for (const store of stores) {
                const res = await poService.getStoreResults(store.name);
                let data = res.data;
                if (!data || !Array.isArray(data) || data.length === 0) {
                    console.warn(`No data for store ${store.name}`);
                    continue;
                }

                // Apply filter function
                data = data.filter(filterFn);
                if (data.length === 0) {
                    console.warn(`No matching data for store ${store.name} after filtering`);
                    continue;
                }

                // Generate CSV content
                const csvContent = generateCsvContent(data, columns);
                const safeName = store.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                zip.file(`${zipPrefix}_${safeName}.csv`, csvContent);
                hasData = true;
            }

            if (!hasData) {
                setErrorMessage('No data available to export after filtering.');
                setStatus('error');
                return null;
            }

            return { zip, zipPrefix };
        } catch (err) {
            console.error('Export error:', err);
            setErrorMessage('Failed to export stores.');
            setStatus('error');
            throw err;
        }
    };

    // Export M2 PO data
    const exportM2 = async () => {
        setStatus('processing');
        try {
            const result = await exportStoresWithConfig({
                columns: m2ExportConfig.columns.map(col => ({
                    key: col.key,
                    label: col.label,
                    type: col.key === 'HPP' || col.key === 'final_updated_regular_po_qty' ? 'number' : 'text'
                })),
                filterFn: (item) => Number(item.final_updated_regular_po_qty) > 0,
                zipPrefix: 'm2_po_export'
            });

            if (result) {
                const { zip, zipPrefix } = result;
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const zipUrl = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = zipUrl;
                link.download = `${zipPrefix}_all_stores.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(zipUrl);
                setStatus('success');
            }
        } catch (err) {
            console.error('M2 export failed:', err);
            setStatus('error');
        }
    };

    // Export Emergency PO data
    const exportEmergency = async () => {
        setStatus('processing');
        try {
            const result = await exportStoresWithConfig({
                columns: emergencyExportConfig.columns.map(col => ({
                    key: col.key,
                    label: col.label,
                    type: col.key === 'HPP' || col.key.endsWith('_qty') || col.key.endsWith('_cost') ? 'number' : 'text'
                })),
                filterFn: (item) => Number(item.emergency_po_qty) > 0,
                zipPrefix: 'emergency_po_export'
            });

            if (result) {
                const { zip, zipPrefix } = result;
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const zipUrl = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = zipUrl;
                link.download = `${zipPrefix}_all_stores.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(zipUrl);
                setStatus('success');
            }
        } catch (err) {
            console.error('Emergency PO export failed:', err);
            setStatus('error');
        }
    };

    // Original exportAllStores function for backward compatibility
    const exportAllStores = async () => {
        setStatus('processing');
        try {
            const columns: ColumnDefinition[] = [
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
                { key: 'current_stock_days_cover', label: 'Days Cover', type: 'number' }
            ];

            const result = await exportStoresWithConfig({
                columns,
                zipPrefix: 'full_export'
            });

            if (result) {
                const { zip, zipPrefix } = result;
                // Generate and trigger download
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const zipUrl = URL.createObjectURL(zipBlob);
                const link = document.createElement('a');
                link.href = zipUrl;
                link.download = `${zipPrefix}_all_stores.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(zipUrl);
                setStatus('success');
            }
        } catch (err) {
            console.error('Export failed:', err);
            setStatus('error');
        }
    };

    // Export M2 data with specific columns and filtering
    const exportAllM2 = async () => {
        await exportM2();
    };

    // Export Emergency data with specific columns and filtering
    const exportAllEmergency = async () => {
        await exportEmergency();
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950 flex transition-colors">
            <Sidebar
                stores={stores}
                selectedStore={selectedStore}
                onSelectStore={handleSelectStore}
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
            <div className={`flex-1 flex flex-col min-h-screen overflow-auto transition-all duration-300 ${sidebarCollapsed ? 'ml-12' : 'ml-64'}`}>
                {/* Header */}
                <div className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 flex-shrink-0 transition-colors">
                    <div className="max-w-full mx-auto px-6 py-4">
                        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            AutoPO Dashboard
                        </h1>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Automated Purchase Order Processing System
                        </p>
                    </div>
                </div>

                {/* File Upload Section */}
                <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 transition-colors">
                    {/* Collapse/Expand Header */}
                    <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upload & Process Files</h3>
                        <button
                            onClick={() => setUploadSectionCollapsed(!uploadSectionCollapsed)}
                            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors text-gray-600 dark:text-gray-400"
                            title={uploadSectionCollapsed ? "Expand upload section" : "Collapse upload section"}
                        >
                            {uploadSectionCollapsed ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronUp className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>

                {/* Collapsible Content */}
                {!uploadSectionCollapsed && (
                    <div className="p-6">
                        <div className="max-w-4xl">
                            <FileUpload
                                poFiles={poFiles}
                                onPoFilesChange={setPoFiles}
                                supplierFile={supplierFile}
                                onSupplierFileChange={setSupplierFile}
                                contributionFile={contributionFile}
                                onContributionFileChange={setContributionFile}
                            />

                            {/* Process Button */}
                            <div className="mt-4">
                                <div className="flex flex-col space-y-2">
                                    <button
                                        onClick={handleProcess}
                                        disabled={isProcessing || poFiles.length === 0}
                                        className={clsx(
                                            "w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200 flex items-center justify-center gap-2",
                                            isProcessing || poFiles.length === 0
                                                ? "bg-gray-300 cursor-not-allowed"
                                                : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl"
                                        )}
                                    >
                                        {isProcessing ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Processing...
                                            </>
                                        ) : (
                                            'Process PO Files'
                                        )}
                                    </button>
                                    <div className="flex flex-col space-y-2 mt-4"> {/* Added mt-4 for spacing */}
                                        <button
                                            onClick={() => exportAllStores()}
                                            disabled={isProcessing || stores.length === 0}
                                            className={clsx(
                                                "w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200",
                                                isProcessing || stores.length === 0
                                                    ? "bg-gray-300 cursor-not-allowed"
                                                    : "bg-green-600 hover:bg-green-700"
                                            )}
                                        >
                                            Export All Stores
                                        </button>
                                        <button
                                            onClick={exportAllM2}
                                            disabled={isProcessing || stores.length === 0}
                                            className={clsx(
                                                "w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200",
                                                isProcessing || stores.length === 0
                                                    ? "bg-gray-300 cursor-not-allowed"
                                                    : "bg-blue-600 hover:bg-blue-700"
                                            )}
                                        >
                                            Export All - M2
                                        </button>
                                        <button
                                            onClick={exportAllEmergency}
                                            disabled={isProcessing || stores.length === 0}
                                            className={clsx(
                                                "w-full py-3 px-6 rounded-lg font-semibold text-white transition-all duration-200",
                                                isProcessing || stores.length === 0
                                                    ? "bg-gray-300 cursor-not-allowed"
                                                    : "bg-red-600 hover:bg-red-700"
                                            )}
                                        >
                                            Export All - Emergency
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Status Messages */}
                            {status === 'success' && (
                                <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-green-900">Processing Complete!</p>
                                        <p className="text-sm text-green-700 mt-1">Your PO files have been processed successfully.</p>
                                    </div>
                                </div>
                            )}

                            {status === 'error' && errorMessage && (
                                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-semibold text-red-900">Error</p>
                                        <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Results Section */}
                <div className="flex-1 overflow-hidden p-6">
                    {selectedStore ? (
                        <div className="h-full flex flex-col">
                            {/* Summary */}
                            {summary && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 flex-shrink-0">
                                    <div className="bg-card dark:bg-gray-800 p-5 rounded-xl border border-border dark:border-gray-700 shadow-sm transition-colors">
                                        <p className="text-[11px] font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wider mb-2">Total SKUs</p>
                                        <p className="text-3xl font-bold text-foreground dark:text-white tracking-tight">{summary.total_skus}</p>
                                    </div>
                                    <div className="bg-card dark:bg-gray-800 p-5 rounded-xl border border-border dark:border-gray-700 shadow-sm transition-colors">
                                        <p className="text-[11px] font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wider mb-2">Items to Order</p>
                                        <p className="text-3xl font-bold text-green-600 dark:text-green-400 tracking-tight">{summary.items_to_order}</p>
                                    </div>
                                    <div className="bg-card dark:bg-gray-800 p-5 rounded-xl border border-border dark:border-gray-700 shadow-sm transition-colors">
                                        <p className="text-[11px] font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wider mb-2">Regular PO Cost</p>
                                        <p className="text-xl font-bold text-purple-600 dark:text-purple-400 mt-1 truncate tracking-tight" title={summary.total_regular_po_cost}>
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(summary.total_regular_po_cost)}
                                        </p>
                                    </div>
                                    <div className="bg-card dark:bg-gray-800 p-5 rounded-xl border border-border dark:border-gray-700 shadow-sm transition-colors">
                                        <p className="text-[11px] font-semibold text-muted-foreground dark:text-gray-400 uppercase tracking-wider mb-2">Emergency PO Cost</p>
                                        <p className="text-xl font-bold text-red-600 dark:text-red-400 mt-1 truncate tracking-tight" title={summary.total_emergency_po_cost}>
                                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(summary.total_emergency_po_cost)}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Results Table */}
                            <div className="flex-1 overflow-hidden">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                    </div>
                                ) : (
                                    <ResultsTable data={results} storeName={selectedStore || undefined} />
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center text-gray-500 dark:text-gray-400">
                                <p className="text-lg font-medium">No store selected</p>
                                <p className="text-sm mt-2">Process some PO files or select a store from the sidebar</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
