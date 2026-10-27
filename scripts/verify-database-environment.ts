import { checkDatabaseEnvironment } from "./safety/environment.check";

checkDatabaseEnvironment().then((lines) => {
  console.log("BUG-24 environment: passed");
  for (const line of lines) console.log(`  - ${line}`);
}).catch((error) => { console.error(error); process.exitCode = 1; });
