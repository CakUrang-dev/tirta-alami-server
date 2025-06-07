import { Router } from 'express';
import { loginController, setPinController } from './auth.controller';

const router = Router();

router.post('/login', loginController);
router.post('/set-pin', setPinController);

export default router;