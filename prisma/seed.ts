import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Database schema is ready.');
  console.log('Florida counties and license types are defined in src/lib/constants.ts');
  console.log('Use the UI to start scraping DBPR data.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
