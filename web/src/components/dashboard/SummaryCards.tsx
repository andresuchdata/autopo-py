import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConditionKey } from "@/services/dashboardService";
import { Skeleton } from "@/components/ui/skeleton";
import { type SummaryGrouping } from "@/types/stockHealth";
import { formatCurrencyIDR } from "@/utils/formatters";
import {
    Layers,
    ClipboardCheck,
    TrendingDown,
    AlertTriangle,
    PackageX,
    Ban,
    AlertOctagon,
    Package,
    Box,
    DollarSign,
    Hash
} from "lucide-react";

const COLORS = {
    'overstock': '#3b82f6',      // Blue
    'healthy': '#10b981',        // Green
    'low': '#f59e0b',            // Yellow
    'nearly_out': '#ef4444',     // Red
    'out_of_stock': '#1f2937',   // Black (Dark Gray in UI)
    'no_sales': '#8b5cf6',       // Violet
    'negative_stock': '#991b1b'  // Dark Red
};

const ICONS = {
    'overstock': Layers,
    'healthy': ClipboardCheck,
    'low': TrendingDown,
    'nearly_out': AlertTriangle,
    'out_of_stock': PackageX,
    'no_sales': Ban,
    'negative_stock': AlertOctagon
};

const CONDITION_LABELS = {
    'overstock': 'Long over stock',
    'healthy': 'Sehat',
    'low': 'Kurang',
    'nearly_out': 'Menuju habis',
    'out_of_stock': 'Habis',
    'no_sales': 'Not Sales',
    'negative_stock': 'Stock Minus'
};

const HEADER_LABELS = {
    'overstock': 'Days Stock Cover > 30 days',
    'healthy': '21 < Days Stock Cover <= 30 days',
    'low': '7 < Days Stock Cover <= 21 days',
    'nearly_out': '0 < Days Stock Cover <= 7 days',
    'out_of_stock': 'Days Stock Cover = 0 day',
    'no_sales': 'Not Sales',
    'negative_stock': 'Stock Minus'
};

interface SummaryCardsProps {
    summary: {
        totalItems: number;
        totalStock: number;
        totalValue: number;
        byCondition: Record<ConditionKey, number>;
        stockByCondition: Record<ConditionKey, number>;
        valueByCondition: Record<ConditionKey, number>;
    };
    onCardClick: (condition: ConditionKey, grouping: SummaryGrouping) => void;
    isLoading?: boolean;
}

const CONDITIONS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock', 'no_sales', 'negative_stock'];
const HIGHLIGHT_CONDITIONS = new Set<ConditionKey>(['no_sales', 'negative_stock']);

function HeaderRow() {
    return (
        <>
            <div className="hidden md:block"></div> {/* Spacer for left column */}
            {CONDITIONS.map((condition) => {
                const Icon = ICONS[condition];
                const isHighlighted = HIGHLIGHT_CONDITIONS.has(condition);
                const baseClasses =
                    "flex flex-col items-center justify-center p-3 rounded-xl border font-medium text-xs text-center shadow-sm transition-all h-full";
                const palette = isHighlighted
                    ? "bg-gradient-to-br from-slate-800 via-slate-900 to-black text-white border-slate-700/50 shadow-lg"
                    : "bg-card/50 backdrop-blur-sm text-foreground border-border/50 hover:bg-muted/50";

                return (
                    <div
                        key={condition}
                        className={`${baseClasses} ${palette}`}
                    >
                        <div className="p-2 rounded-full bg-background/20 mb-2" style={!isHighlighted ? { color: COLORS[condition], backgroundColor: `${COLORS[condition]}15` } : {}}>
                            <Icon size={18} strokeWidth={2.5} />
                        </div>
                        <span className="leading-tight opacity-90">{HEADER_LABELS[condition]}</span>
                    </div>
                );
            })}
        </>
    );
}

interface RowProps {
    title: string;
    data: Record<ConditionKey, number>;
    total: number;
    type: 'count' | 'number' | 'currency';
    grouping: SummaryGrouping;
    onCardClick: (condition: ConditionKey, grouping: SummaryGrouping) => void;
}

