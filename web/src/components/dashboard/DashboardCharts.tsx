import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { COLORS, CONDITION_LABELS } from "./SummaryCards";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardChartsProps {
    charts: {
        pieDataBySkuCount: any[];
        pieDataByStock: any[];
        pieDataByValue: any[];
    };
    byBrand?: Map<string, any[]>;
    byStore?: Map<string, any[]>;
    isLoading?: boolean;
}

export function DashboardCharts({ charts, byBrand, byStore, isLoading }: DashboardChartsProps) {
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
            <Card className="flex flex-col">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-center">{title}</CardTitle>
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
                                    const percent = item ? ((item.value / total) * 100).toFixed(0) : 0;
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
                {byBrand && byBrand.size > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Breakdown by Brand</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={Array.from(byBrand.entries()).map(([brand, items]) => {
                                            const counts = items.reduce((acc, item) => {
                                                acc[item.condition] = (acc[item.condition] || 0) + 1;
                                                return acc;
                                            }, {} as Record<string, number>);
                                            return { brand, ...counts };
                                        })}
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

                {byStore && byStore.size > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Breakdown by Store</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={Array.from(byStore.entries()).map(([store, items]) => {
                                            const counts = items.reduce((acc, item) => {
                                                acc[item.condition] = (acc[item.condition] || 0) + 1;
                                                return acc;
                                            }, {} as Record<string, number>);
                                            return { store, ...counts };
                                        })}
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
