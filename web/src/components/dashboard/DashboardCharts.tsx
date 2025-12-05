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

const EXCLUDED_CONDITIONS: ConditionKey[] = ['no_sales', 'negative_stock'];
const CONDITION_KEYS: ConditionKey[] = ['overstock', 'healthy', 'low', 'nearly_out', 'out_of_stock', 'no_sales', 'negative_stock'];
const INCLUDED_CONDITION_KEYS = CONDITION_KEYS.filter((key) => !EXCLUDED_CONDITIONS.includes(key));

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-popover/95 backdrop-blur-sm border border-border/50 rounded-lg p-3 shadow-xl text-sm">
                <p className="font-semibold mb-1">{label}</p>
                <div className="space-y-1">
                    {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: entry.color || entry.fill }} />
                            <span className="text-muted-foreground">{entry.name}:</span>
                            <span className="font-medium text-foreground">{entry.value && (typeof entry.value === 'number' && entry.value >= 1000000 ? (entry.value / 1000000).toFixed(1) + 'M' : entry.value.toLocaleString())}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

export function DashboardCharts({ charts, brandBreakdown, storeBreakdown, isLoading }: DashboardChartsProps) {
    const buildStackedData = (breakdown: ConditionBreakdownResponse[], dimension: 'brand' | 'store') => {
        const map = new Map<string, Record<ConditionKey, number>>();

        breakdown.forEach((entry) => {
            const label = (dimension === 'brand' ? entry.brand : entry.store) ?? 'Unknown';
            const condition = (entry.condition as ConditionKey) ?? 'out_of_stock';
            if (EXCLUDED_CONDITIONS.includes(condition)) {
                return;
            }
            const existing = map.get(label) ?? Object.fromEntries(INCLUDED_CONDITION_KEYS.map((key) => [key, 0])) as Record<ConditionKey, number>;
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

    const pieDataBySkuCount = (charts.pieDataBySkuCount ?? []).filter(
        (item) => !EXCLUDED_CONDITIONS.includes(item.condition as ConditionKey)
    );
    const pieDataByStock = (charts.pieDataByStock ?? []).filter(
        (item) => !EXCLUDED_CONDITIONS.includes(item.condition as ConditionKey)
    );
    const pieDataByValue = (charts.pieDataByValue ?? []).filter(
        (item) => !EXCLUDED_CONDITIONS.includes(item.condition as ConditionKey)
    );

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
                        <Card key={i} className="flex flex-col border-none shadow-none bg-muted/20">
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
                        <Card key={i} className="border-border/40">
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
            <Card className="flex flex-col bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm hover:shadow-md transition-all">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold text-center uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[250px] relative">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="text-center">
                            <span className="text-2xl font-bold block">{valueFormatter ? (total > 1000000000 ? (total / 1000000000).toFixed(1) + 'M' : (total / 1000).toFixed(0) + 'K') : total.toLocaleString()}</span>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Total</span>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={data}
                                cx="50%"
                                cy="50%"
                                innerRadius={70}
                                outerRadius={85}
                                paddingAngle={3}
                                dataKey="value"
                                nameKey="condition"
                                cornerRadius={4}
                                stroke="none"
                            >
                                {data.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={COLORS[entry.condition as keyof typeof COLORS] || '#999999'}
                                        className="hover:opacity-80 transition-opacity cursor-pointer"
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                            <Legend
                                verticalAlign="bottom"
                                height={36}
                                iconType="circle"
                                iconSize={8}
                                formatter={(value, entry: any) => {
                                    const item = data.find(d => d.condition === entry.payload.condition);
                                    const percent = item ? ((item.value / total) * 100).toFixed(1) : 0;
                                    return <span className="text-xs text-muted-foreground ml-1 font-medium">{`${CONDITION_LABELS[value as keyof typeof CONDITION_LABELS]} (${percent}%)`}</span>;
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
                    pieDataBySkuCount,
                    "SKU Count Distribution"
                )}
                {renderPieChart(
                    pieDataByStock,
                    "Total Stock Quantity"
                )}
                {renderPieChart(
                    pieDataByValue,
                    "Total Value (HPP)",
                    formatCurrency
                )}
            </div>

            {/* Detailed Breakdowns */}
            <div className="grid gap-6 md:grid-cols-2">
                {brandData.length > 0 && (
                    <Card className="bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold tracking-tight">Breakdown by Brand</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={brandData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                                        barGap={2}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.1} />
                                        <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                        <YAxis dataKey="brand" type="category" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.2)', radius: 4 }} />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        {Object.entries(COLORS)
                                            .filter(([condition]) => INCLUDED_CONDITION_KEYS.includes(condition as ConditionKey))
                                            .map(([condition, color], index, arr) => {
                                                // Only round the last segment
                                                const isLast = index === arr.length - 1;
                                                const radius: [number, number, number, number] = isLast ? [0, 4, 4, 0] : [0, 0, 0, 0];

                                                return (
                                                    <Bar
                                                        key={condition}
                                                        dataKey={condition}
                                                        stackId="a"
                                                        fill={color}
                                                        radius={radius}
                                                        barSize={24}
                                                        name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS]}
                                                    />
                                                );
                                            })}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {storeData.length > 0 && (
                    <Card className="bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm">
                        <CardHeader>
                            <CardTitle className="text-lg font-semibold tracking-tight">Breakdown by Store</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={storeData}
                                        layout="vertical"
                                        margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
                                        barGap={2}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.1} />
                                        <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                                        <YAxis dataKey="store" type="category" width={100} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted)/0.2)', radius: 4 }} />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                        {Object.entries(COLORS)
                                            .filter(([condition]) => INCLUDED_CONDITION_KEYS.includes(condition as ConditionKey))
                                            .map(([condition, color], index, arr) => {
                                                const isLast = index === arr.length - 1;
                                                const radius: [number, number, number, number] = isLast ? [0, 4, 4, 0] : [0, 0, 0, 0];

                                                return (
                                                    <Bar
                                                        key={condition}
                                                        dataKey={condition}
                                                        stackId="a"
                                                        fill={color}
                                                        radius={radius}
                                                        barSize={24}
                                                        name={CONDITION_LABELS[condition as keyof typeof CONDITION_LABELS].split(' ')[0]}
                                                    />
                                                );
                                            })}
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
