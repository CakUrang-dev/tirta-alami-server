import { Router } from 'express';
import {
  createCustomer,
  deleteCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
} from './customer.controller';

const router = Router();

router.get('/', getAllCustomers);
router.get('/:customerId', getCustomerById);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

export default router;
