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
    // Define the desired order for PO status stages (same as PO Status cards)
    const stageOrder = ['Released', 'Sent', 'Approved', 'Declined', 'Arrived'];

    // Sort data according to the defined order
    const sortedData = [...data].sort((a, b) => {
        const indexA = stageOrder.indexOf(a.stage);
        const indexB = stageOrder.indexOf(b.stage);
        // If stage not found in order array, put it at the end
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    const svgHeight = 420;
    const svgWidth = 980;
    const padding = { top: 30, right: 20, bottom: 30, left: 20 };
    const chartHeight = svgHeight - padding.top - padding.bottom;
    const chartWidth = svgWidth - padding.left - padding.right;
    const centerY = padding.top + chartHeight / 2;
    const curveStrength = 0.35;

    // Calculate the width of each segment
    const segmentWidth = chartWidth / sortedData.length;

    // Find max value for scaling heights
    const maxValue = Math.max(...sortedData.map(d => d.total_value));

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

    const rawHeights = sortedData.map(item => getHeight(item.total_value));
    const heights = rawHeights.map((height, index) => {
        const prev = rawHeights[index - 1] ?? height;
        const next = rawHeights[index + 1] ?? height;
        const neighborAvg = (prev + next) / 2;
        const blendFactor = 0.35;
        return height * (1 - blendFactor) + neighborAvg * blendFactor;
    });
    const boundaryHeights: number[] = [];
    if (heights.length === 1) {
        boundaryHeights.push(heights[0], heights[0]);
    } else if (heights.length > 1) {
        for (let i = 0; i <= heights.length; i++) {
            if (i === 0) {
                const current = heights[0];
                const next = heights[1];
                boundaryHeights.push((current + next) / 2);
            } else if (i === heights.length) {
                const prev = heights[i - 1];
                const prevPrev = heights[i - 2];
                boundaryHeights.push((prev + prevPrev) / 2);
            } else {
                boundaryHeights.push((heights[i - 1] + heights[i]) / 2);
            }
        }
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

        const leftControlOffset = segmentWidth * 0.18 * 0.5; // Reduced control offset for tighter curves
        const rightControlOffset = segmentWidth * 0.18 * 0.5;

        // More complex path for a smoother "3D" look could be simulated with gradients, 
        // but here we improve the curve calculation
        const path = `
            M ${startX} ${topLeft}
            C ${startX + leftControlOffset} ${topLeft} ${midX - leftControlOffset} ${topCenter} ${midX} ${topCenter}
            C ${midX + rightControlOffset} ${topCenter} ${endX - rightControlOffset} ${topRight} ${endX} ${topRight}
            L ${endX} ${bottomRight}
            C ${endX - rightControlOffset} ${bottomRight} ${midX + rightControlOffset} ${bottomCenter} ${midX} ${bottomCenter}
            C ${midX - leftControlOffset} ${bottomCenter} ${startX + leftControlOffset} ${bottomLeft} ${startX} ${bottomLeft}
            Z
        `;

        return { path, midX, currentHeight, topCenter, bottomCenter };
    };

    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

            <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                PO Lifecycle Funnel
                <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">30 Days</span>
            </h3>

            <div className="w-full overflow-x-auto pb-2">
                <svg width={svgWidth} height={svgHeight} className="w-full min-w-[600px]" viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMidYMid meet">
                    <defs>
                        {/* Define gradients for each status */}
                        {sortedData.map((item, index) => {
                            const color = getStatusColor(item.stage);
                            return (
                                <linearGradient key={`grad-${index}`} id={`grad-${index}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor={color} stopOpacity={0.8} />
                                    <stop offset="50%" stopColor={color} stopOpacity={1} />
                                    <stop offset="100%" stopColor={color} stopOpacity={0.8} />
                                </linearGradient>
                            );
                        })}
                        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                            <feGaussianBlur stdDeviation="3" result="blur" />
                            <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                    </defs>

                    {sortedData.map((item, index) => {
                        const { path, midX, currentHeight, topCenter } = generateSegment(index, item);
                        const textInside = currentHeight > 90; // Increased threshold
                        const labelY = textInside ? centerY - 22 : topCenter - 30;
                        const statsY = textInside ? centerY + 2 : topCenter - 12;
                        const valueY = textInside ? centerY + 24 : topCenter + 8; // Adjust based on layout

                        // Connector line for outside labels
                        const lineY1 = topCenter - 5;
                        const lineY2 = topCenter - 35;

                        return (
                            <g key={index} className="group">
                                {/* Segment shape */}
                                <path
                                    d={path}
                                    fill={`url(#grad-${index})`}
                                    stroke="rgba(255, 255, 255, 0.15)"
                                    strokeWidth="1"
                                    className="transition-all duration-300 hover:opacity-90 cursor-pointer"
                                    style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))' }}
                                />

                                {/* Connector line for outside labels */}
                                {!textInside && (
                                    <line
                                        x1={midX} y1={lineY1} x2={midX} y2={lineY2}
                                        stroke={getStatusColor(item.stage)}
                                        strokeWidth="1"
                                        strokeDasharray="2 2"
                                        opacity="0.6"
                                    />
                                )}

                                {/* Stage Label */}
                                <text
                                    x={midX}
                                    y={labelY}
                                    textAnchor="middle"
                                    fill={textInside ? "#fff" : "currentColor"}
                                    className={textInside ? "fill-white drop-shadow-md" : "fill-muted-foreground"}
                                    fontSize="12"
                                    fontWeight="600"
                                    style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                >
                                    {item.stage}
                                </text>

                                {/* Count & Value M */}
                                <text
                                    x={midX}
                                    y={statsY}
                                    textAnchor="middle"
                                    fill={textInside ? "#fff" : "currentColor"}
                                    className={textInside ? "fill-white/95 drop-shadow-sm" : "fill-foreground"}
                                    fontSize="16"
                                    fontWeight="700"
                                >
                                    {formatCount(item.count)} <tspan fontSize="12" fontWeight="400" opacity="0.8">POs</tspan>
                                </text>

                                {/* Full Value */}
                                <text
                                    x={midX}
                                    y={valueY}
                                    textAnchor="middle"
                                    fill={textInside ? "#fff" : "currentColor"}
                                    className={textInside ? "fill-white/90" : "fill-muted-foreground"}
                                    fontSize="12"
                                    fontWeight="500"
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
