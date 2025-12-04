import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOverstockSummary, OverstockCategory } from "@/services/dashboardService";
import type { SummaryGrouping } from "@/types/stockHealth";
import { formatCurrencyIDR } from "@/utils/formatters";

const CATEGORY_CONFIG: Record<OverstockCategory, { label: string; description: string; color: string; borderColor: string }> = {
  ringan: {
    label: "Ringan",
    description: "30 < Days Stock Cover ≤ 45",
    color: "#93C5FD",
    borderColor: "#60A5FA",
  },
  sedang: {
    label: "Sedang",
    description: "45 < Days Stock Cover ≤ 60",
    color: "#3B82F6",
    borderColor: "#2563EB",
  },
  berat: {
    label: "Berat",
    description: "Days Stock Cover > 60",
    color: "#1E40AF",
    borderColor: "#1E3A8A",
  },
};

const CATEGORY_ORDER: OverstockCategory[] = ["ringan", "sedang", "berat"];

interface OverstockSubgroupCardsProps {
  breakdown: DashboardOverstockSummary;
  onCardClick?: (category: OverstockCategory, grouping: SummaryGrouping) => void;
}

interface RowConfig {
  title: string;
  accessor: (summary: DashboardOverstockSummary) => Record<OverstockCategory, number>;
  type: "count" | "number" | "currency";
}

const ROWS: RowConfig[] = [
  { title: "by count of SKU", accessor: (breakdown) => breakdown.byCategory, type: "count" },
  { title: "by total Qty", accessor: (breakdown) => breakdown.stockByCategory, type: "number" },
  { title: "by total Value", accessor: (breakdown) => breakdown.valueByCategory, type: "currency" },
];

const formatValue = (value: number, type: RowConfig["type"]) => {
  if (type === "currency") {
    return formatCurrencyIDR(value, {
      compactThreshold: 1_000_000_000,
      compactMaximumFractionDigits: 1,
      maximumFractionDigits: 0,
    });
  }

  return value.toLocaleString();
};

const formatPercentage = (value: number, total: number) => {
  if (total === 0) return "0";
  const raw = (value / total) * 100;
  const rounded = Number(raw.toFixed(1));
  if (Object.is(rounded, -0)) return "0";
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

export function OverstockSubgroupCards({ breakdown, onCardClick }: OverstockSubgroupCardsProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[150px_repeat(3,1fr)] items-stretch">
        {/* Header Row */}
        <div className="hidden md:block" />
        {CATEGORY_ORDER.map((category) => (
          <div
            key={category}
            className="flex flex-col items-center justify-center p-3 rounded-lg bg-white dark:bg-gray-900/40 text-center shadow-sm text-gray-800 dark:text-gray-100"
          >
            <div className="font-semibold text-sm uppercase tracking-wide">
              {CATEGORY_CONFIG[category].label}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {CATEGORY_CONFIG[category].description}
            </div>
          </div>
        ))}

        {ROWS.map((row) => {
          const data = row.accessor(breakdown);
          const total = CATEGORY_ORDER.reduce((sum, category) => sum + (data[category] || 0), 0);

          return (
            <div key={row.title} className="contents">
              <div className="flex flex-col items-center md:items-end md:justify-center md:pr-4 gap-0.5 text-center md:text-right">
                <div className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
                  {row.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: <span className="font-semibold text-foreground">{formatValue(total, row.type)}</span>
                </div>
              </div>

              {CATEGORY_ORDER.map((category) => {
                const value = data[category] || 0;
                const percentage = formatPercentage(value, total);

                return (
                  <Card
                    key={`${row.title}-${category}`}
                    className="bg-white dark:bg-gray-900/50 border-2 shadow-sm cursor-pointer hover:shadow-md transition-all"
                    style={{
                      borderTopColor: CATEGORY_CONFIG[category].borderColor,
                      borderTopWidth: '4px',
                    }}
                    onClick={() => onCardClick?.(category, row.type === "count" ? "sku" : row.type === "number" ? "stock" : "value")}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs font-semibold text-muted-foreground dark:text-gray-300 uppercase tracking-wide">
                        {CATEGORY_CONFIG[category].label}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className={`font-bold ${row.type === "currency" ? "text-lg" : "text-2xl"} text-gray-900 dark:text-gray-100`}>
                        {formatValue(value, row.type)}
                      </div>
                      <p className="text-xs text-muted-foreground dark:text-gray-400 mt-1">
                        {percentage}% of total
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
