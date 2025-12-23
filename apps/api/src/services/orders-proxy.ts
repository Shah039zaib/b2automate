import { PrismaClient } from '@b2automate/database';
import { OrdersService } from '../modules/orders/orders.service';

// Helper to access OrdersService inside AIOrchestrator without circular deps if possible
// Ideally AIOrchestrator should inject OrdersService
export { OrdersService };
