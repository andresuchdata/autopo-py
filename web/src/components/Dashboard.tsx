import React, { useState, useEffect } from 'react';
import { FileUpload } from './FileUpload';
import { ResultsTable } from './ResultsTable';
import { Sidebar, Store } from './Sidebar';
import { getResults, poService } from '../services/api';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
            {/* Header */}
            <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
                <div className="max-w-full mx-auto px-6 py-4">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        AutoPO Dashboard
                    </h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Automated Purchase Order Processing System
                    </p>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">
                {/* Sidebar */}
                <Sidebar
                    stores={stores}
                    selectedStore={selectedStore}
                    onSelectStore={handleSelectStore}
                    collapsed={sidebarCollapsed}
                    onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                />

                {/* Main Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* File Upload Section */}
                    <div className="bg-white border-b border-gray-200 flex-shrink-0">
                        {/* Collapse/Expand Header */}
                        <div className="px-6 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                            <h3 className="text-sm font-semibold text-gray-700">Upload & Process Files</h3>
                            <button
                                onClick={() => setUploadSectionCollapsed(!uploadSectionCollapsed)}
                                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-600"
                                title={uploadSectionCollapsed ? "Expand upload section" : "Collapse upload section"}
                            >
                                {uploadSectionCollapsed ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronUp className="w-4 h-4" />
                                )}
                            </button>
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
                    </div>

                    {/* Results Section */}
                    <div className="flex-1 overflow-hidden p-6">
                        {selectedStore ? (
                            <div className="h-full flex flex-col">
                                {/* Summary */}
                                {summary && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 flex-shrink-0">
                                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                            <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Total SKUs</p>
                                            <p className="text-2xl font-bold text-blue-900 mt-1">{summary.total_skus}</p>
                                        </div>
                                        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                            <p className="text-xs text-green-600 font-medium uppercase tracking-wide">Items to Order</p>
                                            <p className="text-2xl font-bold text-green-900 mt-1">{summary.items_to_order}</p>
                                        </div>
                                        <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                                            <p className="text-xs text-purple-600 font-medium uppercase tracking-wide">Regular PO Cost</p>
                                            <p className="text-lg font-bold text-purple-900 mt-1 truncate" title={summary.total_regular_po_cost}>
                                                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(summary.total_regular_po_cost)}
                                            </p>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                            <p className="text-xs text-red-600 font-medium uppercase tracking-wide">Emergency PO Cost</p>
                                            <p className="text-lg font-bold text-red-900 mt-1 truncate" title={summary.total_emergency_po_cost}>
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
                                <div className="text-center text-gray-500">
                                    <p className="text-lg font-medium">No store selected</p>
                                    <p className="text-sm mt-2">Process some PO files or select a store from the sidebar</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
