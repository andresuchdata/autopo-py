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
    return count.toLocaleString();
};

export const POFunnelChart: React.FC<POFunnelChartProps> = ({ data }) => {
    const svgHeight = 300;
    const svgWidth = 980;
    const padding = { top: 30, right: 20, bottom: 30, left: 20 };
    const chartHeight = svgHeight - padding.top - padding.bottom;
    const chartWidth = svgWidth - padding.left - padding.right;
    const centerY = padding.top + chartHeight / 2;
    const edgeBlend = 0.45;
    const curveStrength = 0.12;

    // Calculate the width of each segment
    const segmentWidth = chartWidth / data.length;

    // Find max value for scaling heights
    const maxValue = Math.max(...data.map(d => d.total_value));

    const minRatio = 0.18;
    const getHeight = (value: number) => {
        if (maxValue === 0) {
            return chartHeight * minRatio;
        }

        const normalized = Math.max(value, 0) / maxValue;
        const eased = Math.pow(normalized, 0.8);
        const ratio = minRatio + (1 - minRatio) * eased;
        return chartHeight * ratio;
    };

    const heights = data.map(item => getHeight(item.total_value));
    const boundaryHeights = heights.length
        ? heights.map((_, index) => (index === 0 ? heights[0] : (heights[index - 1] + heights[index]) / 2))
        : [];
    if (heights.length) {
        boundaryHeights.unshift(heights[0]);
        boundaryHeights.push(heights[heights.length - 1]);
    }

    // Generate segment with curved borders
    const generateSegment = (index: number, item: FunnelData) => {
        const startX = padding.left + index * segmentWidth;
        const endX = startX + segmentWidth;
        const midX = startX + segmentWidth / 2;
        const currentHeight = heights[index];
        const leftHeight = boundaryHeights[index];
        const rightHeight = boundaryHeights[index + 1];

        const topCenter = centerY - currentHeight / 2;
        const bottomCenter = centerY + currentHeight / 2;
        const topLeft = centerY - leftHeight / 2;
        const bottomLeft = centerY + leftHeight / 2;
        const topRight = centerY - rightHeight / 2;
        const bottomRight = centerY + rightHeight / 2;

        const curveInset = segmentWidth * curveStrength;

        const path = `
            M ${startX} ${topLeft}
            C ${startX + curveInset} ${topLeft} ${midX - curveInset} ${topCenter} ${midX} ${topCenter}
            C ${midX + curveInset} ${topCenter} ${endX - curveInset} ${topRight} ${endX} ${topRight}
            L ${endX} ${bottomRight}
            C ${endX - curveInset} ${bottomRight} ${midX + curveInset} ${bottomCenter} ${midX} ${bottomCenter}
            C ${midX - curveInset} ${bottomCenter} ${startX + curveInset} ${bottomLeft} ${startX} ${bottomLeft}
            Z
        `;

        return { path, midX, currentHeight, topCenter, bottomCenter };
    };

    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border">
            <h3 className="text-lg font-semibold mb-4">PO Lifecycle Funnel</h3>
            <div className="w-full overflow-x-auto">
                <svg width={svgWidth} height={svgHeight} className="w-full" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
                    {data.map((item, index) => {
                        const { path, midX, currentHeight, topCenter, bottomCenter } = generateSegment(index, item);
                        const textInside = currentHeight > 70;
                        const labelY = textInside ? centerY - 18 : topCenter - 10;
                        const statsY = textInside ? centerY + 4 : topCenter + 8;
                        const valueY = textInside ? centerY + 26 : topCenter + 28;

                        return (
                            <g key={index}>
                                {/* Segment shape with curved borders */}
                                <path
                                    d={path}
                                    fill={getStatusColor(item.stage)}
                                    stroke="rgba(255, 255, 255, 0.12)"
                                    strokeWidth="1"
                                    className="transition-transform duration-300 hover:scale-[1.015] cursor-pointer"
                                    style={{ filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.25))' }}
                                />

                                {/* Text labels */}
                                <text
                                    x={midX}
                                    y={labelY}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="18"
                                    fontWeight="600"
                                    style={{ textShadow: '0px 1px 3px rgba(0,0,0,0.7)' }}
                                >
                                    {item.stage}
                                </text>

                                <text
                                    x={midX}
                                    y={statsY}
                                    textAnchor="middle"
                                    fill="#fff"
                                    fontSize="15"
                                    opacity={0.95}
                                    style={{ textShadow: '0px 1px 2px rgba(0,0,0,0.6)' }}
                                >
                                    {formatCount(item.count)} · {formatCount(Math.round(item.total_value / 1_000_000))}M
                                </text>

                                <text
                                    x={midX}
                                    y={valueY}
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
