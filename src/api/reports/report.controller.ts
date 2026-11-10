import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { formatRupiah, serializePayment } from '../../services/billing.service';

const MONTH_NAMES_ID = [
  '',
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function parseQueryDate(
  dateStr?: string,
  yearParam?: string,
  monthParam?: string,
  dayParam?: string
): { year: number; month: number; day: number; formattedDate: string } {
  if (yearParam && monthParam && dayParam) {
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);
    const day = parseInt(dayParam, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return {
        year,
        month,
        day,
        formattedDate: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
      };
    }
  }

  if (!dateStr || !dateStr.trim()) {
    throw new Error('Parameter tanggal (date) wajib diisi.');
  }

  const trimmed = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map((n) => parseInt(n, 10));
    return {
      year,
      month,
      day,
      formattedDate: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
    };
  }

  // M/D/YYYY or D/M/YYYY
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map((n) => parseInt(n, 10));
    if (parts.length === 3 && !parts.some(Number.isNaN)) {
      let [p1, p2, year] = parts;
      if (year < 100) year += 2000;
      const month = p1 > 12 ? p2 : p1;
      const day = p1 > 12 ? p1 : p2;
      return {
        year,
        month,
        day,
        formattedDate: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
      };
    }
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth() + 1;
    const day = parsed.getDate();
    return {
      year,
      month,
      day,
      formattedDate: `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
    };
  }

  throw new Error(`Format tanggal tidak valid: ${dateStr}`);
}

/**
 * GET /api/reports/daily?date=YYYY-MM-DD (or MM/DD/YYYY)
 */
export async function getDailyReport(req: Request, res: Response) {
  try {
    const dateQuery = typeof req.query.date === 'string' ? req.query.date : undefined;
    const yearQuery = typeof req.query.year === 'string' ? req.query.year : undefined;
    const monthQuery = typeof req.query.month === 'string' ? req.query.month : undefined;
    const dayQuery = typeof req.query.day === 'string' ? req.query.day : undefined;

    const { year, month, day, formattedDate } = parseQueryDate(
      dateQuery,
      yearQuery,
      monthQuery,
      dayQuery
    );

    const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

    const reports = await prisma.payment.findMany({
      where: {
        isPaid: true,
        reportDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { reportDate: 'asc' },
    });

    const totalMeter = reports.reduce((sum, r) => sum + r.totalMeter, 0);
    const totalRevenue = reports.reduce((sum, r) => sum + r.totalCost, 0);

    return res.status(200).json({
      status: 'success',
      date: formattedDate,
      reports: reports.map(serializePayment),
      summary: {
        totalTransactions: reports.length,
        totalMeter,
        totalRevenue,
        totalText: `Rp. ${totalRevenue}`,
        formattedTotalRevenue: `Rp. ${formatRupiah(totalRevenue)}`,
      },
    });
  } catch (error: any) {
    console.error('Error fetching daily report:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Gagal mengambil laporan harian.',
    });
  }
}

/**
 * GET /api/reports/monthly?month=4&year=2025
 */
export async function getMonthlyReport(req: Request, res: Response) {
  try {
    const month = parseInt(String(req.query.month || ''), 10);
    const year = parseInt(String(req.query.year || ''), 10);

    if (Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({
        status: 'error',
        message: 'Bulan harus berupa angka antara 1 sampai 12.',
      });
    }

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({
        status: 'error',
        message: 'Tahun harus berupa angka antara 2000 sampai 2100.',
      });
    }

    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const reports = await prisma.payment.findMany({
      where: {
        isPaid: true,
        reportDate: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      orderBy: { reportDate: 'asc' },
    });

    const totalMeter = reports.reduce((sum, r) => sum + r.totalMeter, 0);
    const totalRevenue = reports.reduce((sum, r) => sum + r.totalCost, 0);
    const monthName = MONTH_NAMES_ID[month] || String(month);

    return res.status(200).json({
      status: 'success',
      month,
      year,
      monthName,
      reports: reports.map((r) => {
        const serialized = serializePayment(r);
        const rd = r.reportDate;
        const formattedReportDate = rd
          ? `${String(rd.getMonth() + 1).padStart(2, '0')}/${String(rd.getDate()).padStart(2, '0')}/${rd.getFullYear()}`
          : '';
        return {
          ...serialized,
          formattedReportDate,
        };
      }),
      summary: {
        totalTransactions: reports.length,
        totalMeter,
        totalRevenue,
        totalText: `Rp. ${totalRevenue}`,
        formattedTotalRevenue: `Rp. ${formatRupiah(totalRevenue)}`,
      },
    });
  } catch (error: any) {
    console.error('Error fetching monthly report:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil laporan bulanan.',
      detail: error.message,
    });
  }
}
