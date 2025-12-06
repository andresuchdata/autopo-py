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

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-xl">
                <p className="font-semibold text-sm mb-2">{new Date(label).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 text-xs">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                            <span className="text-muted-foreground capitalize">{entry.name}:</span>
                            <span className="font-medium">{entry.value.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export const POTrendChart: React.FC<POTrendChartProps> = ({ data }) => {
    const { chartData, dateKeys } = transformData(data);
    const timeColors = generateTimeColors(dateKeys.length);

    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm relative overflow-hidden group">
            {/* Background decoration */}
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/30 rounded-full blur-3xl pointer-events-none group-hover:bg-secondary/40 transition-colors" />

            <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    PO Trend by Status
                </h3>
            </div>

            <div className="h-[350px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} barGap={4} barCategoryGap="20%">
                        <CartesianGrid
                            strokeDasharray="4 4"
                            vertical={false}
                            stroke="hsl(var(--muted-foreground))"
                            strokeOpacity={0.1}
                        />
                        <XAxis
                            dataKey="status"
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                            stroke="hsl(var(--muted-foreground))"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            dx={-10}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                        <Legend
                            wrapperStyle={{ paddingTop: '24px', fontSize: '12px' }}
                            iconType="circle"
                            iconSize={8}
                        />
                        {dateKeys.map((date: string, index: number) => (
                            <Bar
                                key={date}
                                dataKey={date}
                                fill={timeColors[index]}
                                radius={[4, 4, 0, 0]}
                                maxBarSize={50}
                                name={new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                animationDuration={1000}
                            />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
