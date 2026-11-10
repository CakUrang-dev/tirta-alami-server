import { Router } from 'express';
import { getDailyReport, getMonthlyReport } from './report.controller';

const router = Router();

router.get('/daily', getDailyReport);
router.get('/monthly', getMonthlyReport);

export default router;
