import { Request, Response } from "express";
import bcrypt from 'bcryptjs';
import { getAdminCollection, getCustomerCollection } from "../../config/database";
import { Model, Document } from "mongoose"
import { ObjectId } from "mongodb";

const MAX_LOGIN_ATTEMPTS = 5;

// Controller to handle login for both customers and admins
export async function loginController(req: Request, res: Response) {
    try {
        const { id, pin } = req.body;

        if(!id || !pin) {
            return res.status(400).json({ message: 'ID and PIN are required' });
        }   

        const admins = getAdminCollection();
        const customers = getCustomerCollection();

        // First, check if the user is an admin
        const admin = await admins.findOne({ adminId: id });
        if(admin) {
            const adminIsLocked = await admins.findOne({adminId: id, isLocked: true}) || false;
            if(adminIsLocked) {
                return res.status(400).json({ message: "Account Locked" });
            }

            if(!admin.hashedPin) {
                return res.status(400).json({ status: 'pin_not_set', message: 'Admin PIN is not set' });
            }

            const isPinValid = await bcrypt.compare(pin, admin.hashedPin);

            if(isPinValid) {
                await admins.updateOne({ adminId: admin.adminId }, {$set : { failedPinAttempt: 0 }});
                
                return res.status(200).json({
                    status: "success",
                    user: {
                        role: 'admin',
                        adminId: admin.adminId,
                        name: admin.name
                    }
                });
            } else {
                const newAttempts = (admin.failedPinAttempts || 0) + 1;

                if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                    await admin.updateOne({ adminId : admin.adminId }, { $set: { failedPinAttempts: newAttempts, isLocked: true } });
                } else {
                    await admin.updateOne({ adminId: admin.adminId }, { $set: { failedPinAttempts: newAttempts } });
                }

                return res.status(401).json({ message: 'Invalid Admin ID or PIN.' });
            }
        }
        
        // Second, check id user is Customer
        const customer = await customers.findOne({ customerId: id });
        if(customer) {
            const customerIsLocked = await customers.findOne({customerId: id, isLocked: true}) || false;
            if(customerIsLocked) {
                return res.status(400).json({ message: "Account Locked" });
            }

            if(!customer.hashedPin) {
                return res.status(400).json({ status: 'pin_not_set', message: 'Customer PIN is not set' });
            }

            const isPinValid = await bcrypt.compare(pin, customer.hashedPin);
            if(isPinValid) {
                await customers.updateOne({ customerId: customer.customerId }, { $set : { failedPinAttempt: 0 }});
                
                return res.status(200).json({
                    status: "success",
                    user: {
                        role: 'customer',
                        adminId: customer.customerId,
                        name: customer.name
                    }
                });
            } else {
                const newAttempts = (customer.failedPinAttempts || 0) + 1;

                if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                    await customers.updateOne({ customerId : customer.customerId }, { $set: { failedPinAttempts: newAttempts, isLocked: true } });
                } else {
                    await customers.updateOne({ customerId: customer.customerId }, { $set: { failedPinAttempts: newAttempts } });
                }

                return res.status(401).json({ message: 'Invalid Customer ID or PIN.' });
            }
        }
    } catch (error){
        console.error("Login Error: ", error);
        return res.status(500).json({ message: 'Internal Server Error' });
        
    }
}

// Controller to handle setting a PIN for customers and admins
export async function setPinController(req: Request, res: Response) {
    try {
        const { id, newPin } = req.body;
        if(!id || !newPin || newPin.length < 4) {
            return res.status(400).json({ message: 'ID and a  valid new PIN are required' });
        }
        
        const admins = getAdminCollection();
        const customers = getCustomerCollection();

        let userDocument = null;
        let collectionToUpdate = null;
        let filter = {};

        // First, Find the user, check admins first
        userDocument = await admins.findOne({ adminId: id });
        if(userDocument) {
            collectionToUpdate = admins;
            filter = { adminId: id };
        } else {
            userDocument = await customers.findOne({ customerId: id });
            if(userDocument) {
                collectionToUpdate = customers;
                filter = { customerId: id };
            }
        }

        if (!userDocument || !collectionToUpdate) {
            return res.status(404).json({ message: "This ID not registered" });
        }

        if (userDocument.hashedPin) {
            return res.status(400).json({ message: "A PIN has already been set for this admin" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPin = await bcrypt.hash(newPin, salt);

        await collectionToUpdate.updateOne(
            filter,
            { $set: {
                hashedPin: hashedPin,
                failedPinAttempts: 0,
                isLocked: false,
            } }
        );

        return res.status(200).json({status: 'success', message: "PIN set successfully" })
    } catch(error) {
        console.error("Set PIN error:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
}