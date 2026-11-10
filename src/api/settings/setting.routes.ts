import { Router } from 'express';
import { getSettings, updateSettings } from './setting.controller';

const router = Router();

router.get('/', getSettings);
router.put('/', updateSettings);

export default router;
