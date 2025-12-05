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

// Generate color palette for time periods (gradient from light to dark)
const generateTimeColors = (count: number): string[] => {
    const baseColors = [
        '#3B82F6', // Blue
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#F59E0B', // Amber
        '#10B981', // Green
    ];
    
    if (count <= baseColors.length) {
        return baseColors.slice(0, count);
    }
    
    // If more than 5 periods, generate gradient
    const colors: string[] = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 360) / count;
        colors.push(`hsl(${hue}, 70%, 60%)`);
    }
    return colors;
};

// Transform data: group by status (x-axis), with dates as separate bars
const transformData = (data: TrendData[]) => {
    const statusOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived'];
    const grouped: Record<string, any> = {};
    const dates = new Set<string>();

    // Group by status
    data.forEach(item => {
        if (!grouped[item.status]) {
            grouped[item.status] = { status: item.status };
        }
        grouped[item.status][item.date] = item.count;
        dates.add(item.date);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(dates).sort();
    
    // Sort statuses by defined order
    const chartData = statusOrder
        .filter(status => grouped[status])
        .map(status => grouped[status]);

    return {
        chartData,
        dateKeys: sortedDates
    };
};

export const POTrendChart: React.FC<POTrendChartProps> = ({ data }) => {
    const { chartData, dateKeys } = transformData(data);
    const timeColors = generateTimeColors(dateKeys.length);

    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">PO Trend by Status</h3>
                {/* Add interval selector here if needed */}
            </div>
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barGap={0} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                    <XAxis
                        dataKey="status"
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
                    {dateKeys.map((date: string, index: number) => (
                        <Bar
                            key={date}
                            dataKey={date}
                            fill={timeColors[index]}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={40}
                            name={new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
};
