import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';

const directUrl = process.env.DIRECT_URL;
if (!directUrl) {
  throw new Error('DIRECT_URL is required to seed the database.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) });

try {
  await prisma.runtimeControl.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      registrationOpen: false,
      uploadsEnabled: false,
      publicLinksEnabled: false,
      maintenanceMode: false,
    },
  });
} finally {
  await prisma.$disconnect();
}
