import { Skeleton } from '@/components/ui/skeleton';

export const POFunnelChartSkeleton = () => {
    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <div className="w-full h-[440px] flex items-center justify-center">
                <div className="space-y-4 w-full max-w-2xl">
                    {[0, 1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-4">
                            <Skeleton className="h-16 flex-1" style={{ opacity: 1 - i * 0.15 }} />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export const POTrendChartSkeleton = () => {
    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm relative overflow-hidden">
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-secondary/30 rounded-full blur-3xl pointer-events-none" />
            <div className="flex justify-between items-center mb-6 relative z-10">
                <Skeleton className="h-6 w-44" />
            </div>
            <div className="h-[350px] w-full relative z-10 flex items-end justify-around gap-2 px-8">
                {[60, 75, 85, 70, 65].map((height, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="w-full flex justify-around gap-1" style={{ height: `${height}%` }}>
                            {[0, 1, 2].map((j) => (
                                <Skeleton key={j} className="flex-1" />
                            ))}
                        </div>
                        <Skeleton className="h-3 w-16" />
                    </div>
                ))}
            </div>
            <div className="mt-6 flex justify-center gap-4">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2">
                        <Skeleton className="h-2 w-2 rounded-full" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export const POAgingTableSkeleton = () => {
    return (
        <div className="w-full bg-card rounded-lg p-4 border border-border flex flex-col gap-4">
            <div className="flex flex-row items-center justify-between">
                <Skeleton className="h-6 w-40" />
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-[180px]" />
                </div>
            </div>
            <div className="rounded-md border">
                <div className="p-4">
                    <div className="space-y-3">
                        <div className="grid grid-cols-6 gap-4 pb-3 border-b">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="h-4 w-full" />
                            ))}
                        </div>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                            <div key={i} className="grid grid-cols-6 gap-4">
                                {[0, 1, 2, 3, 4, 5].map((j) => (
                                    <Skeleton key={j} className="h-4 w-full" />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center space-x-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                </div>
            </div>
        </div>
    );
};

export const SupplierPerformanceChartSkeleton = () => {
    return (
        <div className="w-full bg-card rounded-xl p-5 border border-border/60 shadow-sm h-full flex flex-col">
            <div className="flex justify-between items-start mb-4">
                <div className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-3 w-40" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-8 w-8" />
                </div>
            </div>
            <div className="flex-1 w-full min-h-[300px] space-y-3">
                {[85, 70, 60, 55, 50, 45, 40, 35, 30, 25].map((width, i) => (
                    <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-8" style={{ width: `${width}%` }} />
                    </div>
                ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-2">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-1">
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-7 w-16" />
                    <Skeleton className="h-7 w-[70px]" />
                </div>
            </div>
        </div>
    );
};
