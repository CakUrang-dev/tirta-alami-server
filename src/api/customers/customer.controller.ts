import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import {
  getTariffConfig,
  serializeCustomer,
  serializePayment,
} from '../../services/billing.service';

/**
 * GET /api/customers
 * Optional query param: ?search=...
 */
export async function getAllCustomers(req: Request, res: Response) {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const customers = await prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { customerId: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { village: { contains: search, mode: 'insensitive' } },
              { address: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { customerId: 'asc' },
    });

    return res.status(200).json({
      status: 'success',
      count: customers.length,
      customers: customers.map(serializeCustomer),
    });
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data pelanggan.',
      detail: error.message,
    });
  }
}

/**
 * GET /api/customers/:customerId
 * Get single customer by customerId (along with unpaid payments & tariff config)
 */
export async function getCustomerById(req: Request, res: Response) {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { customerId },
      include: {
        payments: {
          where: { isPaid: false },
          orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: `Pelanggan dengan ID ${customerId} tidak ditemukan.`,
      });
    }

    const tariff = await getTariffConfig();

    return res.status(200).json({
      status: 'success',
      customer: serializeCustomer(customer),
      unpaidPayments: customer.payments.map(serializePayment),
      tariff,
    });
  } catch (error: any) {
    console.error('Error fetching customer by ID:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil detail pelanggan.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/customers
 * Create a new customer
 */
export async function createCustomer(req: Request, res: Response) {
  try {
    const {
      customerId,
      name,
      address = '',
      customerClass = '',
      village = '',
      initialMeter = 0,
      phoneNumber,
    } = req.body;

    const trimmedId = String(customerId || '').trim();
    const trimmedName = String(name || '').trim();

    if (!trimmedId || !trimmedName) {
      return res.status(400).json({
        status: 'error',
        message: 'ID Pelanggan dan Nama harus diisi.',
      });
    }

    const parsedInitialMeter = parseInt(String(initialMeter || '0'), 10);
    if (Number.isNaN(parsedInitialMeter) || parsedInitialMeter < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Meter Awal harus berupa angka positif atau 0.',
      });
    }

    const existing = await prisma.customer.findUnique({
      where: { customerId: trimmedId },
    });

    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: `Pelanggan dengan ID ${trimmedId} sudah terdaftar atas nama ${existing.name}.`,
      });
    }

    const created = await prisma.customer.create({
      data: {
        customerId: trimmedId,
        name: trimmedName,
        address: String(address || '').trim(),
        customerClass: String(customerClass || '').trim(),
        village: String(village || '').trim(),
        initialMeter: parsedInitialMeter,
        phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
      },
    });

    return res.status(201).json({
      status: 'success',
      message: 'Pelanggan baru berhasil ditambahkan.',
      customer: serializeCustomer(created),
    });
  } catch (error: any) {
    console.error('Error creating customer:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menambahkan pelanggan baru.',
      detail: error.message,
    });
  }
}

/**
 * PUT /api/customers/:id
 * Update an existing customer by database ID (or customerId)
 */
export async function updateCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const {
      customerId,
      name,
      address = '',
      customerClass = '',
      village = '',
      initialMeter,
      phoneNumber,
    } = req.body;

    const trimmedId = String(customerId || '').trim();
    const trimmedName = String(name || '').trim();

    if (!trimmedId || !trimmedName) {
      return res.status(400).json({
        status: 'error',
        message: 'ID Pelanggan dan Nama harus diisi.',
      });
    }

    const parsedInitialMeter =
      initialMeter !== undefined ? parseInt(String(initialMeter), 10) : undefined;
    if (parsedInitialMeter !== undefined && (Number.isNaN(parsedInitialMeter) || parsedInitialMeter < 0)) {
      return res.status(400).json({
        status: 'error',
        message: 'Meter Awal harus berupa angka positif atau 0.',
      });
    }

    // Find target customer by numeric id first, or fallback to customerId
    const numericId = parseInt(id, 10);
    let targetCustomer = !Number.isNaN(numericId)
      ? await prisma.customer.findUnique({ where: { id: numericId } })
      : null;

    if (!targetCustomer) {
      targetCustomer = await prisma.customer.findUnique({ where: { customerId: id } });
    }

    if (!targetCustomer) {
      return res.status(404).json({
        status: 'error',
        message: 'Data pelanggan yang akan diubah tidak ditemukan.',
      });
    }

    // Check if the new customerId conflicts with another customer
    if (trimmedId !== targetCustomer.customerId) {
      const duplicate = await prisma.customer.findUnique({
        where: { customerId: trimmedId },
      });
      if (duplicate && duplicate.id !== targetCustomer.id) {
        return res.status(409).json({
          status: 'error',
          message: `ID ${trimmedId} sudah digunakan oleh pelanggan lain (${duplicate.name}).`,
        });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.customer.update({
        where: { id: targetCustomer!.id },
        data: {
          customerId: trimmedId,
          name: trimmedName,
          address: String(address || '').trim(),
          customerClass: String(customerClass || '').trim(),
          village: String(village || '').trim(),
          ...(parsedInitialMeter !== undefined ? { initialMeter: parsedInitialMeter } : {}),
          ...(phoneNumber !== undefined
            ? { phoneNumber: phoneNumber ? String(phoneNumber).trim() : null }
            : {}),
        },
      });

      // Keep snapshot name & village in sync on unpaid bills
      await tx.payment.updateMany({
        where: { customerId: updatedCustomer.customerId, isPaid: false },
        data: {
          name: updatedCustomer.name,
          village: updatedCustomer.village,
        },
      });

      return updatedCustomer;
    });

    return res.status(200).json({
      status: 'success',
      message: 'Data pelanggan berhasil diubah.',
      customer: serializeCustomer(updated),
    });
  } catch (error: any) {
    console.error('Error updating customer:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengubah data pelanggan.',
      detail: error.message,
    });
  }
}

/**
 * DELETE /api/customers/:id
 * Delete a customer by database ID (or customerId)
 */
export async function deleteCustomer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const numericId = parseInt(id, 10);

    let targetCustomer = !Number.isNaN(numericId)
      ? await prisma.customer.findUnique({ where: { id: numericId } })
      : null;

    if (!targetCustomer) {
      targetCustomer = await prisma.customer.findUnique({ where: { customerId: id } });
    }

    if (!targetCustomer) {
      return res.status(404).json({
        status: 'error',
        message: 'Tidak bisa menemukan pelanggan yang dipilih.',
      });
    }

    await prisma.customer.delete({
      where: { id: targetCustomer.id },
    });

    return res.status(200).json({
      status: 'success',
      message: 'Data pelanggan berhasil dihapus.',
    });
  } catch (error: any) {
    console.error('Error deleting customer:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal menghapus data pelanggan.',
      detail: error.message,
    });
  }
}
