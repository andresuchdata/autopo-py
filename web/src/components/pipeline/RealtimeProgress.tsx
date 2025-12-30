'use client';

import { usePipelineSSE, type ProgressUpdate } from '@/hooks/usePipelineSSE';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Pause, Play, RotateCcw, Activity, CheckCircle2, XCircle, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import type { StoreProgress } from '@/services/operations';

interface RealtimeProgressProps {
    pipelineName: string;
    runId: number | null;
    onPause?: () => void;
    onResume?: () => void;
    onRetry?: () => void;
    isPaused?: boolean;
}

export function RealtimeProgress({
    pipelineName,
    runId,
    onPause,
    onResume,
    onRetry,
    isPaused
}: RealtimeProgressProps) {
    const [progressData, setProgressData] = useState<ProgressUpdate | null>(null);

    const { isConnected, lastUpdate } = usePipelineSSE({
        pipelineName,
        runId,
        onProgress: (update) => {
            setProgressData(update);
        },
        onComplete: (data) => {
            console.log('Pipeline completed:', data);
        },
        onError: (error) => {
            console.error('SSE error:', error);
        }
    });

    if (!runId) {
        return null;
    }

    const data = lastUpdate || progressData;
    const progressPercent = data?.total_files ? (data.processed_files / data.total_files) * 100 : 0;

    return (
        <div className="space-y-4">
            {/* Status Card */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CardTitle>Pipeline Status</CardTitle>
                            {isConnected && (
                                <Badge variant="outline" className="gap-1">
                                    <Activity className="h-3 w-3 animate-pulse" />
                                    Live
                                </Badge>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {data?.status === 'processing' && !isPaused && (
                                <Button variant="outline" size="sm" onClick={onPause}>
                                    <Pause className="h-4 w-4 mr-1" />
                                    Pause
                                </Button>
                            )}
                            {isPaused && (
                                <Button variant="outline" size="sm" onClick={onResume}>
                                    <Play className="h-4 w-4 mr-1" />
                                    Resume
                                </Button>
                            )}
                            {(data?.failed_count ?? 0) > 0 && (
                                <Button variant="outline" size="sm" onClick={onRetry}>
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Retry Failed
                                </Button>
                            )}
                        </div>
                    </div>
                    <CardDescription>
                        Run ID: {runId} • {data?.timestamp && format(new Date(data.timestamp), 'PPpp')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Overall Progress */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>Overall Progress</span>
                            <span className="font-medium">
                                {data?.processed_files || 0} / {data?.total_files || 0} files
                            </span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                        <div className="text-xs text-muted-foreground">
                            {Math.round(progressPercent)}% complete • {data?.total_rows?.toLocaleString() || 0} rows processed
                        </div>
                    </div>

                    {/* Status Counts */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                            <Clock className="h-5 w-5 text-yellow-600 mb-1" />
                            <div className="text-2xl font-bold">{data?.queued_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Queued</div>
                        </div>
                        <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                            <Loader2 className="h-5 w-5 text-blue-600 mb-1 animate-spin" />
                            <div className="text-2xl font-bold">{data?.processing_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Processing</div>
                        </div>
                        <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                            <CheckCircle2 className="h-5 w-5 text-green-600 mb-1" />
                            <div className="text-2xl font-bold">{data?.completed_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Completed</div>
                        </div>
                        <div className="flex flex-col items-center p-3 rounded-lg bg-muted">
                            <XCircle className="h-5 w-5 text-red-600 mb-1" />
                            <div className="text-2xl font-bold">{data?.failed_count || 0}</div>
                            <div className="text-xs text-muted-foreground">Failed</div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Store Progress Grid */}
            {data?.store_progress && data.store_progress.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Store Progress</CardTitle>
                        <CardDescription>
                            Detailed progress for each store
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {data.store_progress.map((store) => (
                                <StoreProgressCard key={store.store_id} store={store} />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function StoreProgressCard({ store }: { store: StoreProgress }) {
    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'completed': return 'bg-green-500';
            case 'failed': return 'bg-red-500';
            case 'processing': return 'bg-blue-500';
            case 'cleaning': return 'bg-yellow-500';
            case 'calculating': return 'bg-purple-500';
            case 'finishing': return 'bg-indigo-500';
            default: return 'bg-gray-500';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
            case 'failed': return <XCircle className="h-4 w-4 text-red-600" />;
            case 'processing': return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
            default: return <Clock className="h-4 w-4 text-gray-600" />;
        }
    };

    return (
        <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div className="font-medium truncate">{store.store_name}</div>
                {getStatusIcon(store.status)}
            </div>

            <div className="space-y-1">
                <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{store.stage}</span>
                    <span className="font-medium">{store.progress_percent}%</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${getStageColor(store.stage)}`}
                        style={{ width: `${store.progress_percent}%` }}
                    />
                </div>
            </div>

            {store.error_message && (
                <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
                    {store.error_message}
                </div>
            )}

            {store.retry_count > 0 && (
                <div className="text-xs text-muted-foreground">
                    Retries: {store.retry_count}
                </div>
            )}

            <div className="text-xs text-muted-foreground">
                Updated: {format(new Date(store.updated_at), 'HH:mm:ss')}
            </div>
        </div>
    );
}
