import React from 'react';
import { ArrowUp, ArrowDown, Check } from 'lucide-react';

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
    return (
        <div className={`p-4 rounded-lg border ${isActive ? 'bg-blue-900/20 border-blue-500' : 'bg-card border-border'} flex flex-col items-center justify-center text-center`}>
            <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
            <div className="text-4xl font-bold mb-2">{count}</div>

            <div className="flex items-center gap-2 text-xs mb-1">
                {diffDays !== undefined && (
                    <span className={`flex items-center ${diffDays > 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {diffDays > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        {Math.abs(diffDays)}
                    </span>
                )}
                {/* Check icon if completed? Just mimicking the image */}
                {title === "PO Released" && <Check size={12} className="text-orange-500" />}

                <span className="text-muted-foreground">|</span>
                <span className="font-medium">{formatCurrency(value)}</span>
            </div>

            <div className="text-xs text-muted-foreground">
                Avg. Days in Status: {avgDays.toFixed(0)}
            </div>
        </div>
    );
};
