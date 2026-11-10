import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import {
  calculateWaterBillSync,
  generateReceiptId,
  getTariffConfig,
  parsePeriodInput,
  serializeCustomer,
  serializePayment,
} from '../../services/billing.service';

/**
 * GET /api/water-consumption/customer/:customerId
 * Get customer info, unpaid bills (for the edit table), and tariff configuration
 */
export async function getCustomerWaterConsumption(req: Request, res: Response) {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { customerId },
    });

    const payments = await prisma.payment.findMany({
      where: { customerId, isPaid: false },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
    });

    const tariff = await getTariffConfig();

    if (!customer) {
      return res.status(404).json({
        status: 'error',
        message: `Pelanggan dengan ID ${customerId} tidak ditemukan.`,
        payments: payments.map(serializePayment),
        tariff,
      });
    }

    return res.status(200).json({
      status: 'success',
      customer: serializeCustomer(customer),
      payments: payments.map(serializePayment),
      tariff,
    });
  } catch (error: any) {
    console.error('Error getting customer water consumption:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil data pemakaian air pelanggan.',
      detail: error.message,
    });
  }
}

/**
 * POST /api/water-consumption/calculate (or GET with query params)
 * Calculate total meter usage, rent fee, and progressive tariff cost
 */
export async function calculateWaterConsumption(req: Request, res: Response) {
  try {
    const source = req.method === 'GET' ? req.query : req.body;
    const { customerId, receiptId, currentMonthMeter } = source;
    let { pastMonthMeter } = source;

    const parsedCurrent = parseInt(String(currentMonthMeter), 10);
    if (Number.isNaN(parsedCurrent)) {
      return res.status(400).json({
        status: 'error',
        message: 'Meter bulan ini harus berupa angka yang valid.',
      });
    }

    let parsedPast =
      pastMonthMeter !== undefined && pastMonthMeter !== ''
        ? parseInt(String(pastMonthMeter), 10)
        : NaN;

    if (Number.isNaN(parsedPast)) {
      if (receiptId) {
        const payment = await prisma.payment.findUnique({
          where: { receiptId: String(receiptId) },
        });
        if (!payment) {
          return res.status(404).json({
            status: 'error',
            message: `Pembayaran dengan No Kwitansi ${receiptId} tidak ditemukan.`,
          });
        }
        parsedPast = payment.pastMonthMeter;
      } else if (customerId) {
        const customer = await prisma.customer.findUnique({
          where: { customerId: String(customerId) },
        });
        if (!customer) {
          return res.status(404).json({
            status: 'error',
            message: `Pelanggan dengan ID ${customerId} tidak ditemukan.`,
          });
        }
        parsedPast = customer.initialMeter;
      } else {
        return res.status(400).json({
          status: 'error',
          message: 'Meter bulan lalu (pastMonthMeter) atau customerId harus disertakan.',
        });
      }
    }

    const tariff = await getTariffConfig();
    const calculation = calculateWaterBillSync(parsedPast, parsedCurrent, tariff);

    return res.status(200).json({
      status: 'success',
      calculation: {
        ...calculation,
        pastMonthMeter: String(calculation.pastMonthMeter),
        currentMonthMeter: String(calculation.currentMonthMeter),
        totalMeter: String(calculation.totalMeter),
        rentFee: String(calculation.rentFee),
        totalCost: String(calculation.totalCost),
        pastMonthMeterNumber: calculation.pastMonthMeter,
        currentMonthMeterNumber: calculation.currentMonthMeter,
        totalMeterNumber: calculation.totalMeter,
        rentFeeNumber: calculation.rentFee,
        totalCostNumber: calculation.totalCost,
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Gagal menghitung tagihan air.',
    });
  }
}

/**
 * POST /api/water-consumption
 * Record new monthly meter reading & create unpaid bill
 */
export async function createWaterConsumption(req: Request, res: Response) {
  try {
    const { customerId, currentMonthMeter, period } = req.body;

    if (!customerId) {
      return res.status(400).json({
        status: 'error',
        message: 'Silakan pilih pelanggan terlebih dahulu.',
      });
    }

    const parsedCurrentMeter = parseInt(String(currentMonthMeter), 10);
    if (Number.isNaN(parsedCurrentMeter)) {
      return res.status(400).json({
        status: 'error',
        message: 'Meter bulan ini harus diisi dengan angka yang valid.',
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

    const tariff = await getTariffConfig();
    const calculation = calculateWaterBillSync(
      customer.initialMeter,
      parsedCurrentMeter,
      tariff
    );

    const parsedPeriod = parsePeriodInput(period);
    const receiptId = generateReceiptId(
      customer.customerId,
      parsedPeriod.month,
      parsedPeriod.year
    );

    const existingReceipt = await prisma.payment.findUnique({
      where: { receiptId },
    });

    if (existingReceipt) {
      return res.status(409).json({
        status: 'error',
        message: `Tagihan untuk pelanggan ${customer.name} pada periode bulan ${parsedPeriod.month}/${parsedPeriod.year} (No Kwitansi: ${receiptId}) sudah tercatat.`,
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          receiptId,
          customerId: customer.customerId,
          name: customer.name,
          village: customer.village,
          pastMonthMeter: calculation.pastMonthMeter,
          currentMonthMeter: calculation.currentMonthMeter,
          totalMeter: calculation.totalMeter,
          rentFee: calculation.rentFee,
          totalCost: calculation.totalCost,
          period: parsedPeriod.period,
          periodMonth: parsedPeriod.month,
          periodYear: parsedPeriod.year,
          isPaid: false,
          paymentDate: new Date(),
        },
      });

      const updatedCustomer = await tx.customer.update({
        where: { customerId: customer.customerId },
        data: { initialMeter: calculation.currentMonthMeter },
      });

      return { payment, updatedCustomer };
    });

    return res.status(201).json({
      status: 'success',
      message: 'Pembayaran / pemakaian air berhasil disimpan.',
      payment: serializePayment(result.payment),
      customer: serializeCustomer(result.updatedCustomer),
    });
  } catch (error: any) {
    console.error('Error creating water consumption:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Gagal menyimpan data pemakaian air.',
    });
  }
}

/**
 * PUT /api/water-consumption/:receiptId
 * Update a meter reading and cascade-recalculate all subsequent unpaid bills for that customer
 */
export async function updateWaterConsumption(req: Request, res: Response) {
  try {
    const { receiptId } = req.params;
    const { currentMonthMeter, period } = req.body;

    const parsedCurrentMeter = parseInt(String(currentMonthMeter), 10);
    if (Number.isNaN(parsedCurrentMeter)) {
      return res.status(400).json({
        status: 'error',
        message: 'Meter bulan ini harus berupa angka yang valid.',
      });
    }

    const targetPayment = await prisma.payment.findUnique({
      where: { receiptId },
    });

    if (!targetPayment) {
      return res.status(404).json({
        status: 'error',
        message: `Data tagihan dengan No Kwitansi ${receiptId} tidak ditemukan.`,
      });
    }

    const tariff = await getTariffConfig();

    // Calculate updated bill for the edited record
    const updatedCalc = calculateWaterBillSync(
      targetPayment.pastMonthMeter,
      parsedCurrentMeter,
      tariff
    );

    const parsedPeriod = period ? parsePeriodInput(period) : null;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update the target payment
      const updatedTarget = await tx.payment.update({
        where: { receiptId },
        data: {
          currentMonthMeter: updatedCalc.currentMonthMeter,
          totalMeter: updatedCalc.totalMeter,
          rentFee: updatedCalc.rentFee,
          totalCost: updatedCalc.totalCost,
          ...(parsedPeriod
            ? {
                period: parsedPeriod.period,
                periodMonth: parsedPeriod.month,
                periodYear: parsedPeriod.year,
              }
            : {}),
        },
      });

      // 2. Fetch all unpaid payments for this customer in chronological order
      const allPayments = await tx.payment.findMany({
        where: { customerId: targetPayment.customerId, isPaid: false },
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
      });

      const updatedIndex = allPayments.findIndex((p) => p.receiptId === receiptId);

      if (updatedIndex !== -1) {
        let previousMeter = updatedCalc.currentMonthMeter;

        // 3. Cascade recalculate all subsequent payments
        for (let i = updatedIndex + 1; i < allPayments.length; i++) {
          const subsequent = allPayments[i];
          const subCalc = calculateWaterBillSync(
            previousMeter,
            subsequent.currentMonthMeter,
            tariff
          );

          await tx.payment.update({
            where: { id: subsequent.id },
            data: {
              pastMonthMeter: subCalc.pastMonthMeter,
              totalMeter: subCalc.totalMeter,
              rentFee: subCalc.rentFee,
              totalCost: subCalc.totalCost,
            },
          });

          previousMeter = subsequent.currentMonthMeter;
        }

        // 4. Update customer's initialMeter to match the latest reading
        await tx.customer.update({
          where: { customerId: targetPayment.customerId },
          data: { initialMeter: previousMeter },
        });
      }

      const refreshedPayments = await tx.payment.findMany({
        where: { customerId: targetPayment.customerId, isPaid: false },
        orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }, { id: 'asc' }],
      });

      return { updatedTarget, refreshedPayments };
    });

    return res.status(200).json({
      status: 'success',
      message: 'Meter air berhasil diperbarui.',
      payment: serializePayment(result.updatedTarget),
      payments: result.refreshedPayments.map(serializePayment),
    });
  } catch (error: any) {
    console.error('Error updating water consumption:', error);
    return res.status(400).json({
      status: 'error',
      message: error.message || 'Gagal memperbarui meter air.',
    });
  }
}
