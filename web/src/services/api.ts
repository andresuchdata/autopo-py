import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
    baseURL: API_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

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

    getSuppliers: async () => {
        try {
            const response = await api.get('/po/suppliers');
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
            const response = await api.get('/po/stores', search ? { params: { search } } : undefined);
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

    getBrands: async (search?: string) => {
        try {
            const response = await api.get('/po/brands', search ? { params: { search } } : undefined);
            return response.data;
        } catch (error) {
            console.error('Error fetching brands:', error);
            throw error;
        }
    },

    getSkus: async (params?: { search?: string; limit?: number; offset?: number }) => {
        const query: Record<string, string | number> = {};
        if (params?.search) {
            query.search = params.search;
        }
        if (typeof params?.limit === 'number') {
            query.limit = params.limit;
        }
        if (typeof params?.offset === 'number') {
            query.offset = params.offset;
        }

        try {
            const response = await api.get('/po/skus', Object.keys(query).length ? { params: query } : undefined);
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
        const response = await api.get('/po/analytics/supplier_items', {
            params: {
                supplier_id: supplierId,
                page,
                page_size: pageSize,
                sort_field: sortField,
                sort_direction: sortDirection,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching supplier PO items:', error);
        throw error;
    }
};

export interface DashboardSummaryParams {
    poType?: 'AU' | 'PO' | 'OTHERS';
    releasedDate?: string;
}

export const getDashboardSummary = async (params?: DashboardSummaryParams) => {
    try {
        const response = await api.get('/po/analytics/summary', {
            params: {
                po_type: params?.poType,
                released_date: params?.releasedDate,
            },
        });
        return response.data;
    } catch (error) {
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

export const getPOAging = async () => {
    try {
        const response = await api.get('/po/analytics/aging');
        return response.data;
    } catch (error) {
        console.error('Error fetching PO aging:', error);
        throw error;
    }
};

export const getSupplierPerformance = async () => {
    try {
        const response = await api.get('/po/analytics/performance');
        return response.data;
    } catch (error) {
        console.error('Error fetching supplier performance:', error);
        throw error;
    }
};

export interface POSnapshotItem {
    po_number: string;
    brand_name: string;
    sku: string;
    product_name: string;
    store_name: string;
    unit_price: number;
    total_amount: number;
    po_qty: number;
    received_qty: number | null;
    po_released_at: string | null;
    po_sent_at: string | null;
    po_approved_at: string | null;
    po_arrived_at: string | null;
}

export interface POSnapshotItemsResponse {
    items: POSnapshotItem[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

interface POSnapshotItemsParams {
    status: string;
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
}

export const getPOSnapshotItems = async ({
    status,
    page = 1,
    pageSize = 20,
    sortField = 'po_number',
    sortDirection = 'asc',
}: POSnapshotItemsParams): Promise<POSnapshotItemsResponse> => {
    try {
        const response = await api.get('/po/analytics/items', {
            params: {
                status: status.toLowerCase(),
                page,
                page_size: pageSize,
                sort_field: sortField,
                sort_direction: sortDirection,
            },
        });
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
