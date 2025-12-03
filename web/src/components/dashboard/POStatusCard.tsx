import React from 'react';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';
import { getStatusColor } from '@/constants/poStatusColors';

interface POStatusCardProps {
    title: string;
    count: number;
    value: number;
    avgDays: number;
    diffDays?: number; // For the "big number" diff or similar
    isActive?: boolean;
    onClick?: () => void;
    className?: string;
}

const formatCurrency = (value: number) => {
    if (value >= 1000000000) {
        return `Rp ${(value / 1000000000).toFixed(1)} bio`;
    }
    if (value >= 1000000) {
        return `Rp ${(value / 1000000).toFixed(1)} mio`;
    }
    return `Rp ${value.toLocaleString()}`;
};

export const POStatusCard: React.FC<POStatusCardProps> = ({
    title,
    count,
    value,
    avgDays,
    diffDays,
    isActive,
    onClick,
    className
}) => {
    // Extract status name from title (e.g., "PO Released" -> "Released")
    const statusName = title.replace('PO ', '');
    const statusColor = getStatusColor(statusName);
    const activeClasses = isActive ? 'bg-primary/10 shadow-lg border-transparent' : 'bg-card border-border hover:border-transparent';
    const interactiveClasses = onClick ? 'hover:-translate-y-1 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary' : '';
    const cardClasses = `relative overflow-hidden p-4 rounded-2xl border flex flex-col items-center justify-center text-center cursor-pointer select-none transition-all duration-300 ease-out ${activeClasses} ${interactiveClasses} ${className ?? ''}`.trim();

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
            className={cardClasses}
            style={{
                borderColor: isActive ? statusColor : undefined,
            }}
        >
            <div
                className="absolute inset-x-6 top-3 h-1 rounded-full opacity-30 transition-opacity"
                style={{ backgroundColor: statusColor }}
            />
            <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-2">{title}</h3>
            <div className="text-4xl font-bold mb-2 tracking-tight">{count}</div>

            <div className="flex items-center gap-2 text-xs mb-1">
                {diffDays !== undefined && (
                    <span className={`flex items-center ${diffDays > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {diffDays > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        {Math.abs(diffDays)}
                    </span>
                )}
                <Check size={12} style={{ color: statusColor }} />

                <span className="text-muted-foreground">|</span>
                <span className="font-medium">{formatCurrency(value)}</span>
            </div>

            <div className="text-xs text-muted-foreground">
                Avg. Days in Status: {avgDays.toFixed(0)}
            </div>
        </div>
    );
};
