import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOverstockSummary, OverstockCategory } from "@/services/dashboardService";
import type { SummaryGrouping } from "@/types/stockHealth";
import { formatCurrencyIDR } from "@/utils/formatters";
import { Scale, Weight, Feather } from "lucide-react";

const CATEGORY_CONFIG: Record<OverstockCategory, { label: string; description: string; color: string; borderColor: string, icon: any }> = {
  ringan: {
    label: "Ringan",
    description: "30 < Days Stock Cover ≤ 45",
    color: "#93C5FD",
    borderColor: "#60A5FA",
    icon: Feather
  },
  sedang: {
    label: "Sedang",
    description: "45 < Days Stock Cover ≤ 60",
    color: "#3B82F6",
    borderColor: "#2563EB",
    icon: Scale
  },
  berat: {
    label: "Berat",
    description: "Days Stock Cover > 60",
    color: "#1E40AF",
    borderColor: "#1E3A8A",
    icon: Weight
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
  { title: "by Count (SKU)", accessor: (breakdown) => breakdown.byCategory, type: "count" },
  { title: "by Qty (Pcs)", accessor: (breakdown) => breakdown.stockByCategory, type: "number" },
  { title: "by Value (IDR)", accessor: (breakdown) => breakdown.valueByCategory, type: "currency" },
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
      <div className="grid gap-4 md:grid-cols-[140px_repeat(3,1fr)] items-stretch">
        {/* Header Row */}
        <div className="hidden md:block" />
        {CATEGORY_ORDER.map((category) => {
          const Icon = CATEGORY_CONFIG[category].icon;
          return (
            <div
              key={category}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-card/60 backdrop-blur-sm shadow-sm border border-border/50 text-center"
            >
              <div className="p-2 rounded-full bg-primary/10 text-primary mb-2">
                <Icon size={20} />
              </div>
              <div className="font-semibold text-sm uppercase tracking-wide text-foreground">
                {CATEGORY_CONFIG[category].label}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1 px-2 py-0.5 rounded-full bg-muted">
                {CATEGORY_CONFIG[category].description}
              </div>
            </div>
          );
        })}

        {ROWS.map((row) => {
          const data = row.accessor(breakdown);
          const total = CATEGORY_ORDER.reduce((sum, category) => sum + (data[category] || 0), 0);

          return (
            <div key={row.title} className="contents">
              <div className="flex flex-col items-center md:items-end md:justify-center md:pr-6 gap-0.5 text-center md:text-right p-4 bg-muted/20 rounded-xl border border-border/20">
                <div className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {row.title}
                </div>
                <div className="text-sm text-foreground">
                  <span className="text-muted-foreground font-normal">Total: </span>
                  <span className="font-bold">{formatValue(total, row.type)}</span>
                </div>
              </div>

              {CATEGORY_ORDER.map((category) => {
                const value = data[category] || 0;
                const percentage = formatPercentage(value, total);
                const config = CATEGORY_CONFIG[category];

                return (
                  <Card
                    key={`${row.title}-${category}`}
                    className="bg-card/40 backdrop-blur-md border shadow-sm cursor-pointer hover:shadow-lg transition-all hover:bg-card/60 group relative overflow-hidden"
                    style={{
                      borderTopColor: config.borderColor,
                      borderTopWidth: '4px',
                    }}
                    onClick={() => onCardClick?.(category, row.type === "count" ? "sku" : row.type === "number" ? "stock" : "value")}
                  >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <CardHeader className="pb-1 p-3">
                      <CardTitle className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center">
                        {config.label}
                        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: config.color }} />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className={`font-bold ${row.type === "currency" ? "text-lg" : "text-2xl"} text-foreground tracking-tight`}>
                        {formatValue(value, row.type)}
                      </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60" style={{ width: `${Math.min(Number(percentage), 100)}%`, backgroundColor: config.color }} />
                        </div>
                        <p className="text-[10px] font-medium text-muted-foreground w-12 text-right">
                          {percentage}%
                        </p>
                      </div>
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
