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
    isActive
}) => {
    // Extract status name from title (e.g., "PO Released" -> "Released")
    const statusName = title.replace('PO ', '');
    const statusColor = getStatusColor(statusName);

    return (
        <div
            className={`p-4 rounded-lg border flex flex-col items-center justify-center text-center transition-all ${isActive
                    ? 'bg-card/50 shadow-lg'
                    : 'bg-card'
                }`}
            style={{
                borderColor: isActive ? statusColor : 'hsl(var(--border))',
                borderWidth: isActive ? '2px' : '1px'
            }}
        >
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
            <div className="text-4xl font-bold mb-2">{count}</div>

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
