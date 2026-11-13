import 'dotenv/config';
import os from 'os';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/database';
import authRoutes from './api/auth/auth.routes';
import customerRoutes from './api/customers/customer.routes';
import waterConsumptionRoutes from './api/water-consumption/water-consumption.routes';
import paymentRoutes from './api/payments/payment.routes';
import reportRoutes from './api/reports/report.routes';
import settingRoutes from './api/settings/setting.routes';

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';

// -- Middleware --
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// -- API Routes --
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/water-consumption', waterConsumptionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingRoutes);

// -- Health Check Route --
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Welcome to Tirta Alami PostgreSQL API',
  });
});

function getLocalNetworkIPs(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// -- Start the server --
async function bootstrap() {
  await connectDB();
  app.listen(PORT, HOST, () => {
    console.log(`Server listening locally on: http://localhost:${PORT}`);
    const lanIps = getLocalNetworkIPs();
    for (const ip of lanIps) {
      console.log(`Server accessible on LAN/Wi-Fi: http://${ip}:${PORT}`);
    }
  });
}

bootstrap();
