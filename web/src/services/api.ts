import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: API_URL,
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

export const processPO = async (supplierFile?: File, contributionFile?: File) => {
    const formData = new FormData();
    if (supplierFile) {
        formData.append('supplier_file', supplierFile);
    }
    if (contributionFile) {
        formData.append('contribution_file', contributionFile);
    }
    const response = await api.post('/po/process', formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

export const getResults = async () => {
    const response = await api.get('/po/results');
    return response.data;
};
