"use client";

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { operationsService, ValidationResponse } from '@/services/operations';
import { format } from 'date-fns';
import { Loader2, AlertCircle } from "lucide-react";
import { clsx } from "clsx";
import { useRouter } from 'next/navigation';
import { Eye } from "lucide-react";

export default function OperationsPage() {
    const router = useRouter();
    const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [validationLoading, setValidationLoading] = useState(false);

    const [pipelineResult, setPipelineResult] = useState<any>(null);
    const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingExisting, setLoadingExisting] = useState(false);

    const handleViewDetails = (reportKey: string | undefined, fileName: string) => {
        if (!reportKey) return;
        // Navigate to the validation details page
        router.push(`/operations/validation/${encodeURIComponent(reportKey)}`);
    };

    // Auto-fetch existing results when date changes
    React.useEffect(() => {
        const fetchExistingResults = async () => {
            setLoadingExisting(true);
            setError(null);
            try {
                const existingResults = await operationsService.getValidationResults(date);
                if (existingResults) {
                    setValidationResult(existingResults);
                } else {
                    setValidationResult(null);
                }
            } catch (err: any) {
                console.error('Failed to fetch existing results:', err);
                setValidationResult(null);
            } finally {
                setLoadingExisting(false);
            }
        };

        fetchExistingResults();
    }, [date]);

    const handleTriggerPipeline = async (name: string) => {
        setPipelineLoading(true);
        setError(null);
        try {
            const res = await operationsService.triggerPipeline(name, date);
            setPipelineResult(res);
        } catch (err: any) {
            setError(err.message || "Failed to trigger pipeline");
        } finally {
            setPipelineLoading(false);
        }
    };

    const handleRunValidation = async () => {
        setValidationLoading(true);
        setError(null);
        try {
            const res = await operationsService.runValidation(date);
            setValidationResult(res);
        } catch (err: any) {
            setError(err.message || "Failed to run validation");
        } finally {
            setValidationLoading(false);
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-[#F8F9FC] dark:bg-gray-950 overflow-hidden">
            <main className="flex-1 flex flex-col overflow-hidden min-h-0 container mx-auto p-4 sm:p-8">
                <div className="flex flex-col gap-8 h-full min-h-0 overflow-y-auto pb-8">

                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Operations Dashboard</h1>
                            <p className="text-sm text-gray-500">Manage data pipelines and validations</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Label htmlFor="date-picker">Process Date:</Label>
                            <Input
                                id="date-picker"
                                type="date"
                                className="w-48"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg flex items-center gap-2">
                            <AlertCircle className="w-5 h-5" />
                            {error}
                        </div>
                    )}

                    <Tabs defaultValue="stock_health" className="w-full">
                        <TabsList className="mb-4">
                            <TabsTrigger value="stock_health">Stock Health</TabsTrigger>
                            <TabsTrigger value="po_snapshot">PO Snapshot</TabsTrigger>
                        </TabsList>

                        <TabsContent value="stock_health" className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Pipeline Control</CardTitle>
                                        <CardDescription>Trigger the Stock Health pipeline execution</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex flex-col gap-2">
                                            <p className="text-sm text-gray-500">
                                                This will start the pipeline for <strong>{date}</strong>.
                                                It runs asynchronously in the background.
                                            </p>
                                            <Button
                                                onClick={() => handleTriggerPipeline('stock_health')}
                                                disabled={pipelineLoading}
                                                className="w-full sm:w-auto"
                                            >
                                                {pipelineLoading ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Triggering...
                                                    </>
                                                ) : (
                                                    "Trigger Pipeline"
                                                )}
                                            </Button>
                                            {pipelineResult && (
                                                <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded text-sm">
                                                    Job Started (ID: {pipelineResult.run_id})
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Validation</CardTitle>
                                        <CardDescription>Verify output data against input CSVs</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex flex-col gap-2">
                                            <p className="text-sm text-gray-500">
                                                Runs the python validation script for <strong>{date}</strong>.
                                            </p>
                                            {loadingExisting ? (
                                                <div className="text-sm text-gray-500 flex items-center gap-2">
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Checking for existing results...
                                                </div>
                                            ) : validationResult ? (
                                                <div className="text-sm text-green-600 flex items-center gap-2 mb-2">
                                                    ✓ Results already exist for this date
                                                </div>
                                            ) : null}
                                            <Button
                                                variant={validationResult ? "outline" : "default"}
                                                onClick={handleRunValidation}
                                                disabled={validationLoading || loadingExisting}
                                                className="w-full sm:w-auto"
                                            >
                                                {validationLoading ? (
                                                    <>
                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                        Validating...
                                                    </>
                                                ) : validationResult ? (
                                                    "Re-run Validation"
                                                ) : (
                                                    "Run Validation Check"
                                                )}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {validationResult && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium text-gray-500">Total Files</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold">{validationResult.summary.total}</div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium text-gray-500">Success</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold text-green-600">{validationResult.summary.success}</div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium text-gray-500">Errors</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold text-red-600">{validationResult.summary.failed}</div>
                                            </CardContent>
                                        </Card>
                                        <Card>
                                            <CardHeader className="pb-2">
                                                <CardTitle className="text-sm font-medium text-gray-500">Missing Output</CardTitle>
                                            </CardHeader>
                                            <CardContent>
                                                <div className="text-2xl font-bold text-orange-500">{validationResult.summary.missing}</div>
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Validation Details</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="rounded-md border">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>File</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead>Report</TableHead>
                                                            <TableHead>Key Metrics</TableHead>
                                                            <TableHead>Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {validationResult.results.map((res) => (
                                                            <TableRow key={res.file}>
                                                                <TableCell className="font-medium">{res.file}</TableCell>
                                                                <TableCell>
                                                                    <div className={clsx(
                                                                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                                                                        res.status === 'success' ? "bg-green-100 text-green-800" :
                                                                            res.status === 'error' ? "bg-red-100 text-red-800" :
                                                                                "bg-yellow-100 text-yellow-800"
                                                                    )}>
                                                                        {res.status}
                                                                    </div>
                                                                    {res.error && <div className="text-xs text-red-500 mt-1">{res.error}</div>}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {res.report_file && (
                                                                        <span className="text-xs text-gray-500 font-mono truncate max-w-[200px] block" title={res.report_file}>
                                                                            {res.report_file.split('/').pop()}
                                                                        </span>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {res.metrics && (
                                                                        <div className="text-xs space-y-1">
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-gray-500">Sum Cost:</span>
                                                                                <span className="font-mono">
                                                                                    {typeof res.metrics.sum_final_updated_po_cost === 'number'
                                                                                        ? res.metrics.sum_final_updated_po_cost.toLocaleString('id-ID', { style: 'currency', currency: 'IDR' })
                                                                                        : '-'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex justify-between gap-4">
                                                                                <span className="text-gray-500">Mismatches:</span>
                                                                                <span className={clsx("font-mono font-bold", (res.metrics.updated_vs_initial_qty_mismatch_count as number) > 0 ? "text-red-500" : "text-green-600")}>
                                                                                    {res.metrics.updated_vs_initial_qty_mismatch_count}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {res.report_file && (
                                                                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(res.report_file, res.file)}>
                                                                            <Eye className="w-4 h-4 mr-2" />
                                                                            View Details
                                                                        </Button>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            )}
                        </TabsContent>

                        <TabsContent value="po_snapshot">
                            <Card>
                                <CardHeader>
                                    <CardTitle>PO Snapshot Pipeline</CardTitle>
                                    <CardDescription>Trigger the Purchase Order Snapshot pipeline</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex flex-col gap-4">
                                        <p className="text-sm text-gray-500">
                                            This functionality is currently under development. Triggering will store raw snapshots from source.
                                        </p>
                                        <Button disabled variant="secondary">
                                            Execute Pipeline (Coming Soon)
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </main>
        </div>
    );
}
