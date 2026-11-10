import { Router } from 'express';
import {
  calculateSelectedPaymentsTotal,
  getCustomerUnpaidPayments,
  previewPaymentReceipt,
  processPayments,
} from './payment.controller';

const router = Router();

router.get('/customer/:customerId', getCustomerUnpaidPayments);
router.post('/calculate-total', calculateSelectedPaymentsTotal);
router.post('/preview-receipt', previewPaymentReceipt);
router.post('/process', processPayments);

export default router;
