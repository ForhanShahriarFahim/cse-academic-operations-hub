import "dotenv/config";
import { academicTerms } from "./schema";
import { db, databaseMode } from "./index";
import { migrateDatabase } from "./migrate";
import { seedDatabase } from "./seed";

async function prepareDatabase() {
  await migrateDatabase();
  const existingTerms = await db.select({ id: academicTerms.id }).from(academicTerms).limit(1);

  if (existingTerms.length === 0) {
    console.log(`No academic terms found; loading the verified development dataset (${databaseMode}).`);
    await seedDatabase();
  } else {
    console.log(`Database ready (${databaseMode}); existing academic data preserved.`);
  }
}

prepareDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
