import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/database';

const MAX_LOGIN_ATTEMPTS = 5;

/**
 * POST /auth/login (or /api/auth/login)
 * Controller to handle login for both admins and customers
 */
export async function loginController(req: Request, res: Response) {
  try {
    const { id, pin } = req.body;

    if (!id || !pin) {
      return res.status(400).json({ message: 'ID and PIN are required' });
    }

    const trimmedId = String(id).trim();
    const trimmedPin = String(pin).trim();

    // 1. Check if the user is an Admin
    const admin = await prisma.admin.findUnique({
      where: { adminId: trimmedId },
    });

    if (admin) {
      if (admin.isLocked) {
        return res.status(403).json({ message: 'Account Locked' });
      }

      if (!admin.hashedPin) {
        return res.status(400).json({
          status: 'pin_not_set',
          message: 'Admin PIN is not set',
        });
      }

      const isPinValid = await bcrypt.compare(trimmedPin, admin.hashedPin);

      if (isPinValid) {
        await prisma.admin.update({
          where: { adminId: admin.adminId },
          data: { failedPinAttempts: 0 },
        });

        return res.status(200).json({
          status: 'success',
          user: {
            role: 'admin',
            adminId: admin.adminId,
            username: admin.username || admin.adminId,
            name: admin.name,
          },
        });
      } else {
        const newAttempts = admin.failedPinAttempts + 1;
        const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

        await prisma.admin.update({
          where: { adminId: admin.adminId },
          data: {
            failedPinAttempts: newAttempts,
            ...(shouldLock ? { isLocked: true } : {}),
          },
        });

        return res.status(401).json({
          message: shouldLock
            ? 'Account Locked due to too many failed attempts.'
            : 'Invalid Admin ID or PIN.',
        });
      }
    }

    // 2. Check if the user is a Customer
    const customer = await prisma.customer.findUnique({
      where: { customerId: trimmedId },
    });

    if (customer) {
      if (customer.isLocked) {
        return res.status(403).json({ message: 'Account Locked' });
      }

      if (!customer.hashedPin) {
        return res.status(400).json({
          status: 'pin_not_set',
          message: 'Customer PIN is not set',
        });
      }

      const isPinValid = await bcrypt.compare(trimmedPin, customer.hashedPin);

      if (isPinValid) {
        await prisma.customer.update({
          where: { customerId: customer.customerId },
          data: { failedPinAttempts: 0 },
        });

        return res.status(200).json({
          status: 'success',
          user: {
            role: 'customer',
            customerId: customer.customerId,
            name: customer.name,
            address: customer.address,
            village: customer.village,
            customerClass: customer.customerClass,
            phoneNumber: customer.phoneNumber || '-',
            initialMeter: customer.initialMeter,
          },
        });
      } else {
        const newAttempts = customer.failedPinAttempts + 1;
        const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

        await prisma.customer.update({
          where: { customerId: customer.customerId },
          data: {
            failedPinAttempts: newAttempts,
            ...(shouldLock ? { isLocked: true } : {}),
          },
        });

        return res.status(401).json({
          message: shouldLock
            ? 'Account Locked due to too many failed attempts.'
            : 'Invalid Customer ID or PIN.',
        });
      }
    }

    // 3. Neither Admin nor Customer found
    return res.status(404).json({
      message: `ID ${trimmedId} tidak terdaftar.`,
    });
  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

/**
 * POST /auth/set-pin (or /api/auth/set-pin)
 * Controller to handle setting a PIN for customers and admins
 */
export async function setPinController(req: Request, res: Response) {
  try {
    const { id, newPin } = req.body;
    const trimmedId = String(id || '').trim();
    const trimmedPin = String(newPin || '').trim();

    if (!trimmedId || trimmedPin.length < 4) {
      return res.status(400).json({
        message: 'ID and a valid new PIN (min 4 digits) are required',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPin = await bcrypt.hash(trimmedPin, salt);

    // Check Admins first
    const admin = await prisma.admin.findUnique({
      where: { adminId: trimmedId },
    });

    if (admin) {
      if (admin.hashedPin) {
        return res.status(400).json({
          message: 'A PIN has already been set for this admin account',
        });
      }

      await prisma.admin.update({
        where: { adminId: trimmedId },
        data: {
          hashedPin,
          failedPinAttempts: 0,
          isLocked: false,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: 'PIN set successfully',
      });
    }

    // Check Customers next
    const customer = await prisma.customer.findUnique({
      where: { customerId: trimmedId },
    });

    if (customer) {
      if (customer.hashedPin) {
        return res.status(400).json({
          message: 'A PIN has already been set for this customer account',
        });
      }

      await prisma.customer.update({
        where: { customerId: trimmedId },
        data: {
          hashedPin,
          failedPinAttempts: 0,
          isLocked: false,
        },
      });

      return res.status(200).json({
        status: 'success',
        message: 'PIN set successfully',
      });
    }

    return res.status(404).json({
      message: 'This ID is not registered',
    });
  } catch (error) {
    console.error('Set PIN error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
