import { Router } from 'express';
import {
  calculateWaterConsumption,
  createWaterConsumption,
  getCustomerWaterConsumption,
  updateWaterConsumption,
} from './water-consumption.controller';

const router = Router();

router.get('/customer/:customerId', getCustomerWaterConsumption);
router.get('/calculate', calculateWaterConsumption);
router.post('/calculate', calculateWaterConsumption);
router.post('/', createWaterConsumption);
router.put('/:receiptId', updateWaterConsumption);

export default router;
