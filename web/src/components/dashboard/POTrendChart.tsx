'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { getStatusColor } from '@/constants/poStatusColors';

interface TrendData {
    date: string;
    status: string;
    count: number;
}

interface POTrendChartProps {
    data: TrendData[];
}

// Transform data for Recharts (group by date)
const transformData = (data: TrendData[]) => {
    const grouped: Record<string, any> = {};
    const statuses = new Set<string>();

    data.forEach(item => {
        if (!grouped[item.date]) {
            grouped[item.date] = { date: item.date };
        }
        grouped[item.date][item.status] = item.count;
        statuses.add(item.status);
    });

    return {
        chartData: Object.values(grouped),
        statusKeys: Array.from(statuses)
    };
};

export const POTrendChart: React.FC<POTrendChartProps> = ({ data }) => {
    const { chartData, statusKeys } = transformData(data);

    return (
        <div className="w-full h-[300px] bg-card rounded-lg p-4 border border-border">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">PO Trend by Status</h3>
                {/* Add interval selector here if needed */}
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={0} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                        dataKey="date"
                        stroke="#9ca3af"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                    />
                    <YAxis
                        stroke="#9ca3af"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#f3f4f6', fontSize: '12px', borderRadius: '8px' }}
                        cursor={{ fill: '#374151', opacity: 0.1 }}
                    />
                    <Legend
                        wrapperStyle={{ paddingTop: '20px', fontSize: '12px', color: '#6b7280' }}
                        iconType="circle"
                        iconSize={8}
                    />
                    {statusKeys.map((status) => (
                        <Bar
                            key={status}
                            dataKey={status}
                            fill={getStatusColor(status)}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={50}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
