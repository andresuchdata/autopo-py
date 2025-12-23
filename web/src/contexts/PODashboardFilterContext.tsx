'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type POTypeFilter = 'ALL' | 'AU' | 'PO' | 'OTHERS';

interface PODashboardFilterContextType {
    // Applied filters (trigger backend calls)
    poTypeFilter: POTypeFilter;
    releasedDateFilter: string;
    storeIdsFilter: number[];
    brandIdsFilter: number[];
    supplierIdsFilter: number[];

    // Draft filters (UI state)
    draftPOTypeFilter: POTypeFilter;
    draftReleasedDateFilter: string;
    draftStoreIdsFilter: number[];
    draftBrandIdsFilter: number[];
    draftSupplierIdsFilter: number[];

    // Setters for draft filters
    setDraftPOTypeFilter: (value: POTypeFilter) => void;
    setDraftReleasedDateFilter: (value: string) => void;
    setDraftStoreIdsFilter: (value: number[] | ((prev: number[]) => number[])) => void;
    setDraftBrandIdsFilter: (value: number[] | ((prev: number[]) => number[])) => void;
    setDraftSupplierIdsFilter: (value: number[] | ((prev: number[]) => number[])) => void;

    // Actions
    applyFilters: () => void;
    applyFiltersWithOverrides: (overrides: Partial<{
        poType: POTypeFilter;
        releasedDate: string;
        storeIds: number[];
        brandIds: number[];
        supplierIds: number[];
    }>) => void;
    clearFilters: () => void;
}

const PODashboardFilterContext = createContext<PODashboardFilterContextType | undefined>(undefined);

export const PODashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // Applied filters (what triggers data fetching)
    const [poTypeFilter, setPOTypeFilter] = useState<POTypeFilter>('ALL');
    const [releasedDateFilter, setReleasedDateFilter] = useState<string>('');
    const [storeIdsFilter, setStoreIdsFilter] = useState<number[]>([]);
    const [brandIdsFilter, setBrandIdsFilter] = useState<number[]>([]);
    const [supplierIdsFilter, setSupplierIdsFilter] = useState<number[]>([]);

    // Draft filters (UI state)
    const [draftPOTypeFilter, setDraftPOTypeFilter] = useState<POTypeFilter>('ALL');
    const [draftReleasedDateFilter, setDraftReleasedDateFilter] = useState<string>('');
    const [draftStoreIdsFilter, setDraftStoreIdsFilter] = useState<number[]>([]);
    const [draftBrandIdsFilter, setDraftBrandIdsFilter] = useState<number[]>([]);
    const [draftSupplierIdsFilter, setDraftSupplierIdsFilter] = useState<number[]>([]);

    const applyFilters = () => {
        setPOTypeFilter(draftPOTypeFilter);
        setReleasedDateFilter(draftReleasedDateFilter);
        setStoreIdsFilter(draftStoreIdsFilter);
        setBrandIdsFilter(draftBrandIdsFilter);
        setSupplierIdsFilter(draftSupplierIdsFilter);
    };

    const applyFiltersWithOverrides = (overrides: Partial<{
        poType: POTypeFilter;
        releasedDate: string;
        storeIds: number[];
        brandIds: number[];
        supplierIds: number[];
    }>) => {
        const newPOType = overrides.poType !== undefined ? overrides.poType : draftPOTypeFilter;
        const newReleasedDate = overrides.releasedDate !== undefined ? overrides.releasedDate : draftReleasedDateFilter;
        const newStoreIds = overrides.storeIds !== undefined ? overrides.storeIds : draftStoreIdsFilter;
        const newBrandIds = overrides.brandIds !== undefined ? overrides.brandIds : draftBrandIdsFilter;
        const newSupplierIds = overrides.supplierIds !== undefined ? overrides.supplierIds : draftSupplierIdsFilter;

        setPOTypeFilter(newPOType);
        setReleasedDateFilter(newReleasedDate);
        setStoreIdsFilter(newStoreIds);
        setBrandIdsFilter(newBrandIds);
        setSupplierIdsFilter(newSupplierIds);
    };

    const clearFilters = () => {
        const clearedState: POTypeFilter = 'ALL';
        const clearedDate = '';
        const clearedIds: number[] = [];

        // Apply cleared state
        setPOTypeFilter(clearedState);
        setReleasedDateFilter(clearedDate);
        setStoreIdsFilter(clearedIds);
        setBrandIdsFilter(clearedIds);
        setSupplierIdsFilter(clearedIds);

        // Also update draft to match
        setDraftPOTypeFilter(clearedState);
        setDraftReleasedDateFilter(clearedDate);
        setDraftStoreIdsFilter(clearedIds);
        setDraftBrandIdsFilter(clearedIds);
        setDraftSupplierIdsFilter(clearedIds);
    };

    return (
        <PODashboardFilterContext.Provider
            value={{
                // Applied filters
                poTypeFilter,
                releasedDateFilter,
                storeIdsFilter,
                brandIdsFilter,
                supplierIdsFilter,

                // Draft filters
                draftPOTypeFilter,
                draftReleasedDateFilter,
                draftStoreIdsFilter,
                draftBrandIdsFilter,
                draftSupplierIdsFilter,

                // Draft setters
                setDraftPOTypeFilter,
                setDraftReleasedDateFilter,
                setDraftStoreIdsFilter,
                setDraftBrandIdsFilter,
                setDraftSupplierIdsFilter,

                // Actions
                applyFilters,
                applyFiltersWithOverrides,
                clearFilters,
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
