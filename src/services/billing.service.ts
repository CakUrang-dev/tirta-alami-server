import { Customer, Payment } from '@prisma/client';
import { prisma } from '../config/database';

export interface TariffConfig {
  meterRentPrice: number;
  tier1Rate: number;
  tier2Rate: number;
  companyName: string;
  companyHeader: string;
}

export interface BillCalculationResult {
  pastMonthMeter: number;
  currentMonthMeter: number;
  totalMeter: number;
  rentFee: number;
  tier1Usage: number;
  tier1Cost: number;
  tier2Usage: number;
  tier2Cost: number;
  waterCost: number;
  totalCost: number;
}

/**
 * Retrieve tariff and company configuration from the settings table
 */
export async function getTariffConfig(): Promise<TariffConfig> {
  const settings = await prisma.setting.findMany();
  const map = new Map<string, string>();
  for (const s of settings) {
    map.set(s.key, s.value);
  }

  return {
    meterRentPrice: parseInt(map.get('meter_rent_price') || '21000', 10) || 21000,
    tier1Rate: parseInt(map.get('tier1_rate') || '2000', 10) || 2000,
    tier2Rate: parseInt(map.get('tier2_rate') || '3000', 10) || 3000,
    companyName: map.get('company_name') || 'HIPPAM "TIRTA ALAMI"',
    companyHeader: map.get('company_header') || 'KEL. CEMOROKANDANG KEC. KEDUNGKANDANG',
  };
}

/**
 * Calculate progressive water bill cost based on meter readings.
 * Tier 1: 1 - 10 m³
 * Tier 2: > 10 m³
 */
export function calculateWaterBillSync(
  pastMonthMeter: number,
  currentMonthMeter: number,
  tariff: Pick<TariffConfig, 'meterRentPrice' | 'tier1Rate' | 'tier2Rate'>
): BillCalculationResult {
  if (Number.isNaN(pastMonthMeter) || Number.isNaN(currentMonthMeter)) {
    throw new Error('Nilai meter harus berupa angka yang valid.');
  }

  const totalMeter = currentMonthMeter - pastMonthMeter;
  if (totalMeter < 0) {
    throw new Error(
      `Meter bulan ini (${currentMonthMeter}) tidak boleh lebih kecil dari meter bulan lalu (${pastMonthMeter}).`
    );
  }

  const rentFee = tariff.meterRentPrice;

  const tier1Usage = totalMeter > 0 ? Math.min(totalMeter, 10) : 0;
  const tier1Cost = tier1Usage * tariff.tier1Rate;

  const tier2Usage = totalMeter > 10 ? totalMeter - 10 : 0;
  const tier2Cost = tier2Usage * tariff.tier2Rate;

  const waterCost = tier1Cost + tier2Cost;
  const totalCost = rentFee + waterCost;

  return {
    pastMonthMeter,
    currentMonthMeter,
    totalMeter,
    rentFee,
    tier1Usage,
    tier1Cost,
    tier2Usage,
    tier2Cost,
    waterCost,
    totalCost,
  };
}

/**
 * Parse period input ("M/D/YYYY", "YYYY-MM-DD", or ISO string) into structured date info.
 */
export function parsePeriodInput(periodStr?: string): {
  period: string;
  month: number;
  year: number;
} {
  if (!periodStr || !periodStr.trim()) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const year = now.getFullYear();
    return {
      period: `${month}/${day}/${year}`,
      month,
      year,
    };
  }

  const trimmed = periodStr.trim();

  // Format: M/D/YYYY or MM/DD/YYYY
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map((p) => parseInt(p, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      let [first, second, year] = parts;
      if (year < 100) year += 2000;
      const month = first > 12 ? second : first;
      const day = first > 12 ? first : second;
      return {
        period: `${month}/${day}/${year}`,
        month,
        year,
      };
    }
  }

  // Format: YYYY-MM-DD or DD-MM-YYYY
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map((p) => parseInt(p, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      if (parts[0] > 1900) {
        const [year, month, day] = parts;
        return {
          period: `${month}/${day}/${year}`,
          month,
          year,
        };
      } else {
        const [day, month, year] = parts;
        return {
          period: `${month}/${day}/${year}`,
          month,
          year,
        };
      }
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    const year = parsed.getFullYear();
    return {
      period: `${month}/${day}/${year}`,
      month,
      year,
    };
  }

  throw new Error(`Format tanggal periode tidak valid: ${periodStr}`);
}

/**
 * Generate a receipt ID for a customer and billing period.
 */
