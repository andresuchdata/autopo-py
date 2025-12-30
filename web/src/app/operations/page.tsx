"use client";

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { operationsService, type ValidationResponse, type PipelineConfig } from '@/services/operations';
import { format } from 'date-fns';
import {
    Loader2,
    AlertCircle,
    AlertTriangle,
    Eye,
    Play,
    History,
    Activity,
    Settings2,
    ChevronRight,
    ArrowUpRight,
    RefreshCw,
    Plus,
    Square,
    XCircle
} from "lucide-react";
import { clsx } from "clsx";
import { useRouter } from 'next/navigation';
import {
    PipelineConfigPanel,
    RealtimeProgress,
    PipelineRunHistory
} from '@/components/pipeline';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function OperationsPage() {
    const router = useRouter();
    const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [pipelineLoading, setPipelineLoading] = useState(false);
    const [validationLoading, setValidationLoading] = useState(false);

    const [activeRunId, setActiveRunId] = useState<number | null>(null);
    const [configOpen, setConfigOpen] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingExisting, setLoadingExisting] = useState(false);
    const [showWarning, setShowWarning] = useState(false);
    const [pendingConfig, setPendingConfig] = useState<PipelineConfig | null>(null);

    const handleViewDetails = (reportKey: string | undefined) => {
        if (!reportKey) return;
        // Navigate to the validation details page
        router.push(`/operations/validation/${encodeURIComponent(reportKey)}`);
    };

    // Auto-fetch existing results when date changes
    useEffect(() => {
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
            } catch (err) {
                console.error('Failed to fetch existing results:', err);
                setValidationResult(null);
            } finally {
                setLoadingExisting(false);
            }
        };

        fetchExistingResults();
    }, [date]);

    // Removed handleTriggerPipeline as handleConfigureSubmit is now the main entry point

    const handleRunValidation = async () => {
        setValidationLoading(true);
        setError(null);
        try {
            const res = await operationsService.runValidation(date);
            setValidationResult(res);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to run validation");
        } finally {
            setValidationLoading(false);
        }
    };

    const handleConfigureSubmit = async (config: PipelineConfig) => {
        // Check if a run already exists for this date
        try {
            const { runs } = await operationsService.listPipelineRuns('stock_health', 1, 0);
            const existingRun = runs.find(run =>
                format(new Date(run.date), 'yyyy-MM-dd') === config.run_date
            );

            if (existingRun) {
                // Show warning dialog
                setPendingConfig(config);
                setShowWarning(true);
                return;
            }
        } catch (err) {
            console.error('Failed to check existing runs:', err);
        }

        // No existing run, proceed directly
        await executePipeline(config);
    };

    const executePipeline = async (config: PipelineConfig) => {
        setPipelineLoading(true);
        setError(null);
        try {
            const res = await operationsService.configurePipeline('stock_health', config);
            setActiveRunId(res.run_id);
            setConfigOpen(false);
            setShowWarning(false);
            setPendingConfig(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to trigger pipeline");
        } finally {
            setPipelineLoading(false);
        }
    };

    const handleStopAll = async () => {
        if (!confirm("Are you sure you want to stop all active pipeline processing?")) return;

        try {
            await operationsService.stopAllPipelines();
            setActiveRunId(null);
            setError(null);
        } catch (err) {
            console.error('Failed to stop all runs:', err);
            setError("Failed to stop processing. Please try again.");
        }
    };

    return (
        <div className="flex h-[calc(100vh-4rem)] bg-[#F8F9FC] dark:bg-gray-950 overflow-hidden">
            <main className="flex-1 flex flex-col overflow-hidden min-h-0 container mx-auto p-4 sm:p-8">
                <div className="flex flex-col gap-8 h-full min-h-0 overflow-y-auto pb-8">

                    {/* Header Section */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                <Settings2 className="h-8 w-8 text-indigo-600" />
                                Operations Dashboard
                            </h1>
                            <p className="text-muted-foreground mt-1">
                                Command center for stock health and PO snapshot pipelines.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex flex-col items-end">
                                <Label htmlFor="date-picker" className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-1">Context Date</Label>
                                <Input
                                    id="date-picker"
                                    type="date"
                                    className="w-40 h-9 bg-white dark:bg-gray-900 shadow-sm"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-4 rounded-xl flex items-center gap-3 border border-rose-100 animate-in fade-in zoom-in duration-300">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}

                    <Tabs defaultValue="stock_health" className="w-full">
                        <div className="flex items-center justify-between mb-6">
                            <TabsList className="bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border p-1 h-11">
                                <TabsTrigger value="stock_health" className="px-6 h-9 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    <Activity className="h-4 w-4 mr-2" />
                                    Stock Health
                                </TabsTrigger>
                                <TabsTrigger value="po_snapshot" className="px-6 h-9 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                    <History className="h-4 w-4 mr-2" />
                                    PO Snapshot
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <TabsContent value="stock_health" className="space-y-12 animate-in fade-in duration-500">

                            {/* Section 1: Pipeline Management */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b pb-4">
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <Activity className="h-5 w-5 text-indigo-600" />
                                        Pipeline Management
                                    </h2>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-rose-600 border-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/10 gap-2 h-9"
                                            onClick={handleStopAll}
                                        >
                                            <Square className="h-4 w-4 fill-current" />
                                            Stop All
                                        </Button>

                                        <Sheet open={configOpen} onOpenChange={setConfigOpen}>
                                            <SheetTrigger asChild>
                                                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 shadow-md gap-2 h-9">
                                                    <Plus className="h-4 w-4" />
                                                    Launch Pipeline
                                                </Button>
                                            </SheetTrigger>
                                            <SheetContent className="w-[90%] sm:w-[600px] sm:max-w-[700px] overflow-y-auto">
                                                <SheetHeader className="mb-6">
                                                    <SheetTitle className="text-2xl">Pipeline Configuration</SheetTitle>
                                                    <SheetDescription>
                                                        Define the parameters for your next pipeline execution.
                                                    </SheetDescription>
                                                </SheetHeader>
                                                <PipelineConfigPanel
                                                    pipelineName="stock_health"
                                                    isLoading={pipelineLoading}
                                                    onSubmit={handleConfigureSubmit}
                                                />
                                            </SheetContent>
                                        </Sheet>
                                    </div>
                                </div>

                                {/* Live Monitoring */}
                                {activeRunId && (
                                    <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-600">Active Execution</h2>
                                        </div>
                                        <RealtimeProgress
                                            pipelineName="stock_health"
                                            runId={activeRunId}
                                            isPaused={isPaused}
                                            onPause={() => setIsPaused(true)}
                                            onResume={() => setIsPaused(false)}
                                        />
                                    </div>
                                )}

                                <Card className="border-none shadow-sm shadow-indigo-100 overflow-hidden">
                                    <PipelineRunHistory
                                        pipelineName="stock_health"
                                        onViewRun={(runId) => {
                                            setActiveRunId(runId);
                                            const scrollContainer = document.querySelector('.overflow-y-auto');
                                            if (scrollContainer) {
                                                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
                                            }
                                        }}
                                    />
                                </Card>
                            </div>

                            {/* Section 2: Data Validation Results */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b pb-4">
                                    <h2 className="text-xl font-bold flex items-center gap-2">
                                        <ChevronRight className="h-5 w-5 text-indigo-600" />
                                        Data Validation
                                    </h2>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleRunValidation}
                                        disabled={validationLoading || loadingExisting}
                                        className="gap-2"
                                    >
                                        {validationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                        {validationResult ? "Re-sync Results" : "Run Validation"}
                                    </Button>
                                </div>

                                {validationResult ? (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {[
                                                { label: 'Total Files', value: validationResult.summary.total, color: 'text-gray-900', bg: 'bg-gray-50' },
                                                { label: 'Success', value: validationResult.summary.success, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                                                { label: 'Errors', value: validationResult.summary.failed, color: 'text-rose-600', bg: 'bg-rose-50' },
                                                { label: 'Missing', value: validationResult.summary.missing, color: 'text-amber-600', bg: 'bg-amber-50' },
                                            ].map((stat) => (
                                                <Card key={stat.label} className={clsx("border-none shadow-sm shadow-indigo-100", stat.bg)}>
                                                    <CardHeader className="pb-2 pt-4">
                                                        <CardTitle className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{stat.label}</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="pb-4">
                                                        <div className={clsx("text-2xl font-black", stat.color)}>{stat.value}</div>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>

                                        <Card className="border-none shadow-lg shadow-gray-200/50 overflow-hidden">
                                            <div className="rounded-md">
                                                <Table>
                                                    <TableHeader className="bg-gray-50/50">
                                                        <TableRow>
                                                            <TableHead className="font-bold">File</TableHead>
                                                            <TableHead className="font-bold">Status</TableHead>
                                                            <TableHead className="font-bold">Key Metrics</TableHead>
                                                            <TableHead className="text-right font-bold w-[120px]">Actions</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {validationResult.results.map((res) => (
                                                            <TableRow key={res.file} className="hover:bg-indigo-50/30 transition-colors">
                                                                <TableCell className="font-medium py-4">
                                                                    <div className="flex flex-col">
                                                                        <span>{res.file}</span>
                                                                        {res.report_file && (
                                                                            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                                                                                {res.report_file.split('/').pop()}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell>
                                                                    <div className={clsx(
                                                                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider",
                                                                        res.status === 'success' ? "bg-emerald-100 text-emerald-800" :
                                                                            res.status === 'error' ? "bg-rose-100 text-rose-800" :
                                                                                "bg-amber-100 text-amber-800"
                                                                    )}>
                                                                        {res.status}
                                                                    </div>
                                                                    {res.error && <div className="text-[10px] text-rose-500 mt-1">{res.error}</div>}
                                                                </TableCell>
                                                                <TableCell>
                                                                    {res.metrics && (
                                                                        <div className="text-[11px] space-y-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-muted-foreground">Cost:</span>
                                                                                <span className="font-bold">
                                                                                    {typeof res.metrics.sum_final_updated_po_cost === 'number'
                                                                                        ? res.metrics.sum_final_updated_po_cost.toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
                                                                                        : '-'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-muted-foreground">Mismatches:</span>
                                                                                <span className={clsx("font-black", (res.metrics.updated_vs_initial_qty_mismatch_count as number) > 0 ? "text-rose-500" : "text-emerald-600")}>
                                                                                    {res.metrics.updated_vs_initial_qty_mismatch_count}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right">
                                                                    {res.report_file && (
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="hover:text-indigo-600 hover:bg-indigo-50"
                                                                            onClick={() => handleViewDetails(res.report_file)}
                                                                        >
                                                                            <Eye className="w-4 h-4 mr-2" />
                                                                            Details
                                                                            <ArrowUpRight className="w-3 h-3 ml-1" />
                                                                        </Button>
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </Card>
                                    </div>
                                ) : (
                                    <Card className="border-dashed border-2 flex flex-col items-center justify-center py-20 bg-gray-50/50">
                                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                                            <Settings2 className="h-6 w-6 text-gray-400" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">No results for this date</p>
                                        <p className="text-xs text-gray-500 mt-1">Run validation to see the analysis</p>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="mt-6"
                                            onClick={handleRunValidation}
                                            disabled={validationLoading}
                                        >
                                            {validationLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                            Start Validation
                                        </Button>
                                    </Card>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="po_snapshot" className="space-y-6 animate-in fade-in duration-500">
                            <Card className="border-dashed border-2 flex flex-col items-center justify-center py-32 bg-gray-50/50">
                                <History className="h-12 w-12 text-gray-300 mb-4" />
                                <h3 className="text-lg font-bold">PO Snapshot Management</h3>
                                <p className="text-muted-foreground max-w-sm text-center mt-2 px-8">
                                    This module is currently being optimized. Visit the legacy dashboard for snapshot operations.
                                </p>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </main>

            {/* Warning Dialog for Existing Runs */}
            <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            Pipeline Run Already Exists
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            A pipeline run already exists for the selected date ({pendingConfig?.run_date}).
                            Proceeding will reset the existing run and start fresh. All previous progress will be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => pendingConfig && executePipeline(pendingConfig)}
                            className="bg-amber-500 hover:bg-amber-600"
                        >
                            Continue Anyway
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
