'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type POTypeFilter = 'ALL' | 'AU' | 'PO' | 'OTHERS';

interface PODashboardFilterContextType {
    poTypeFilter: POTypeFilter;
    setPOTypeFilter: (value: POTypeFilter) => void;
    releasedDateFilter: string;
    setReleasedDateFilter: (value: string) => void;
    storeIdsFilter: number[];
    setStoreIdsFilter: (value: number[]) => void;
    brandIdsFilter: number[];
    setBrandIdsFilter: (value: number[]) => void;
}

const PODashboardFilterContext = createContext<PODashboardFilterContextType | undefined>(undefined);

export const PODashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [poTypeFilter, setPOTypeFilter] = useState<POTypeFilter>('ALL');
    const [releasedDateFilter, setReleasedDateFilter] = useState<string>('');
    const [storeIdsFilter, setStoreIdsFilter] = useState<number[]>([]);
    const [brandIdsFilter, setBrandIdsFilter] = useState<number[]>([]);

    return (
        <PODashboardFilterContext.Provider
            value={{
                poTypeFilter,
                setPOTypeFilter,
                releasedDateFilter,
                setReleasedDateFilter,
                storeIdsFilter,
                setStoreIdsFilter,
                brandIdsFilter,
                setBrandIdsFilter,
            }}
        >
            {children}
        </PODashboardFilterContext.Provider>
    );
};

export const usePODashboardFilter = () => {
    const context = useContext(PODashboardFilterContext);
    if (context === undefined) {
        throw new Error('usePODashboardFilter must be used within a PODashboardFilterProvider');
    }
    return context;
};
