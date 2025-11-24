import React from 'react';
import { Download } from 'lucide-react';

interface ResultItem {
    Brand: string;
    SKU: string | number;
    Nama: string;
    Stock: number;
    'Daily Sales': number;
    'Reorder point': number;
    'final_updated_regular_po_qty': number;
    'emergency_po_qty': number;
    'total_cost_final_updated_regular_po': number;
    [key: string]: any;
}

interface ResultsTableProps {
    data: ResultItem[];
}

export function ResultsTable({ data }: ResultsTableProps) {
    if (!data || data.length === 0) return null;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(val);
    };

    return (
        <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800">Processing Results</h2>
                <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                </button>
            </div>

            <div className="overflow-x-auto border rounded-lg shadow-sm">
                <table className="min-w-full divide-y divide-gray-200 bg-white">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Name</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Daily Sales</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Reorder Point</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Regular PO</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Emergency PO</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {data.slice(0, 100).map((item, idx) => ( // Limit to 100 for preview
                            <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.Brand}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.SKU}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-xs truncate" title={item.Nama}>{item.Nama}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item.Stock}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item['Daily Sales']?.toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{item['Reorder point']}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600 text-right">{item['final_updated_regular_po_qty']}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-red-600 text-right">{item['emergency_po_qty']}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(item['total_cost_final_updated_regular_po'])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-sm text-gray-500 mt-2 text-center">Showing first 100 rows. Download CSV for full results.</p>
        </div>
    );
}
