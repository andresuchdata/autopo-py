import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { COLORS, CONDITION_LABELS } from "./SummaryCards";
import { Skeleton } from "@/components/ui/skeleton";
import { ConditionKey } from "@/services/dashboardService";
import { type ConditionBreakdownResponse } from "@/services/stockHealthService";

interface DashboardChartsProps {
    charts: {
        pieDataBySkuCount: any[];
        pieDataByStock: any[];
        pieDataByValue: any[];
    };
    brandBreakdown: ConditionBreakdownResponse[];
    storeBreakdown: ConditionBreakdownResponse[];
    isLoading?: boolean;
}

const CONDITION_KEYS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock'];

export function DashboardCharts({ charts, brandBreakdown, storeBreakdown, isLoading }: DashboardChartsProps) {
    const buildStackedData = (breakdown: ConditionBreakdownResponse[], dimension: 'brand' | 'store') => {
        const map = new Map<string, Record<ConditionKey, number>>();

        breakdown.forEach((entry) => {
            const label = (dimension === 'brand' ? entry.brand : entry.store) ?? 'Unknown';
            const condition = (entry.condition as ConditionKey) ?? 'out_of_stock';
            const existing = map.get(label) ?? Object.fromEntries(CONDITION_KEYS.map((key) => [key, 0])) as Record<ConditionKey, number>;
            existing[condition] = (existing[condition] || 0) + entry.count;
            map.set(label, existing);
        });

        return Array.from(map.entries()).map(([label, counts]) => ({
            [dimension]: label,
            ...counts,
        }));
    };

    const brandData = buildStackedData(brandBreakdown, 'brand');
    const storeData = buildStackedData(storeBreakdown, 'store');

    // Helper to format currency
    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(value);
    };

    if (isLoading) {
        return (
            <div className="space-y-8">
                {/* Pie Charts Skeletons */}
                <div className="grid gap-6 md:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="flex flex-col">
                            <CardHeader className="pb-2">
                                <Skeleton className="h-6 w-3/4 mx-auto" />
                            </CardHeader>
                            <CardContent className="flex-1 min-h-[250px] flex items-center justify-center">
                                <Skeleton className="h-[200px] w-[200px] rounded-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Detailed Breakdowns Skeletons */}
                <div className="grid gap-6 md:grid-cols-2">
                    {[1, 2].map((i) => (
                        <Card key={i}>
                            <CardHeader>
                                <Skeleton className="h-6 w-1/3" />
                            </CardHeader>
                            <CardContent>
                                <div className="h-[400px] w-full">
                                    <Skeleton className="h-full w-full" />
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    // Render a single pie chart
    const renderPieChart = (
        data: any[],
        title: string,
        valueFormatter?: (value: number) => string
    ) => {
        if (!data || data.length === 0) return null;

        const total = data.reduce((sum, item) => sum + item.value, 0);

        return (
            <Card className="flex flex-col bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-center text-gray-900 dark:text-gray-100">{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={2}
                                dataKey="value"
                                nameKey="condition"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={COLORS[entry.condition as keyof typeof COLORS] || '#999999'}
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: number, name: string, props: any) => [
                                    valueFormatter ? valueFormatter(value) : value.toLocaleString(),
                                    CONDITION_LABELS[props.payload.condition as keyof typeof CONDITION_LABELS]
                                ]}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                formatter={(value, entry: any) => {
                                    const item = data.find(d => d.condition === entry.payload.condition);
                                    const percent = item ? ((item.value / total) * 100).toFixed(1) : 0;
                                    return <span className="text-xs text-gray-600 ml-1">{`${CONDITION_LABELS[value as keyof typeof CONDITION_LABELS]} (${percent}%)`}</span>;
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        );
    };

    return (
        <div className="space-y-8">
            {/* Pie Charts Row */}
            <div className="grid gap-6 md:grid-cols-3">
                {renderPieChart(
                    charts.pieDataBySkuCount,
                    "SKU Count Distribution"
                )}
                {renderPieChart(
                    charts.pieDataByStock,
                    "Total Stock Quantity"
                )}
                {renderPieChart(
                    charts.pieDataByValue,
                    "Total Value (HPP)",
                    formatCurrency
                )}
            </div>

            {/* Detailed Breakdowns */}
            <div className="grid gap-6 md:grid-cols-2">
                {brandData.length > 0 && (
                    <Card className="bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                        <CardHeader>
                            <CardTitle className="text-gray-900 dark:text-gray-100">Breakdown by Brand</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={brandData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis dataKey="brand" type="category" width={100} tick={{ fontSize: 12 }} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Legend />
                                        {Object.entries(COLORS).map(([condition, color]) => (
                                            <Bar
                                                key={condition}
                                                dataKey={condition}
                                                stackId="a"
                                                fill={color}
                                                name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {storeData.length > 0 && (
                    <Card className="bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
                        <CardHeader>
                            <CardTitle className="text-gray-900 dark:text-gray-100">Breakdown by Store</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={storeData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis dataKey="store" type="category" width={100} tick={{ fontSize: 12 }} />
                                        <Tooltip cursor={{ fill: 'transparent' }} />
                                        <Legend />
                                        {Object.entries(COLORS).map(([condition, color]) => (
                                            <Bar
                                                key={condition}
                                                dataKey={condition}
                                                stackId="a"
                                                fill={color}
                                                name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}
