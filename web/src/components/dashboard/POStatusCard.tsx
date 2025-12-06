import React from 'react';
import { ArrowUp, ArrowDown, Package, ShoppingCart, DollarSign, Clock, Layers } from 'lucide-react';
import { getStatusColor } from '@/constants/poStatusColors';

interface POStatusCardProps {
    title: string;
    count: number;
    totalValue: number;
    skuCount: number;
    totalQty: number;
    avgDays: number;
    diffDays?: number; // For the "big number" diff or similar
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
}

const formatCurrencyShort = (value: number) => {
    if (value >= 1000000000) {
        return `${(value / 1000000000).toFixed(1)}B`;
    }
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
};

const formatNumberShort = (value: number) => {
    if (value >= 1000000) {
        return `${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toLocaleString();
};

export const POStatusCard: React.FC<POStatusCardProps> = ({
    title,
    count,
    totalValue,
    skuCount,
    totalQty,
    avgDays,
    diffDays,
    isActive,
    onClick,
    className
}) => {
    // Extract status name from title (e.g., "PO Released" -> "Released")
    const statusName = title.replace('PO ', '');
    const statusColor = getStatusColor(statusName);

    // Determine styles based on active state
    // Active: slightly colored background, ring, backdrop blur
    // Inactive: standard card, hover effects (beautiful shadow, subtle lift, border highlight)
    const activeClasses = isActive
        ? 'ring-2 ring-primary ring-offset-2 bg-card/80 backdrop-blur-sm shadow-md'
        : 'bg-card border-border hover:bg-[rgba(148,163,184,0.14)] hover:border-[rgba(148,163,184,0.6)] hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300';

    const interactiveClasses = onClick
        ? 'cursor-pointer transition-all duration-200 select-none'
        : '';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={(event) => {
                if (!onClick) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick();
                }
            }}
            aria-pressed={isActive}
            className={`
                group relative overflow-hidden rounded-xl border p-4
                flex flex-col gap-3 min-h-[160px]
                ${activeClasses} ${interactiveClasses} ${className ?? ''}
            `.trim()}
            style={{
                borderColor: isActive ? statusColor : undefined,
            }}
        >
            {/* Top accent bar */}
            <div
                className="absolute inset-x-0 top-0 h-1 transition-opacity opacity-80"
                style={{ backgroundColor: statusColor }}
            />

            {/* Header: Title and Main PO Count */}
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{statusName}</h3>
                    <div className="text-3xl font-bold tracking-tight mt-1">{count} <span className="text-sm font-normal text-muted-foreground">POs</span></div>
                </div>
                <div
                    className="p-2 rounded-full bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                    style={{ color: isActive ? statusColor : undefined, backgroundColor: isActive ? `${statusColor}20` : undefined }}
                >
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-3 mt-auto pt-2 border-t border-border/50">
                {/* Total Value */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                        <DollarSign size={10} /> Value
                    </span>
                    <span className="text-sm font-bold" title={`Rp ${totalValue.toLocaleString()}`}>
                        {formatCurrencyShort(totalValue)}
                    </span>
                </div>

                {/* Total Qty */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                        <Package size={10} /> Qty
                    </span>
                    <span className="text-sm font-bold" title={totalQty.toLocaleString()}>
                        {formatNumberShort(totalQty)}
                    </span>
                </div>

                {/* SKU Count */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                        <Layers size={10} /> SKUs
                    </span>
                    <span className="text-sm font-bold">
                        {skuCount.toLocaleString()}
                    </span>
                </div>

                {/* Avg Days */}
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase text-muted-foreground font-medium flex items-center gap-1">
                        <Clock size={10} /> Avg Days
                    </span>
                    <div className="flex items-center gap-1">
                        <span className="text-sm font-bold">{avgDays.toFixed(0)}</span>
                        {diffDays !== undefined && diffDays !== 0 && (
                            <span className={`text-[10px] items-center flex ${diffDays > 0 ? 'text-red-500' : 'text-green-500'}`}>
                                {diffDays > 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                                {Math.abs(diffDays)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
