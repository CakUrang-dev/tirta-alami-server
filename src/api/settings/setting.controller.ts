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
