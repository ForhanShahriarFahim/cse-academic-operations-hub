import { databaseCommand, isCommand } from "./command";

export async function prepareDatabase() {
  const { academicTerms } = await import("./schema");
  const { db, databaseMode } = await import("./index");
  const { migrateDatabase } = await import("./migrate");
  const { seedDatabase } = await import("./seed");
  await migrateDatabase();
  const existingTerms = await db.select({ id: academicTerms.id }).from(academicTerms).limit(1);

  if (existingTerms.length === 0) {
    console.log(`No academic terms found; loading the verified development dataset (${databaseMode}).`);
    await seedDatabase();
  } else {
    console.log(`Database ready (${databaseMode}); existing academic data preserved.`);
  }
}

if (isCommand("/src/db/prepare.ts")) {
  Promise.resolve().then(async () => {
    if (!databaseCommand("db:prepare", process.argv.slice(2)).preview) await prepareDatabase();
  })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
