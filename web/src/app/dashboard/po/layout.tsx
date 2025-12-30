'use client';

import { PODashboardFilterProvider } from '@/contexts/PODashboardFilterContext';

export default function POLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <PODashboardFilterProvider>
            {children}
        </PODashboardFilterProvider>
    );
}
