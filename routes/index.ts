import { Router } from 'express';
import webhookRouter from './webhook';

const router = Router();

// mount webhook routes
router.use('/', webhookRouter);

export default router;