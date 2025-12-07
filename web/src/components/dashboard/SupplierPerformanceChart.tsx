'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';
import { SupplierPODialog } from '@/components/dashboard/SupplierPODialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Loader2, Download } from 'lucide-react';
import { getSupplierPerformance, SupplierPerformance, SupplierPerformanceResponse } from '@/services/api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface SupplierPerformanceChartProps {
    initialItems?: SupplierPerformance[];
}

const BAR_COLORS = ['#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-xl z-50">
                <p className="font-semibold text-sm mb-1">{payload[0].payload.supplier_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Avg Lead Time:</span>
                    <span className="font-medium text-foreground">{Number(payload[0].value).toFixed(2)} days</span>
                </div>
            </div>
        );
    }
    return null;
};

const CustomYAxisTick = (props: any) => {
    const { x, y, payload } = props;
    return (
        <text
            x={x}
            y={y}
            dy={4}
            textAnchor="end"
            className="fill-foreground text-[11px] font-medium"
        >
            {payload.value}
        </text>
    );
};

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = ({ initialItems }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<{ id: number; name: string; avgLeadTime: number } | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);

    // State for data and pagination
    const [items, setItems] = useState<SupplierPerformance[]>(initialItems ?? []);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [total, setTotal] = useState(initialItems?.length ?? 0);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [interactive, setInteractive] = useState(false);

    useEffect(() => {
        if (interactive) {
            return;
        }
        setItems(initialItems ?? []);
        setTotal(initialItems?.length ?? 0);
    }, [initialItems, interactive]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getSupplierPerformance({
                page,
                pageSize,
                sortField: 'avg_lead_time',
                sortDirection,
            });

            if (res && 'items' in res) {
                const response = res as SupplierPerformanceResponse;
                setItems(response.items || []);
                setTotal(response.total || 0);
            } else if (Array.isArray(res)) {
                // Legacy fallback
                setItems(res.slice(0, pageSize));
                setTotal(res.length);
            }

        } catch (error) {
            console.error("Failed to load supplier performance", error);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, sortDirection]);

    useEffect(() => {
        if (!interactive) {
            return;
        }
        loadData();
    }, [interactive, loadData]);

    const enableInteractive = useCallback(() => {
        if (!interactive) {
            setInteractive(true);
        }
    }, [interactive]);

    const handleExport = async () => {
        if (isDownloading) return;
        enableInteractive();
        setIsDownloading(true);
        try {
            const res = await getSupplierPerformance({
                page: 1,
                pageSize: 10000,
                sortField: 'avg_lead_time',
                sortDirection,
            });
            let allItems: SupplierPerformance[] = [];
            if (res && 'items' in res) {
                const response = res as SupplierPerformanceResponse;
                allItems = response.items || [];
            } else if (Array.isArray(res)) {
                allItems = res as any;
            }

            if (allItems.length === 0) return;

            const headers = ['Supplier ID', 'Supplier Name', 'Avg Lead Time (Days)', 'Total POs', 'Min Lead Time (Days)', 'Max Lead Time (Days)'];
            const escape = (v: any) => {
                const s = v === null || v === undefined ? '' : String(v);
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            }
            const rows = allItems.map(i => [
                i.supplier_id, i.supplier_name, i.avg_lead_time?.toFixed(2),
                i.total_pos, i.min_lead_time?.toFixed(2), i.max_lead_time?.toFixed(2)
            ]);

            const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `supplier-performance-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
        } finally {
            setIsDownloading(false);
        }
    };

    const handleBarClick = (payload?: SupplierPerformance) => {
        if (!payload) return;
        setSelectedSupplier({
            id: payload.supplier_id,
            name: payload.supplier_name,
            avgLeadTime: payload.avg_lead_time,
        });
        setDialogOpen(true);
    };

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm relative overflow-hidden h-full flex flex-col">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <h3 className="text-lg font-semibold">Supplier Performance</h3>
                    <p className="text-xs text-muted-foreground">Average Lead Time (Days)</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading || isDownloading}>
                        <Download className="mr-2 h-4 w-4" /> Export
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                            enableInteractive();
                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                        }}
                        title={sortDirection === 'asc' ? "Sort by Slowest" : "Sort by Fastest"}
                    >
                        {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    </Button>
                </div>
            </div>

            <div className="flex-1 w-full min-h-[300px] relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-card/50 z-10">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        No Data Available
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={items}
                            layout="vertical"
                            margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                            barCategoryGap={16}
                        >
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="supplier_name"
                                type="category"
                                width={230}
                                tick={<CustomYAxisTick />}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                content={<CustomTooltip />}
                                cursor={{ fill: 'transparent' }}
                            />
                            <Bar
                                dataKey="avg_lead_time"
                                radius={[0, 4, 4, 0]}
                                barSize={32}
                                onClick={(data) => handleBarClick(data?.payload as SupplierPerformance)}
                                className="cursor-pointer"
                            >
                                {items.map((entry, index) => (
                                    <Cell
                                        key={entry.supplier_id}
                                        className="transition-opacity hover:opacity-80"
                                        fill={BAR_COLORS[index % BAR_COLORS.length]}
                                    />
                                ))}
                                <LabelList
                                    dataKey="avg_lead_time"
                                    content={(props: any) => {
                                        const { x, y, width, height, value } = props;
                                        // If bar is too short (e.g. < 40px), put label outside
                                        const isSmall = width < 40;
                                        const finalValue = `${Number(value).toFixed(1)}d`;

                                        return (
                                            <text
                                                x={isSmall ? x + width + 5 : x + width - 5}
                                                y={y + height / 2}
                                                fill={isSmall ? "hsl(var(--foreground))" : "#fff"}
                                                textAnchor={isSmall ? "start" : "end"}
                                                dy={4}
                                                fontSize={11}
                                                fontWeight={600}
                                            >
                                                {finalValue}
                                            </text>
                                        );
                                    }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="mt-4 flex items-center justify-between border-t pt-2">
                <span className="text-xs text-muted-foreground">
                    Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                            enableInteractive();
                            setPage(p => Math.max(1, p - 1));
                        }}
                        disabled={page === 1 || loading}
                    >
                        <ArrowLeft className="h-3 w-3 mr-1" /> Prev
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                            enableInteractive();
                            setPage(p => Math.min(totalPages, p + 1));
                        }}
                        disabled={page === totalPages || loading}
                    >
                        Next <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                    <Select value={pageSize.toString()} onValueChange={(v) => {
                        enableInteractive();
                        setPage(1);
                        setPageSize(Number(v));
                    }}>
                        <SelectTrigger className="h-7 w-[70px] text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="5">5</SelectItem>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="20">20</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <SupplierPODialog
                supplier={selectedSupplier}
                open={dialogOpen}
                onOpenChange={(open) => {
                    setDialogOpen(open);
                    if (!open) {
                        setSelectedSupplier(null);
                    }
                }}
            />
        </div>
    );
};
