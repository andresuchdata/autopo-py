'use client';

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';
import { SupplierPODialog } from '@/components/dashboard/SupplierPODialog';

interface SupplierPerformance {
    supplier_id: number;
    supplier_name: string;
    avg_lead_time: number;
}

interface SupplierPerformanceChartProps {
    data: SupplierPerformance[];
}

const BAR_COLORS = ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5'];

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-xl">
                <p className="font-semibold text-sm mb-1">{label}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Avg Lead Time:</span>
                    <span className="font-medium text-foreground">{Number(payload[0].value).toFixed(2)} days</span>
                </div>
            </div>
        );
    }
    return null;
};

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = ({ data }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<{ id: number; name: string } | null>(null);

    const chartData = useMemo(() => data ?? [], [data]);

    const handleBarClick = (payload?: SupplierPerformance) => {
        if (!payload) return;
        setSelectedSupplier({ id: payload.supplier_id, name: payload.supplier_name });
        setDialogOpen(true);
    };

    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm relative overflow-hidden h-full">
            <h3 className="text-lg font-semibold mb-1">Supplier Performance</h3>
            <p className="text-xs text-muted-foreground mb-6">Top 5 Lowest Lead Times (Load Speed)</p>

            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                        barCategoryGap={16}
                    >
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="supplier_name"
                            type="category"
                            width={100}
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ fill: 'hsl(var(--muted)/0.2)', radius: 4 }}
                        />
                        <Bar
                            dataKey="avg_lead_time"
                            radius={[0, 4, 4, 0]}
                            barSize={32}
                            onClick={(data) => handleBarClick(data?.payload as SupplierPerformance)}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={entry.supplier_id}
                                    className="cursor-pointer transition-opacity hover:opacity-80"
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
