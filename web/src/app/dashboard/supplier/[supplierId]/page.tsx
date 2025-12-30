'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Loader2, ArrowLeft } from 'lucide-react';
import { getSupplierDetails, PODetail } from '@/services/api';

const formatDate = (value: string | null) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
};

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

export default function SupplierDetailPage() {
    const params = useParams();
    const supplierId = params.supplierId as string;
    const router = useRouter();

    const [pos, setPos] = useState<PODetail[]>([]);
    const [supplier, setSupplier] = useState<{ id: number; name: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const id = parseInt(supplierId, 10);
            if (isNaN(id)) {
                throw new Error('Invalid supplier ID');
            }
            const data = await getSupplierDetails(id);
            setSupplier(data.supplier);
            setPos(data.pos);
            setError(null);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to load supplier details');
        } finally {
            setLoading(false);
        }
    }, [supplierId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center text-destructive">
                <p>Error: {error}</p>
                <Button variant="outline" onClick={() => router.back()} className="mt-4">
                    <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8">
            <div className="mb-6 flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">Supplier: {supplier?.name || `ID ${supplierId}`}</h1>
                    <p className="text-muted-foreground">Purchase Order History</p>
                </div>
            </div>

            <div className="rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>PO Number</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Total Qty</TableHead>
                            <TableHead className="text-right">Total Amount</TableHead>
                            <TableHead className="text-right">Released Date</TableHead>
                            <TableHead className="text-right">Sent Date</TableHead>
                            <TableHead className="text-right">Approved Date</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {pos.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                    No purchase orders found for this supplier.
                                </TableCell>
                            </TableRow>
                        ) : (
                            pos.map((po) => (
                                <TableRow key={po.po_number}>
                                    <TableCell className="font-medium">
                                        <a href={`/dashboard/po/${encodeURIComponent(po.po_number)}`} className="text-primary hover:underline">
                                            {po.po_number}
                                        </a>
                                    </TableCell>
                                    <TableCell>
                                        <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                            {po.status}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">{po.po_qty.toLocaleString()}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(po.total_amount)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_released_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_sent_at)}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {formatDate(po.po_approved_at)}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
