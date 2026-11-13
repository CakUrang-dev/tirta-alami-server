import { Router } from 'express';
import { getSettings, updateSettings, migrateBatch } from './setting.controller';

const router = Router();

router.get('/', getSettings);
router.put('/', updateSettings);
router.post('/migrate-batch', migrateBatch);

export default router;
