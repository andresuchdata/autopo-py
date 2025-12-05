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
        <div className="w-full bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold mb-1">Supplier Performance</h3>
            <p className="text-xs text-muted-foreground mb-4">Ranking Top 5 Lead Time to receive loads</p>

            <div className="h-64 md:h-72">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="supplier_name"
                            type="category"
                            width={100}
                            tick={{ fill: '#6b7280', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: '#374151', opacity: 0.1 }}
                            contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', fontSize: '12px', borderRadius: '8px' }}
                        />
                        <Bar
                            dataKey="avg_lead_time"
                            radius={[0, 4, 4, 0]}
                            barSize={20}
                            onClick={(data) => handleBarClick(data?.payload as SupplierPerformance)}
                        >
                            {chartData.map((entry, index) => (
                                <Cell
                                    key={entry.supplier_id}
                                    className="cursor-pointer"
                                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                                />
                            ))}
                            <LabelList dataKey="avg_lead_time" position="right" fill="#6b7280" fontSize={11} formatter={(val: any) => Number(val).toFixed(2)} />
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
