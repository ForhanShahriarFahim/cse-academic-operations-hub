/** Synthetic frozen-output fixture; never callable from an app route. */
import { loadApp,signInAs } from "./controlled-runtime";
import { buildSnapshot } from "../../../src/lib/serialize";
const {db}=loadApp<typeof import("../../../src/db")>("src/db/index.ts");
const {scheduleVersions}=loadApp<typeof import("../../../src/db/schema")>("src/db/schema.ts");
const {getPortalData}=loadApp<typeof import("../../../src/lib/data")>("src/lib/data.ts");
async function main(){signInAs("admin@example.invalid");const d=await getPortalData();await db.update(scheduleVersions).set({snapshot:buildSnapshot({meetings:d.meetings,term:d.term,versionNumber:1,batches:d.batches,breaks:d.breaks,externals:d.externals,issues:[],metadata:d.publicationMetadata,timeGrid:d.timeGrid,generatedAt:"2026-11-05T00:00:00Z"})});}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
