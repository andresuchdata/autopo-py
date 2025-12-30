'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { operationsService, type PipelineRun } from '@/services/operations';
import { format } from 'date-fns';
import {
    Clock,
    CheckCircle2,
    XCircle,
    Pause,
    Play,
    RotateCcw,
    Eye,
    Calendar,
    Filter,
    RefreshCw
} from 'lucide-react';

interface PipelineRunHistoryProps {
    pipelineName: string;
    onViewRun?: (runId: number) => void;
}

export function PipelineRunHistory({ pipelineName, onViewRun }: PipelineRunHistoryProps) {
    const [runs, setRuns] = useState<PipelineRun[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const pageSize = 20;

    useEffect(() => {
        loadRuns();
    }, [pipelineName, page]);

    const loadRuns = async () => {
        try {
            setLoading(true);
            const { runs: fetchedRuns } = await operationsService.listPipelineRuns(
                pipelineName,
                pageSize,
                page * pageSize
            );

            if (page === 0) {
                setRuns(fetchedRuns);
            } else {
                setRuns(prev => [...prev, ...fetchedRuns]);
            }

            setHasMore(fetchedRuns.length === pageSize);
        } catch (error) {
            console.error('Failed to load runs:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        setPage(0);
        loadRuns();
    };

    const handlePause = async (runId: number) => {
        try {
            await operationsService.pausePipelineRun(pipelineName, runId);
            loadRuns();
        } catch (error) {
            console.error('Failed to pause run:', error);
        }
    };

    const handleResume = async (runId: number) => {
        try {
            await operationsService.resumePipelineRun(pipelineName, runId);
            loadRuns();
        } catch (error) {
            console.error('Failed to resume run:', error);
        }
    };

    const handleRetry = async (runId: number) => {
        try {
            await operationsService.retryFailedStores(pipelineName, runId);
            loadRuns();
        } catch (error) {
            console.error('Failed to retry run:', error);
        }
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, { variant: any; icon: any; label: string }> = {
            pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
            processing: { variant: 'default', icon: RefreshCw, label: 'Processing' },
            completed: { variant: 'default', icon: CheckCircle2, label: 'Completed' },
            failed: { variant: 'destructive', icon: XCircle, label: 'Failed' },
            paused: { variant: 'outline', icon: Pause, label: 'Paused' },
        };

        const config = variants[status] || variants.pending;
        const Icon = config.icon;

        return (
            <Badge variant={config.variant} className="gap-1">
                <Icon className="h-3 w-3" />
                {config.label}
            </Badge>
        );
    };

    const filteredRuns = runs.filter(run => {
        if (statusFilter !== 'all' && run.status !== statusFilter) return false;
        if (dateFilter && !run.date.includes(dateFilter)) return false;
        return true;
    });

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Pipeline Run History</CardTitle>
                        <CardDescription>
                            View and manage previous pipeline runs
                        </CardDescription>
                    </div>
                    <Button onClick={handleRefresh} variant="outline" size="sm">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-[180px]">
                                    <SelectValue placeholder="Filter by status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Status</SelectItem>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="processing">Processing</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                    <SelectItem value="failed">Failed</SelectItem>
                                    <SelectItem value="paused">Paused</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <Input
                                type="date"
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value)}
                                placeholder="Filter by date"
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Run ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Progress</TableHead>
                                <TableHead>Started</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading && runs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        Loading runs...
                                    </TableCell>
                                </TableRow>
                            ) : filteredRuns.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No runs found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredRuns.map((run) => {
                                    const progress = run.total_files > 0
                                        ? Math.round((run.processed_files / run.total_files) * 100)
                                        : 0;

                                    const duration = run.completed_at
                                        ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
                                        : null;

                                    return (
                                        <TableRow key={run.id}>
                                            <TableCell className="font-medium">#{run.id}</TableCell>
                                            <TableCell>{run.date}</TableCell>
                                            <TableCell>{getStatusBadge(run.status)}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all"
                                                            style={{ width: `${progress}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm text-muted-foreground">
                                                        {run.processed_files}/{run.total_files}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {format(new Date(run.started_at), 'MMM d, HH:mm')}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {duration ? `${duration}s` : '-'}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => onViewRun?.(run.id)}
                                                    >
                                                        <Eye className="h-4 w-4" />
                                                    </Button>
                                                    {run.status === 'processing' && !run.is_paused && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handlePause(run.id)}
                                                        >
                                                            <Pause className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {run.is_paused && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleResume(run.id)}
                                                        >
                                                            <Play className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {run.status === 'failed' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRetry(run.id)}
                                                        >
                                                            <RotateCcw className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>

                {/* Load More */}
                {hasMore && !loading && (
                    <div className="flex justify-center">
                        <Button
                            variant="outline"
                            onClick={() => setPage(p => p + 1)}
                        >
                            Load More
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
