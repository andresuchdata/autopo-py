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
    'Released': '#FF8C61',    // Orange
    'Approved': '#5DBABD',    // Teal
    'Declined': '#EF4444',    // Red
    'Received': '#8B5CF6',    // Purple
    'Sent': '#FF9F66',        // Light Orange
    'Arrived': '#4FA8A8',     // Dark Teal
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
