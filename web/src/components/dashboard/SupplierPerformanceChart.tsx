'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';
import { SupplierPODialog } from '@/components/dashboard/SupplierPODialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { getSupplierPerformance, SupplierPerformance, SupplierPerformanceResponse } from '@/services/api';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface SupplierPerformanceChartProps { }

const BAR_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5'];

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

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = () => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<{ id: number; name: string } | null>(null);

    // State for data and pagination
    const [items, setItems] = useState<SupplierPerformance[]>([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(5); // Default to 5 to match typical chart height, or let user change? 5 is good for "Top N".
    const [total, setTotal] = useState(0);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc'); // Default fastest first

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
        loadData();
    }, [loadData]);

    const handleBarClick = (payload?: SupplierPerformance) => {
        if (!payload) return;
        setSelectedSupplier({ id: payload.supplier_id, name: payload.supplier_name });
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
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
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
                                width={120}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
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
                                    position="insideRight"
                                    fill="#fff"
                                    fontSize={11}
                                    fontWeight={600}
                                    formatter={(val: any) => `${Number(val).toFixed(1)}d`}
                                    offset={8}
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
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1 || loading}
                    >
                        <ArrowLeft className="h-3 w-3 mr-1" /> Prev
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages || loading}
                    >
                        Next <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                    <Select value={pageSize.toString()} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
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
