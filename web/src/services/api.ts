import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Helper to join number arrays into comma-separated strings
const joinIds = (ids?: number[]): string | undefined =>
    ids && ids.length > 0 ? ids.join(',') : undefined;

// Helper to build query params object
const buildQueryParams = (params: Record<string, any>): Record<string, any> => {
    const query: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            query[key] = value;
        }
    });
    return query;
};

export const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => {
        formData.append('files', file);
    });
    const response = await api.post('/po/upload', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const poService = {
    processPO: async (formData: FormData) => {
        const response = await api.post('/po/process', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    getSuppliers: async (params?: { search?: string; limit?: number; offset?: number }) => {
        try {
            const query = buildQueryParams({
                search: params?.search,
                limit: params?.limit,
                offset: params?.offset,
            });
            const response = await api.get('/po/suppliers', { params: query });
            return response.data;
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            throw error;
        }
    },

    getContributions: async () => {
        try {
            const response = await api.get('/po/contributions');
            return response.data;
        } catch (error) {
            console.error('Error fetching contributions:', error);
            throw error;
        }
    },

    getStores: async (search?: string) => {
        try {
            const query = buildQueryParams({ search });
            const response = await api.get('/po/stores', { params: query });
            return response.data;
        } catch (error) {
            console.error('Error fetching stores:', error);
            throw error;
        }
    },

    getStoreResults: async (storeName: string) => {
        try {
            const response = await api.get(`/po/stores/${encodeURIComponent(storeName)}/results`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching results for store ${storeName}:`, error);
            throw error;
        }
    },

    getBrands: async (params?: { search?: string; kategoriBrand?: string[] }) => {
        try {
            const query = buildQueryParams({
                search: params?.search,
                kategori_brand: params?.kategoriBrand && params.kategoriBrand.length > 0
                    ? params.kategoriBrand.join(',')
                    : undefined,
            });
            const response = await api.get('/po/brands', { params: query });
            return response.data;
        } catch (error) {
            console.error('Error fetching brands:', error);
            throw error;
        }
    },

    getSkus: async (params?: { search?: string; limit?: number; offset?: number; brandIds?: number[] }) => {
        try {
            const query = buildQueryParams({
                search: params?.search,
                limit: params?.limit,
                offset: params?.offset,
                brand_ids: joinIds(params?.brandIds),
            });
            const response = await api.get('/po/skus', { params: query });
            return response.data;
        } catch (error) {
            console.error('Error fetching SKUs:', error);
            throw error;
        }
    }
};

export interface SupplierPOItem {
    po_number: string;
    sku: string;
    product_name: string;
    brand_name: string;
    supplier_id: number;
    supplier_name: string;
    po_released_at: string | null;
    po_sent_at: string | null;
    po_approved_at: string | null;
    po_arrived_at: string | null;
    po_received_at: string | null;
}

export interface SupplierPOItemsResponse {
    items: SupplierPOItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

interface SupplierPOItemsParams {
    supplierId: number;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
}

export const getSupplierPOItems = async ({
    supplierId,
    page = 1,
    pageSize = 20,
    sortField = 'po_number',
    sortDirection = 'asc',
}: SupplierPOItemsParams): Promise<SupplierPOItemsResponse> => {
    try {
        const query = buildQueryParams({
            supplier_id: supplierId,
            page,
            page_size: pageSize,
            sort_field: sortField,
            sort_direction: sortDirection,
        });
        const response = await api.get('/po/analytics/supplier_items', { params: query });
        return response.data;
    } catch (error) {
        console.error('Error fetching supplier PO items:', error);
        throw error;
    }
};

export interface DashboardSummaryParams {
    poType?: 'AU' | 'PO' | 'OTHERS';
    releasedDate?: string;
    storeIds?: number[];
    brandIds?: number[];
    supplierIds?: number[];
}

interface RequestOptions {
    signal?: AbortSignal;
}

export const getDashboardSummary = async (params?: DashboardSummaryParams, options?: RequestOptions) => {
    try {
        const query = buildQueryParams({
            po_type: params?.poType,
            released_date: params?.releasedDate,
            store_ids: joinIds(params?.storeIds),
            brand_ids: joinIds(params?.brandIds),
            supplier_ids: joinIds(params?.supplierIds),
        });
        const response = await api.get('/po/analytics/summary', {
            params: query,
            signal: options?.signal,
        });
        return response.data;
    } catch (error) {
        if (error instanceof Error && (error.name === 'CanceledError' || error.name === 'AbortError')) {
            throw error;
        }

        console.error('Error fetching dashboard summary:', error);
        throw error;
    }
};

export const getPOTrend = async (interval: string = 'day') => {
    try {
        const response = await api.get('/po/analytics/trend', { params: { interval } });
        return response.data;
    } catch (error) {
        console.error('Error fetching PO trend:', error);
        throw error;
    }
};

export interface POAgingItem {
    po_number: string;
    status: string;
    quantity: number;
    value: number;
    days_in_status: number;
    supplier_name: string;
    po_released_at: string | null;
    po_sent_at: string | null;
    po_arrived_at: string | null;
    po_received_at: string | null;
}

export interface POAgingItemsResponse {
    items: POAgingItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

interface POAgingParams {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    status?: string;
}

export const getPOAging = async (params?: POAgingParams) => {
    try {
        const query = buildQueryParams({
            page: params?.page,
            page_size: params?.pageSize,
            sort_field: params?.sortField,
            sort_direction: params?.sortDirection,
            status: params?.status,
        });
        const response = await api.get('/po/analytics/aging', { params: query });
        return response.data;
    } catch (error) {
        console.error('Error fetching PO aging:', error);
        throw error;
    }
};

export interface SupplierPerformance {
    supplier_id: number;
    supplier_name: string;
    avg_lead_time: number;
    total_pos: number;
    min_lead_time: number;
    max_lead_time: number;
}

export interface SupplierPerformanceResponse {
    items: SupplierPerformance[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

interface SupplierPerformanceParams {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
}

export const getSupplierPerformance = async (params?: SupplierPerformanceParams) => {
    try {
        const query = buildQueryParams({
            page: params?.page,
            page_size: params?.pageSize,
            sort_field: params?.sortField,
            sort_direction: params?.sortDirection,
        });
        const response = await api.get('/po/analytics/supplier-performance', { params: query });
        return response.data;
    } catch (error) {
        console.error('Error fetching supplier performance:', error);
        throw error;
    }
};

export interface POSnapshotItem {
    snapshot_time: string;
    po_number: string;
    brand_name: string;
    sku: string;
    product_name: string;
    store_name: string;
    supplier_name: string | null;
    unit_price: number;
    total_amount: number;
    po_qty: number;
    received_qty: number | null;
    po_released_at: string | null;
    po_sent_at: string | null;
    po_approved_at: string | null;
    po_arrived_at: string | null;
    po_received_at: string | null;
}

export interface POSnapshotItemsResponse {
    items: POSnapshotItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    total_pos: number;
    total_qty: number;
    total_value: number;
    total_skus: number;
}

interface POSnapshotItemsParams {
    status: string;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    poType?: 'AU' | 'PO' | 'OTHERS';
    releasedDate?: string;
    storeIds?: number[];
    brandIds?: number[];
    supplierIds?: number[];
}

export const getPOSnapshotItems = async ({
    status,
    page = 1,
    pageSize = 20,
    sortField = 'po_number',
    sortDirection = 'asc',
    poType,
    releasedDate,
    storeIds,
    brandIds,
    supplierIds,
}: POSnapshotItemsParams): Promise<POSnapshotItemsResponse> => {
    try {
        const query = buildQueryParams({
            status: status.toLowerCase(),
            page,
            page_size: pageSize,
            sort_field: sortField,
            sort_direction: sortDirection,
            po_type: poType,
            released_date: releasedDate,
            store_ids: joinIds(storeIds),
            brand_ids: joinIds(brandIds),
            supplier_ids: joinIds(supplierIds),
        });
        const response = await api.get('/po/analytics/items', { params: query });
        return response.data;
    } catch (error) {
        console.error('Error fetching PO snapshot items:', error);
        throw error;
    }
};

export const getResults = async () => {
    const response = await api.get('/po/results');
    return response.data;
};

export const invalidateStockHealthCache = async () => {
    try {
        const response = await api.post('/etl/cache/invalidate/stock_health');
        return response.data;
    } catch (error) {
        console.error('Error invalidating stock health cache:', error);
        throw error;
    }
};

export const invalidatePOSnapshotCache = async () => {
    try {
        const response = await api.post('/etl/cache/invalidate/po_snapshot');
        return response.data;
    } catch (error) {
        console.error('Error invalidating PO snapshot cache:', error);
        throw error;
    }
};

export interface StorageObject {
    key: string;
    size: number;
}

export interface StorageListResponse {
    objects: StorageObject[];
    nextCursor?: string;
}

export interface StoragePrefix {
    name: string;
    prefix: string;
}

export const storageService = {
    getFiles: async (prefix?: string, limit: number = 50, cursor?: string): Promise<StorageListResponse> => {
        const response = await api.get('/storage/files', {
            params: { prefix, limit, cursor },
        });
        return response.data;
    },

    getPrefixes: async (prefix?: string): Promise<StoragePrefix[]> => {
        const response = await api.get('/storage/prefixes', { params: { prefix } });
        return response.data;
    },

    downloadFile: async (key: string) => {
        const response = await api.get('/storage/download', {
            params: { key },
            responseType: 'blob',
        });
        return response.data;
    },

    downloadAll: async (prefix: string) => {
        const response = await api.get('/storage/download_all', {
            params: { prefix },
            responseType: 'blob',
        });
        return response.data;
    },

    getFileContent: async (key: string) => {
        const response = await api.get('/storage/content', { params: { key } });
        return response.data;
    },

    deleteFile: async (key: string) => {
        const response = await api.delete('/storage/file', { params: { key } });
        return response.data;
    },

    deletePrefix: async (prefix: string) => {
        const response = await api.delete('/storage/prefix', { params: { prefix } });
        return response.data;
    },
};
