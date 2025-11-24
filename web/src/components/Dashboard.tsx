import React, { useState } from 'react';
import { FileUpload } from './FileUpload';
import { ResultsTable } from './ResultsTable';
import { uploadFiles, processPO } from '../services/api';
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

            // 1. Upload Files
            await uploadFiles(poFiles);

            // 2. Process
            setStatus('processing');
            const response = await processPO(supplierFile || undefined, contributionFile || undefined);

            if (response.status === 'success') {
                setResults(response.data);
                setSummary(response.summary);
                setStatus('success');
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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900">AutoPO Dashboard</h1>
                <p className="mt-2 text-gray-600">Upload stock data files to generate purchase order suggestions.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
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
            </div>

            <div className="flex flex-col items-center justify-center mb-8">
                {status === 'error' && (
                    <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        {errorMessage}
                    </div>
                )}

                <button
                    onClick={handleProcess}
                    disabled={isProcessing || poFiles.length === 0}
                    className={`
            flex items-center px-8 py-4 text-lg font-semibold rounded-full shadow-lg transition-all transform hover:scale-105
            ${isProcessing
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'}
          `}
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

            {summary && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <p className="text-sm text-blue-600 font-medium">Total SKUs</p>
                        <p className="text-2xl font-bold text-blue-900">{summary.total_skus}</p>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                        <p className="text-sm text-green-600 font-medium">Items to Order</p>
                        <p className="text-2xl font-bold text-green-900">{summary.items_to_order}</p>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                        <p className="text-sm text-purple-600 font-medium">Regular PO Cost</p>
                        <p className="text-2xl font-bold text-purple-900">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(summary.total_regular_po_cost)}
                        </p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                        <p className="text-sm text-red-600 font-medium">Emergency PO Cost</p>
                        <p className="text-2xl font-bold text-red-900">
                            {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(summary.total_emergency_po_cost)}
                        </p>
                    </div>
                </div>
            )}

            {results.length > 0 && <ResultsTable data={results} />}
        </div>
    );
}
