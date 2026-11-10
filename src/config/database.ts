import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

const DEFAULT_SETTINGS = [
  {
    key: 'meter_rent_price',
    value: '21000',
    description: 'Biaya sewa meter bulanan (Rp)',
  },
  {
    key: 'tier1_rate',
    value: '2000',
    description: 'Tarif air Tier 1 (1-10 m³) per m³ (Rp)',
  },
  {
    key: 'tier2_rate',
    value: '3000',
    description: 'Tarif air Tier 2 (>10 m³) per m³ (Rp)',
  },
  {
    key: 'company_name',
    value: 'HIPPAM "TIRTA ALAMI"',
    description: 'Nama perusahaan pada struk pembayaran',
  },
  {
    key: 'company_header',
    value: 'KEL. CEMOROKANDANG KEC. KEDUNGKANDANG',
    description: 'Sub-judul alamat pada struk pembayaran',
  },
];

export async function connectDB() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to PostgreSQL via Prisma!');

    // Seed default settings if they do not exist yet
    for (const item of DEFAULT_SETTINGS) {
      await prisma.setting.upsert({
        where: { key: item.key },
        update: {},
        create: item,
      });
    }
  } catch (error) {
    console.error('Error connecting to PostgreSQL database:', error);
    process.exit(1);
  }
}
