import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { getTariffConfig } from '../../services/billing.service';

/**
 * GET /api/settings
 * Get all settings and structured tariff config
 */
export async function getSettings(req: Request, res: Response) {
  try {
    const settings = await prisma.setting.findMany({
      orderBy: { key: 'asc' },
    });
    const tariff = await getTariffConfig();

    return res.status(200).json({
      status: 'success',
      tariff,
      settings,
    });
  } catch (error: any) {
    console.error('Error fetching settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil pengaturan sistem.',
      detail: error.message,
    });
  }
}

/**
 * PUT /api/settings
 * Update one or multiple settings (body: { key, value } or { settings: { [key]: value } })
 */
export async function updateSettings(req: Request, res: Response) {
  try {
    const { key, value, description, settings } = req.body;

    if (key && value !== undefined) {
      await prisma.setting.upsert({
        where: { key: String(key) },
        update: {
          value: String(value),
          ...(description !== undefined ? { description: String(description) } : {}),
        },
        create: {
          key: String(key),
          value: String(value),
          description: description ? String(description) : null,
        },
      });
    } else if (settings && typeof settings === 'object') {
      for (const [k, v] of Object.entries(settings)) {
        await prisma.setting.upsert({
          where: { key: k },
          update: { value: String(v) },
          create: { key: k, value: String(v) },
        });
      }
    } else {
      return res.status(400).json({
        status: 'error',
        message: 'Masukkan key & value atau objek settings yang valid.',
      });
    }

    const tariff = await getTariffConfig();
    return res.status(200).json({
      status: 'success',
      message: 'Pengaturan berhasil diperbarui.',
      tariff,
    });
  } catch (error: any) {
    console.error('Error updating settings:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memperbarui pengaturan.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/settings/migrate-batch
 * Bulk import legacy customers, payments, and admins into PostgreSQL
 */
export async function migrateBatch(req: Request, res: Response) {
  try {
    const { customers, payments, admins } = req.body;
    let customersInserted = 0;
    let paymentsInserted = 0;
    let adminsInserted = 0;

    if (Array.isArray(customers) && customers.length > 0) {
      const result = await prisma.customer.createMany({
        data: customers.map((c: any) => ({
          customerId: String(c.customerId),
          name: String(c.name || ''),
          address: String(c.address || ''),
          customerClass: String(c.customerClass || '1'),
          village: String(c.village || ''),
          initialMeter: Number(c.initialMeter) || 0,
          phoneNumber: c.phoneNumber ? String(c.phoneNumber) : null,
        })),
        skipDuplicates: true,
      });
      customersInserted = result.count;
    }

    if (Array.isArray(admins) && admins.length > 0) {
      const result = await prisma.admin.createMany({
        data: admins.map((a: any) => ({
          adminId: String(a.adminId),
          username: a.username ? String(a.username) : null,
          name: String(a.name || ''),
        })),
        skipDuplicates: true,
      });
      adminsInserted = result.count;
    }

    if (Array.isArray(payments) && payments.length > 0) {
      const result = await prisma.payment.createMany({
        data: payments.map((p: any) => ({
          receiptId: String(p.receiptId),
          customerId: String(p.customerId),
          name: String(p.name || ''),
          village: String(p.village || ''),
          pastMonthMeter: Number(p.pastMonthMeter) || 0,
          currentMonthMeter: Number(p.currentMonthMeter) || 0,
          totalMeter: Number(p.totalMeter) || 0,
          rentFee: Number(p.rentFee) || 0,
          totalCost: Number(p.totalCost) || 0,
          period: String(p.period),
          periodMonth: Number(p.periodMonth),
          periodYear: Number(p.periodYear),
          isPaid: Boolean(p.isPaid),
          paymentDate: new Date(p.paymentDate),
          reportDate: p.reportDate ? new Date(p.reportDate) : null,
        })),
        skipDuplicates: true,
      });
      paymentsInserted = result.count;
    }

    const [totalCustomers, totalPayments, totalAdmins] = await Promise.all([
      prisma.customer.count(),
      prisma.payment.count(),
      prisma.admin.count(),
    ]);

    return res.status(200).json({
      status: 'success',
      inserted: {
        customers: customersInserted,
        payments: paymentsInserted,
        admins: adminsInserted,
      },
      totals: {
        customers: totalCustomers,
        payments: totalPayments,
        admins: totalAdmins,
      },
    });
  } catch (error: any) {
    console.error('Error in migrateBatch:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal melakukan migrasi data batch.',
      detail: error.message,
    });
  }
}
