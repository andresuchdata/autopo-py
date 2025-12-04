/**
 * Centralized PO Status Color Mapping
 * 
 * Status Codes:
 * 0 = PO Released
 * 1 = PO Approved
 * 2 = PO Declined
 * 3 = PO Received
 * 4 = PO Sent
 * 5 = PO Arrived
 */

export const PO_STATUS_COLORS: Record<string, string> = {
    'Released': '#F97316',    // Orange
    'Approved': '#16A34A',    // Green
    'Declined': '#DC2626',    // Red
    'Received': '#6366F1',    // Indigo
    'Sent': '#FACC15',        // Amber
    'Arrived': '#0EA5E9',     // Cyan
};

export const PO_STATUS_NAMES: Record<number, string> = {
    0: 'Released',
    1: 'Approved',
    2: 'Declined',
    3: 'Received',
    4: 'Sent',
    5: 'Arrived',
};

/**
 * Get color for a PO status by name
 */
export const getStatusColor = (status: string): string => {
    return PO_STATUS_COLORS[status] || '#6B7280'; // Default to gray if not found
};

/**
 * Get color for a PO status by code
 */
export const getStatusColorByCode = (code: number): string => {
    const statusName = PO_STATUS_NAMES[code];
    return statusName ? PO_STATUS_COLORS[statusName] : '#6B7280';
};

/**
 * Get all status colors as an array (useful for charts)
 */
export const getAllStatusColors = (): string[] => {
    return Object.values(PO_STATUS_COLORS);
};
