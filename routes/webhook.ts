import { Router } from 'express';
import WebhookController from '../controllers/webhookController';

const webhookRouter = Router();

// webhook verification endpoint (GET)
webhookRouter.get('/webhook', WebhookController.verifyWebhook);

// webhook set persistent menu (POST)
webhookRouter.get('/profile/persistent-menu', WebhookController.setPersistentMenu);

// webhook event handler endpoint (POST)
webhookRouter.post('/webhook', WebhookController.handleWebhookEvent);

export default webhookRouter;