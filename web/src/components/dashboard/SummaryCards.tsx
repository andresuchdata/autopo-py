import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConditionKey } from "@/services/dashboardService";
import { Skeleton } from "@/components/ui/skeleton";
import { type SummaryGrouping } from "@/types/stockHealth";

const COLORS = {
    'overstock': '#3b82f6',      // Blue
    'healthy': '#10b981',        // Green
    'low': '#f59e0b',            // Yellow
    'nearly_out': '#ef4444',     // Red
    'out_of_stock': '#1f2937'    // Black
};

const CONDITION_LABELS = {
    'overstock': 'Long over stock',
    'healthy': 'Sehat',
    'low': 'Kurang',
    'nearly_out': 'Menuju habis',
    'out_of_stock': 'Habis'
};

const HEADER_LABELS = {
    'overstock': 'Daily Stock Cover > 30 days',
    'healthy': 'Daily Stock Cover 21,xx - 30 days',
    'low': 'Daily Stock Cover 7,xx - 21 days',
    'nearly_out': 'Daily Stock Cover 0,xx - 7 days',
    'out_of_stock': 'Daily Stock Cover 0 day'
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

const CONDITIONS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock'];

function HeaderRow() {
    return (
        <div className="contents">
            <div className="hidden md:block"></div> {/* Spacer for left column */}
            {CONDITIONS.map((condition) => (
                <div
                    key={condition}
                    className="flex items-center justify-center p-3 rounded-lg border-2 bg-white dark:bg-gray-900/40 font-medium text-sm text-center shadow-sm text-gray-800 dark:text-gray-100"
                    style={{ borderColor: COLORS[condition] }}
                >
                    {HEADER_LABELS[condition]}
                </div>
            ))}
        </div>
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
            return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
        }
        return val.toLocaleString();
    };

    return (
        <div className="contents">
            <div className="flex flex-col items-center md:items-center md:justify-center md:pr-4 gap-0.5 text-center md:text-right">
                <div className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
                    {title}
                </div>
                <div className="text-xs text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">{formatValue(total)}</span>
                </div>
            </div>
            {CONDITIONS.map((condition) => {
                const value = data[condition] || 0;
                // Calculate percentage with 1 decimal place
                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                // Remove .0 if it's a whole number for cleaner look, unless it's < 1 and > 0
                const displayPercentage = percentage.endsWith('.0') ? percentage.slice(0, -2) : percentage;

                return (
                    <Card
                        key={condition}
                        className="cursor-pointer hover:shadow-md transition-all border-t-4 bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800"
                        style={{ borderTopColor: COLORS[condition] }}
                        onClick={() => onCardClick(condition, grouping)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                            <CardTitle className="text-[10px] font-bold text-muted-foreground dark:text-gray-300 uppercase tracking-wider">
                                {CONDITION_LABELS[condition]}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className={`font-bold ${type === 'currency' ? 'text-lg' : 'text-2xl'} text-gray-900 dark:text-gray-100`}>
                                {formatValue(value)}
                            </div>
                            <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                                {displayPercentage}% of total
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

export function SummaryCards({ summary, onCardClick, isLoading }: SummaryCardsProps) {
    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-[150px_repeat(5,1fr)]">
                {/* Header Skeletons */}
                <div className="hidden md:block"></div>
                {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={`head-${i}`} className="h-12 w-full rounded-lg" />
                ))}

                {/* Row Skeletons */}
                {[1, 2, 3].map((row) => (
                    <div key={`row-${row}`} className="contents">
                        <div className="flex items-center justify-end pr-4">
                            <Skeleton className="h-4 w-24" />
                        </div>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <Card key={`cell-${row}-${i}`} className="border-t-4 border-gray-200">
                                <CardHeader className="p-4 pb-2">
                                    <Skeleton className="h-3 w-20" />
                                </CardHeader>
                                <CardContent className="p-4 pt-0">
                                    <Skeleton className="h-8 w-24 mb-2" />
                                    <Skeleton className="h-3 w-16" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-[150px_repeat(5,1fr)] items-stretch">
            <HeaderRow />

            <SummaryRow
                title="by count of SKU"
                data={summary.byCondition}
                total={summary.totalItems}
                type="count"
                grouping="sku"
                onCardClick={onCardClick}
            />

            <SummaryRow
                title="by total Qty"
                data={summary.stockByCondition}
                total={summary.totalStock}
                type="number"
                grouping="stock"
                onCardClick={onCardClick}
            />

            <SummaryRow
                title="by total Value"
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