function SummaryRow({ title, data, total, type, grouping, onCardClick }: RowProps) {
    const formatValue = (val: number) => {
        if (type === 'currency') {
            return formatCurrencyIDR(val, {
                compactThreshold: 1_000_000_000,
                compactMaximumFractionDigits: 1,
                maximumFractionDigits: 0,
            });
        }
        if (val >= 1000) {
            return (val / 1000).toFixed(1) + 'k';
        }
        return val.toLocaleString();
    };

    const getRowIcon = () => {
        switch (grouping) {
            case 'sku': return Hash;
            case 'stock': return Package;
            case 'value': return DollarSign;
            default: return Box;
        }
    }
    const RowIcon = getRowIcon();

    return (
        <>
            <div className="flex flex-col items-center justify-center p-4 text-center md:items-end md:text-right md:pr-6 bg-card/30 rounded-xl border border-border/30 backdrop-blur-sm">
                <div className="p-2 bg-primary/10 rounded-lg text-primary mb-2 hidden md:block">
                    <RowIcon size={20} />
                </div>
                <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider mb-1">
                    {title}
                </div>
                <div className="text-sm">
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-bold text-foreground text-base block md:inline">{formatValue(total)}</span>
                </div>
            </div>

            {CONDITIONS.map((condition) => {
                const value = data[condition] || 0;
                const rawPercentage = total > 0 ? (value / total) * 100 : 0;
                const roundedPercentage = Number(rawPercentage.toFixed(1));
                const normalizedPercentage = Object.is(roundedPercentage, -0) ? 0 : roundedPercentage;
                const displayPercentage = Number.isInteger(normalizedPercentage)
                    ? normalizedPercentage.toString()
                    : normalizedPercentage.toFixed(1);

                const isHighlighted = HIGHLIGHT_CONDITIONS.has(condition);
                // Glassmorphism Styles
                const cardPalette = isHighlighted
                    ? "bg-gradient-to-br from-slate-800 to-black text-white border-slate-700/50 shadow-xl hover:from-slate-700 hover:to-slate-900"
                    : "bg-white/60 dark:bg-gray-900/40 backdrop-blur-md text-foreground border-white/20 dark:border-white/10 hover:bg-white/80 dark:hover:bg-gray-800/60 shadow-sm hover:shadow-md";

                const valueTextClass = isHighlighted
                    ? "bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300"
                    : "text-foreground";

                const percentageTextClass = isHighlighted ? "text-slate-400" : "text-muted-foreground";

                // Unique border top color based on condition
                const borderStyle = {
                    borderTop: `3px solid ${COLORS[condition]}`,
                };

                return (
                    <Card
                        key={condition}
                        className={`cursor-pointer transition-all duration-300 relative group overflow-hidden ${cardPalette}`}
                        style={borderStyle}
                        onClick={() => onCardClick(condition, grouping)}
                    >
                        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
                            <CardTitle className={`text-[10px] font-bold uppercase tracking-wider opacity-80 ${isHighlighted ? 'text-white' : 'text-muted-foreground'}`}>
                                {CONDITION_LABELS[condition]}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-3 pt-0">
                            <div className={`font-bold tracking-tight ${type === 'currency' ? 'text-lg' : 'text-2xl'} ${valueTextClass}`}>
                                {formatValue(value)}
                            </div>
                            <div className="flex items-center gap-1.5 mt-2">
                                <div className="h-1.5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min(normalizedPercentage, 100)}%`,
                                            backgroundColor: isHighlighted ? 'white' : COLORS[condition]
                                        }}
                                    />
                                </div>
                                <p className={`text-[10px] font-medium whitespace-nowrap ${percentageTextClass}`}>
                                    {displayPercentage}%
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </>
    );
}

export function SummaryCards({ summary, onCardClick, isLoading }: SummaryCardsProps) {
    if (isLoading) {
        return (
            <div className="grid gap-3 grid-cols-2 md:[grid-template-columns:140px_repeat(7,_minmax(0,_1fr))]">
                {/* Header Skeletons */}
                <div className="hidden md:block"></div>
                {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={`head-${i}`} className="h-16 w-full rounded-xl bg-muted/40" />
                ))}

                {/* Row Skeletons */}
                {[1, 2, 3].map((row) => (
                    <Fragment key={`row-${row}`}>
                        <div className="flex items-center justify-end pr-4">
                            <Skeleton className="h-16 w-full rounded-xl" />
                        </div>
                        {Array.from({ length: 7 }).map((_, i) => (
                            <Skeleton key={`cell-${row}-${i}`} className="h-24 w-full rounded-xl bg-card/40" />
                        ))}
                    </Fragment>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-3 grid-cols-2 md:[grid-template-columns:140px_repeat(7,_minmax(0,_1fr))] items-stretch">
            <HeaderRow />

            <SummaryRow
                title="by Count (SKU)"
                data={summary.byCondition}
                total={summary.totalItems}
                type="count"
                grouping="sku"
                onCardClick={onCardClick}
            />

            <SummaryRow
                title="by Qty (Pcs)"
                data={summary.stockByCondition}
                total={summary.totalStock}
                type="number"
                grouping="stock"
                onCardClick={onCardClick}
            />

            <SummaryRow
                title="by Value (IDR)"
                data={summary.valueByCondition}
                total={summary.totalValue}
                type="currency"
                grouping="value"
                onCardClick={onCardClick}
            />
        </div>
    );
}

export { COLORS, CONDITION_LABELS };
