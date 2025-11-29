import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConditionKey } from "@/services/dashboardService";

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

import { Skeleton } from "@/components/ui/skeleton";

interface SummaryCardsProps {
    summary: {
        total: number;
        byCondition: Record<ConditionKey, number>;
    };
    onCardClick: (condition: ConditionKey) => void;
    isLoading?: boolean;
}

export function SummaryCards({ summary, onCardClick, isLoading }: SummaryCardsProps) {
    if (isLoading) {
        return (
            <div className="grid gap-4 md:grid-cols-5">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Card key={i} className="border-t-4 border-gray-200">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                            <Skeleton className="h-4 w-24" />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <Skeleton className="h-8 w-16 mb-2" />
                            <Skeleton className="h-3 w-20" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        );
    }

    return (
        <div className="grid gap-4 md:grid-cols-5">
            {Object.entries(COLORS).map(([condition, color]) => {
                const count = summary.byCondition[condition as ConditionKey] || 0;
                const total = summary.total || 1;
                const percentage = Math.round((count / total) * 100);

                return (
                    <Card
                        key={condition}
                        className="cursor-pointer hover:shadow-md transition-all border-t-4"
                        style={{ borderTopColor: color }}
                        onClick={() => onCardClick(condition as ConditionKey)}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                {CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            <div className="text-2xl font-bold">{count.toLocaleString()}</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {percentage}% of total
                            </p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

export { COLORS, CONDITION_LABELS };
