import React, { useState, useEffect } from 'react';
import { FileUpload } from './FileUpload';
import { ResultsTable } from './ResultsTable';
import { DataTable, ColumnDef } from './DataTable';
import { getResults, poService } from '../services/api';
import { clsx } from 'clsx';
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react';

export function Dashboard() {
    const [poFiles, setPoFiles] = useState<File[]>([]);
    const [supplierFile, setSupplierFile] = useState<File | null>(null);
    const [contributionFile, setContributionFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<any[]>([]);
    const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [summary, setSummary] = useState<any>(null);

    // Tab state
    const [activeTab, setActiveTab] = useState<'results' | 'suppliers' | 'contributions'>('results');
    const [supplierData, setSupplierData] = useState<any[]>([]);
    const [contributionData, setContributionData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadResults();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            if (activeTab === 'suppliers' && supplierData.length === 0) {
                try {
                    setLoading(true);
                    const res = await poService.getSuppliers();
                    setSupplierData(res.data || []);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            } else if (activeTab === 'contributions' && contributionData.length === 0) {
                try {
                    setLoading(true);
                    const res = await poService.getContributions();
                    setContributionData(res.data || []);
                } catch (e) {
                    console.error(e);
                } finally {
                    setLoading(false);
                }
            }
        };
        fetchData();
    }, [activeTab]);

    const loadResults = async () => {
        try {
            setLoading(true);
            const response = await getResults();
            if (response.data) {
                setResults(response.data);
                // If we have summary in response, set it (need to update API to return summary on get)
            }
        } catch (error) {
            console.error('Failed to load results:', error);
        } finally {
            setLoading(false);
        }
    };

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
                setResults(response.data);
                setSummary(response.summary);
                setStatus('success');
                setActiveTab('results');
            } else {
                throw new Error(response.message || "Processing failed");
            }

        } catch (err: any) {
            console.error(err);
            setStatus('error');
            setErrorMessage(err.message || "An error occurred during processing.");
        } finally {
            setIsProcessing(false);
        }
    };

    // Column definitions for reference data
    const supplierColumns: ColumnDef<any>[] = [
        { key: 'Supplier Code', label: 'Code', type: 'text' },
        { key: 'Supplier Name', label: 'Name', type: 'text' },
        { key: 'Contact Person', label: 'Contact', type: 'text' },
        { key: 'Phone', label: 'Phone', type: 'text' },
        { key: 'Email', label: 'Email', type: 'text' },
    ];

    const contributionColumns: ColumnDef<any>[] = [
        { key: 'store', label: 'Store', type: 'text' },
        { key: 'contribution_pct', label: 'Contribution %', type: 'number' },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">AutoPO Dashboard</h1>
                <p className="mt-2 text-gray-600">Upload stock data files to generate purchase order suggestions.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Uploads & Actions */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-lg font-semibold mb-4">1. Upload Store Data</h2>
                        <FileUpload
                            label="Store Excel/CSV Files"
                            accept=".xlsx,.csv"
                            onFilesSelected={setPoFiles}
                        />
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-lg font-semibold mb-4">2. Upload Supplier Data (Optional)</h2>
                        <FileUpload
                            label="Supplier Mapping CSV"
                            accept=".csv"
                            multiple={false}
                            onFilesSelected={(files) => setSupplierFile(files[0])}
                        />
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h2 className="text-lg font-semibold mb-4">3. Upload Store Contribution (Optional)</h2>
                        <FileUpload
                            label="Contribution CSV"
                            accept=".csv"
                            multiple={false}
                            onFilesSelected={(files) => setContributionFile(files[0])}
                        />
                    </div>

                    <div className="flex flex-col items-center justify-center">
                        {status === 'error' && (
                            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center w-full">
                                <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
                                <span className="text-sm">{errorMessage}</span>
                            </div>
                        )}

                        <button
                            onClick={handleProcess}
                            disabled={isProcessing || poFiles.length === 0}
                            className={clsx(
                                "w-full flex items-center justify-center px-8 py-4 text-lg font-semibold rounded-xl shadow-lg transition-all transform hover:scale-[1.02]",
                                isProcessing || poFiles.length === 0
                                    ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                            )}
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-6 h-6 mr-2" />
                                    Process PO Data
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Right Column: Results & Data */}
                <div className="lg:col-span-2">
                    {/* Summary Section */}
                    {summary && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
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

                    {/* Tabs */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 mb-6 flex space-x-1">
                        <button
                            onClick={() => setActiveTab('results')}
                            className={clsx(
                                "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                                activeTab === 'results'
                                    ? "bg-blue-50 text-blue-700 shadow-sm"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            Processing Results
                        </button>
                        <button
                            onClick={() => setActiveTab('suppliers')}
                            className={clsx(
                                "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                                activeTab === 'suppliers'
                                    ? "bg-blue-50 text-blue-700 shadow-sm"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            Supplier Data
                        </button>
                        <button
                            onClick={() => setActiveTab('contributions')}
                            className={clsx(
                                "flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200",
                                activeTab === 'contributions'
                                    ? "bg-blue-50 text-blue-700 shadow-sm"
                                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            )}
                        >
                            Store Contributions
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px]">
                        {loading ? (
                            <div className="flex items-center justify-center h-[500px]">
                                <div className="flex flex-col items-center">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-2" />
                                    <p className="text-gray-500 text-sm">Loading data...</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                {activeTab === 'results' && (
                                    results.length > 0 ? (
                                        <ResultsTable data={results} />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-[500px] text-gray-400">
                                            <FileSpreadsheet className="w-16 h-16 mb-4 opacity-20" />
                                            <p>No results generated yet.</p>
                                            <p className="text-sm mt-2">Upload files and click "Process PO Data" to begin.</p>
                                        </div>
                                    )
                                )}

                                {activeTab === 'suppliers' && (
                                    <DataTable
                                        data={supplierData}
                                        columns={supplierColumns}
                                        title="Supplier Data"
                                        filename="suppliers.csv"
                                    />
                                )}

                                {activeTab === 'contributions' && (
                                    <DataTable
                                        data={contributionData}
                                        columns={contributionColumns}
                                        title="Store Contributions"
                                        filename="contributions.csv"
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function FileSpreadsheet(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
            <path d="M14 2v4a2 2 0 0 0 2 2h4" />
            <path d="M8 13h2" />
            <path d="M14 13h2" />
            <path d="M8 17h2" />
            <path d="M14 17h2" />
        </svg>
    )
}
