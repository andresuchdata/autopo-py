'use client';

import React from 'react';
import { getStatusColor } from '@/constants/poStatusColors';

interface FunnelData {
    stage: string;
    count: number;
    total_value: number;
    fill: string;
}

interface POFunnelChartProps {
    data: FunnelData[];
}

const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
        return `Rp ${(value / 1000000000).toFixed(1)} bio`;
    }
    if (value >= 1000000) {
        return `Rp ${(value / 1000000).toFixed(1)} mio`;
    }
    if (value >= 1000) {
        return `Rp ${(value / 1000).toFixed(1)}K`;
    }
    return `Rp ${value.toLocaleString()}`;
};

const formatCount = (count: number) => {
    if (count >= 1000) {
        return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
};

export const POFunnelChart: React.FC<POFunnelChartProps> = ({ data }) => {
    const svgHeight = 300;
    const svgWidth = 980;
    const padding = { top: 30, right: 20, bottom: 30, left: 20 };
    const chartHeight = svgHeight - padding.top - padding.bottom;
    const chartWidth = svgWidth - padding.left - padding.right;

    // Calculate the width of each segment
    const segmentWidth = chartWidth / data.length;

    // Find max value for scaling heights
    const maxValue = Math.max(...data.map(d => d.total_value));

    // Generate segment with curved borders
    const generateSegment = (index: number, item: FunnelData) => {
        const x = padding.left + index * segmentWidth;
        const ratio = item.total_value / maxValue;
        const height = chartHeight * ratio;

        // Center vertically
        const top = padding.top + (chartHeight - height) / 2;
        const bottom = top + height;

        // Next segment info for curved border
        const nextRatio = index < data.length - 1 ? data[index + 1].total_value / maxValue : ratio;
        const nextHeight = chartHeight * nextRatio;
        const nextTop = padding.top + (chartHeight - nextHeight) / 2;
        const nextBottom = nextTop + nextHeight;

        // Control point offset for curves (how much the curve bends)
        const curveOffset = segmentWidth * 0.5;

        let path = '';

        if (index === 0) {
            // First segment - straight left edge, curved right edge
            path = `
                M ${x} ${top}
                L ${x + segmentWidth} ${top}
                Q ${x + segmentWidth + curveOffset} ${(top + nextTop) / 2} ${x + segmentWidth} ${nextTop}
                L ${x + segmentWidth} ${nextBottom}
                Q ${x + segmentWidth + curveOffset} ${(bottom + nextBottom) / 2} ${x + segmentWidth} ${bottom}
                L ${x} ${bottom}
                Z
            `;
        } else if (index === data.length - 1) {
            // Last segment - curved left edge, straight right edge
            const prevRatio = data[index - 1].total_value / maxValue;
            const prevHeight = chartHeight * prevRatio;
            const prevTop = padding.top + (chartHeight - prevHeight) / 2;
            const prevBottom = prevTop + prevHeight;

            path = `
                M ${x} ${prevTop}
                L ${x + segmentWidth} ${top}
                L ${x + segmentWidth} ${bottom}
                L ${x} ${prevBottom}
                Q ${x - curveOffset} ${(prevBottom + bottom) / 2} ${x} ${prevBottom}
                L ${x} ${prevTop}
                Q ${x - curveOffset} ${(prevTop + top) / 2} ${x} ${prevTop}
                Z
            `;
        } else {
            // Middle segments - curved on both sides
            const prevRatio = data[index - 1].total_value / maxValue;
            const prevHeight = chartHeight * prevRatio;
            const prevTop = padding.top + (chartHeight - prevHeight) / 2;
            const prevBottom = prevTop + prevHeight;

            path = `
                M ${x} ${prevTop}
                L ${x + segmentWidth} ${top}
                Q ${x + segmentWidth + curveOffset} ${(top + nextTop) / 2} ${x + segmentWidth} ${nextTop}
                L ${x + segmentWidth} ${nextBottom}
                Q ${x + segmentWidth + curveOffset} ${(bottom + nextBottom) / 2} ${x + segmentWidth} ${bottom}
                L ${x} ${prevBottom}
                Q ${x - curveOffset} ${(prevBottom + bottom) / 2} ${x} ${prevBottom}
                L ${x} ${prevTop}
                Q ${x - curveOffset} ${(prevTop + top) / 2} ${x} ${prevTop}
                Z
            `;
        }

        return { path, x, top, bottom, height };
    };

    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold mb-4">PO Lifecycle Funnel</h3>
            <div className="w-full overflow-x-auto">
                <svg width={svgWidth} height={svgHeight} className="w-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
                    {data.map((item, index) => {
                        const { path, x, top, bottom, height } = generateSegment(index, item);
                        const centerY = (top + bottom) / 2;

                        return (
                            <g key={index}>
                                {/* Segment shape with curved borders */}
                                <path
                                    d={path}
                                    fill={getStatusColor(item.stage)}
                                    stroke="rgba(0, 0, 0, 0.15)"
                                    strokeWidth="0.5"
                                    className="transition-opacity hover:opacity-90 cursor-pointer"
                                />

                                {/* Text labels */}
                                <text
                                    x={x + segmentWidth / 2}
                                    y={centerY - 22}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="18"
                                    fontWeight="600"
                                    style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.7)' }}
                                >
                                    {item.stage}
                                </text>

                                <text
                                    x={x + segmentWidth / 2}
                                    y={centerY + 2}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="15"
                                    opacity={0.95}
                                    style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.6)' }}
                                >
                                    {item.count} · {formatCount(item.total_value / (item.total_value >= 1000000 ? 1000000 : 1))}
                                </text>

                                <text
                                    x={x + segmentWidth / 2}
                                    y={centerY + 22}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="14"
                                    opacity={0.9}
                                    style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.6)' }}
                                >
                                    {formatCurrency(item.total_value)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};