export function generateReceiptId(customerId: string, month: number, year: number): string {
  return `${customerId}${month}${year}`;
}

/**
 * Format currency as Indonesian Rupiah (e.g., 21.000)
 */
export function formatRupiah(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Serialize a Prisma Customer record into the JSON format expected by Desktop & Mobile clients.
 */
export function serializeCustomer(customer: Customer) {
  return {
    _id: String(customer.id),
    id: customer.id,
    customerId: customer.customerId,
    name: customer.name,
    address: customer.address,
    customerClass: customer.customerClass,
    village: customer.village,
    initialMeter: String(customer.initialMeter),
    initialMeterNumber: customer.initialMeter,
    phoneNumber: customer.phoneNumber || '',
    isLocked: customer.isLocked,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
  };
}

/**
 * Serialize a Prisma Payment record into the JSON format expected by Desktop & Mobile clients.
 */
export function serializePayment(payment: Payment) {
  return {
    _id: String(payment.id),
    id: payment.id,
    receiptId: payment.receiptId,
    customerId: payment.customerId,
    name: payment.name,
    village: payment.village,
    pastMonthMeter: String(payment.pastMonthMeter),
    currentMonthMeter: String(payment.currentMonthMeter),
    totalMeter: String(payment.totalMeter),
    rentFee: String(payment.rentFee),
    totalCost: String(payment.totalCost),
    pastMonthMeterNumber: payment.pastMonthMeter,
    currentMonthMeterNumber: payment.currentMonthMeter,
    totalMeterNumber: payment.totalMeter,
    rentFeeNumber: payment.rentFee,
    totalCostNumber: payment.totalCost,
    period: payment.period,
    periodMonth: payment.periodMonth,
    periodYear: payment.periodYear,
    isPaid: payment.isPaid,
    paymentDate: payment.paymentDate,
    reportDate: payment.reportDate,
    report_date: payment.reportDate ? payment.reportDate.toISOString() : null,
  };
}

/**
 * Build structured receipt data and plain-text simulation for printing on dot-matrix printers.
 */
export function buildReceiptData(
  customer: Customer,
  payments: Payment[],
  tariff: Pick<TariffConfig, 'companyName' | 'companyHeader'>
) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const formattedDate = `${dd} - ${mm} - ${yyyy}`;

  const items = payments.map((p) => ({
    receiptId: p.receiptId,
    pastMonthMeter: String(p.pastMonthMeter),
    currentMonthMeter: String(p.currentMonthMeter),
    totalMeter: String(p.totalMeter),
    totalCost: String(p.totalCost),
    totalCostNumber: p.totalCost,
    formattedCost: `Rp. ${formatRupiah(p.totalCost)}`,
    period: p.period,
  }));

  const totalAmount = payments.reduce((sum, p) => sum + p.totalCost, 0);

  // Build 80-column text preview for dot-matrix printer
  const cols = 80;
  const divider = '-'.repeat(cols);
  const lines: string[] = [];

  lines.push(`ID PELANGGAN   : ${customer.customerId}`);
  lines.push(`NAMA           : ${customer.name}`);
  lines.push(`DESA           : ${customer.village}`);
  lines.push(`GOLONGAN       : ${customer.customerClass}`);
  lines.push(divider);
  lines.push(
    'NO KWITANSI'.padEnd(14) +
      'METER AWAL'.padEnd(12) +
      'METER AKHIR'.padEnd(13) +
      'METER'.padEnd(10) +
      'BAYAR'
  );

  for (const item of items) {
    lines.push(
      item.receiptId.padEnd(14) +
        item.pastMonthMeter.padEnd(12) +
        item.currentMonthMeter.padEnd(13) +
        item.totalMeter.padEnd(10) +
        `Rp. ${item.totalCost}`
    );
  }

  lines.push(divider);
  lines.push('TOTAL PEMBAYARAN'.padEnd(60) + `: Rp. ${totalAmount}`);
  lines.push(divider);
  lines.push(`TANGGAL : ${formattedDate}`);
  lines.push('Note: Mohon untuk membayar tepat waktu sebelum tanggal 20');
  lines.push(' '.repeat(15) + tariff.companyName.replace(/"/g, ''));

  return {
    companyName: tariff.companyName,
    headerText: tariff.companyHeader,
    customer: serializeCustomer(customer),
    payments: items,
    totalAmount,
    formattedTotalAmount: `Rp. ${formatRupiah(totalAmount)}`,
    formattedDate,
    note: 'Mohon untuk membayar tepat waktu sebelum tanggal 20',
    previewText: lines.join('\n'),
  };
}
