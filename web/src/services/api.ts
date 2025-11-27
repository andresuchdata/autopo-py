import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

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

    getStores: async () => {
        try {
            const response = await api.get('/po/stores');
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
    }
};

export const getResults = async () => {
    const response = await api.get('/po/results');
    return response.data;
};
