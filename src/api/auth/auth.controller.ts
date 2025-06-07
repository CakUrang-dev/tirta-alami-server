import { Request, Response } from "express";
import bcrypt from 'bcryptjs';
import { getAdminCollection, getCustomersCollection } from "../../config/database";

// Controller to handle login for both customers and admins

export async function loginController(req: Request, res: Response) {
  try {
        const {phonenumber, pin} = req.body;

        if (!phonenumber || !pin) {
            return res.status(400).json({ message: 'Phone number and PIN are required' });
        }

        const admins = getAdminCollection();
        const customers = getCustomersCollection();

        // First, check if the user is a admin
        const admin = await admins.findOne({ phonenumber });
        if (admin) {
            if(!admin.hashedPin) {
                return res.status(400).json({ message: 'Admin PIN is not set' });
            }

            const isPinValid = await bcrypt.compare(pin, admin.hashedPin);
            if(isPinValid) {
                return res.status(200).json({ message: 'success', user: {
                    role: 'admin',
                    name: admin.name,
                    username: admin.username,
                    phonenumber: admin.phonenumber
                } });
            }

            return res.status(401).json({ message: 'Invalid PIN' });
        }

        const customer = await customers.findOne({ phonenumber });
        if(customer) {
            if(!customer.hashedPin) {
                return res.status(400).json({ message: 'PIN has not been set for the customer' });
            }

            const isPinValid = await bcrypt.compare(pin, customer.hashedPin);
            if(isPinValid) {
                return res.status(200).json({ message: 'success', user: {
                    role: 'customer',
                    customerId: customer.customerId,
                    name: customer.name,
                    address: customer.address,
                    phonenumber: customer.phonenumber
                } });
            }

            return res.status(401).json({ message: 'Invalid PIN' });
        }

        return res.status(404).json({ message: 'This phone number is not registered' });
    } catch(error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Internal server error' });
    }
}

// Controller to handle setting a PIN for customers and admins
export async function setPinController(req: Request, res: Response) {
    try {
        const { phonenumber, pin } = req.body;
        if (!phonenumber || !pin) {
            return res.status(400).json({ message: 'Phone number and PIN are required' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPin = await bcrypt.hash(pin, salt);

        const admins = getAdminCollection();
        const customers = getCustomersCollection();

        let result = await admins.updateOne(
            { phonenumber },
            { $set: { hashedPin } },
        );

        if(result.matchedCount === 0) {
            result = await customers.updateOne(
                { phonenumber },
                { $set: { hashedPin } },
            );
        }

        if(result.matchedCount === 0) {
            return res.status(404).json({ message: 'This phone number is not registered' });
        }

        res.status(200).json({ status:"success", message: 'PIN set successfully' });
    } 
    catch(error) {
        console.error("Set PIN error:", error);
        res.status(500).json({ message: 'Internal server error' });
    }
}