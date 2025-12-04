'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';

interface SupplierPerformance {
    supplier_id: number;
    supplier_name: string;
    avg_lead_time: number;
}

interface SupplierPerformanceChartProps {
    data: SupplierPerformance[];
}

export const SupplierPerformanceChart: React.FC<SupplierPerformanceChartProps> = ({ data }) => {
    return (
        <div className="w-full h-[300px] bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold mb-1">Supplier Performance</h3>
            <p className="text-xs text-muted-foreground mb-4">Ranking Top 5 Lead Time to receive loads</p>

            <ResponsiveContainer width="100%" height="100%">
                <BarChart
                    data={data}
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
                    <Bar dataKey="avg_lead_time" fill="#f97316" radius={[0, 4, 4, 0]} barSize={20}>
                        <LabelList dataKey="avg_lead_time" position="right" fill="#6b7280" fontSize={11} formatter={(val: any) => Number(val).toFixed(0)} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
