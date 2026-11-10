import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import {
  buildReceiptData,
  formatRupiah,
  getTariffConfig,
  serializeCustomer,
  serializePayment,
} from '../../services/billing.service';

/**
 * GET /api/payments/customer/:customerId
 * Get customer info and all unpaid bills for the Payment screen
 */
export async function getCustomerUnpaidPayments(req: Request, res: Response) {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { customerId },
    });

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: `Tidak ada pelanggan ditemukan dengan ID Pelanggan: ${customerId}`,
      });
    }

    const payments = await prisma.payment.findMany({
      where: { customerId, isPaid: false },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
    });

    const totalUnpaidSum = payments.reduce((sum, p) => sum + p.totalCost, 0);

    return res.status(200).json({
      status: 'success',
      customer: serializeCustomer(customer),
      payments: payments.map(serializePayment),
      totalUnpaidSum,
      formattedTotalUnpaidSum: `Rp. ${formatRupiah(totalUnpaidSum)}`,
    });
  } catch (error: any) {
    console.error('Error fetching unpaid payments:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data tagihan pelanggan.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/payments/calculate-total
 * Calculate sum of totalCost for selected receiptIds
 */
export async function calculateSelectedPaymentsTotal(req: Request, res: Response) {
  try {
    const { receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(200).json({
        status: 'success',
        selectedCount: 0,
        totalSum: 0,
        formattedTotalSum: 'Rp. 0',
      });
    }

    const payments = await prisma.payment.findMany({
      where: {
        receiptId: { in: receiptIds.map(String) },
      },
    });

    const totalSum = payments.reduce((sum, p) => sum + p.totalCost, 0);

    return res.status(200).json({
      status: 'success',
      selectedCount: payments.length,
      totalSum,
      formattedTotalSum: `Rp. ${formatRupiah(totalSum)}`,
    });
  } catch (error: any) {
    console.error('Error calculating selected payments total:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menghitung total pembayaran.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/payments/preview-receipt
 * Build receipt data and text preview for selected payments without marking them as paid
 */
export async function previewPaymentReceipt(req: Request, res: Response) {
  try {
    const { customerId, receiptIds } = req.body;

    if (!customerId || !Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Mohon pilih pelanggan dan minimal satu pembayaran untuk dicetak.',
      });
    }

    const customer = await prisma.customer.findUnique({
      where: { customerId: String(customerId) },
    });

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: `Pelanggan dengan ID ${customerId} tidak ditemukan.`,
      });
    }

    const payments = await prisma.payment.findMany({
      where: {
        customerId: customer.customerId,
        receiptId: { in: receiptIds.map(String) },
      },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
    });

    if (payments.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Data pembayaran yang dipilih tidak ditemukan.',
      });
    }

    const tariff = await getTariffConfig();
    const receipt = buildReceiptData(customer, payments, tariff);

    return res.status(200).json({
      status: 'success',
      receipt,
    });
  } catch (error: any) {
    console.error('Error generating receipt preview:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal membuat preview kwitansi.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/payments/process
 * Mark selected payments as paid (move to reports) and return receipt data
 */
export async function processPayments(req: Request, res: Response) {
  try {
    const { customerId, receiptIds } = req.body;

    if (!Array.isArray(receiptIds) || receiptIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Mohon pilih minimal salah satu pembayaran.',
      });
    }

    const selectedPayments = await prisma.payment.findMany({
      where: {
        receiptId: { in: receiptIds.map(String) },
        ...(customerId ? { customerId: String(customerId) } : {}),
      },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
    });

    if (selectedPayments.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Tidak ada data pembayaran valid yang ditemukan untuk diproses.',
      });
    }

    const targetCustomerId = customerId
      ? String(customerId)
      : selectedPayments[0].customerId;

    const customer = await prisma.customer.findUnique({
      where: { customerId: targetCustomerId },
    });

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: `Pelanggan dengan ID ${targetCustomerId} tidak ditemukan.`,
      });
    }

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: {
          id: { in: selectedPayments.map((p) => p.id) },
        },
        data: {
          isPaid: true,
          reportDate: now,
        },
      });

      const paidPayments = await tx.payment.findMany({
        where: {
          id: { in: selectedPayments.map((p) => p.id) },
        },
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
      });

      const remainingUnpaid = await tx.payment.findMany({
        where: {
          customerId: targetCustomerId,
          isPaid: false,
        },
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
      });

      return { paidPayments, remainingUnpaid };
    });

    const tariff = await getTariffConfig();
    const receipt = buildReceiptData(customer, result.paidPayments, tariff);

    return res.status(200).json({
      status: 'success',
      message: `${result.paidPayments.length} Pembayaran berhasil diproses dan dipindahkan ke laporan.`,
      processedCount: result.paidPayments.length,
      paidPayments: result.paidPayments.map(serializePayment),
      remainingPayments: result.remainingUnpaid.map(serializePayment),
      receipt,
    });
  } catch (error: any) {
    console.error('Error processing payments:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan saat memproses pembayaran.',
      detail: error.message,
    });
  }
}
