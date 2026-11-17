/** CRS-01C synthetic local production review. No configured institutional imports. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./safety/targets";
import { withDisposableCluster } from "./safety/pg-cluster";
import { postgresDatabase, withHandle } from "./safety/database";
import { postgresChildEnv } from "./safety/app-env";
import { populateSummerFixture } from "./safety/fixture";
import { reviewSession } from "./ux-review";

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin", async cluster => {
    const target = await cluster.createDatabase("safe01_crs01c_browser"), database = postgresDatabase(target, () => cluster.dropDatabase(target)), session = reviewSession();
    let fallId = 0;
    await withHandle(database, async h => {
      await database.migrate(h); const fixture = await populateSummerFixture(h.db);
      // Synthetic catalog, a prepared draft term with three placed cohorts and offered courses, and one ungrouped offering in the active term.
      await h.exec(`insert into courses(code,title,credits,course_type,semester,needs_lab,is_active) values
        ('SYN-4103','Synthetic Elective',3,'theory',7,false,true),('SYN-4000','Synthetic Project and Thesis',3,'thesis',8,false,true);
        insert into batches(stream,label,sort_order) values('HSC','23A',4);
        insert into academic_terms(name,academic_year,start_date,end_date,status) values('Fall 2026',2026,'2026-10-15','2027-02-15','draft');
        insert into batch_term_placements(batch_id,term_id,semester) select b.id,t.id,case when b.label='23A' then 7 when b.stream='DIPLOMA' then 4 else 8 end from batches b, academic_terms t where t.name='Fall 2026' and (b.label in ('23A','22B'));
        insert into course_offerings(course_id,batch_id,term_id,status) select c.id,b.id,t.id,'planned' from courses c, batches b, academic_terms t where t.name='Fall 2026' and ((c.code='SYN-4101' and (b.label='23A' or (b.stream='DIPLOMA' and b.label='22B'))) or (c.code='SYN-4102' and b.label='23A') or (c.code='SYN-4000' and b.stream='HSC' and b.label='22B'));
        insert into course_offerings(course_id,batch_id,term_id,status) select c.id,b.id,${fixture.termId},'open' from courses c, batches b where c.code='SYN-4103' and b.stream='HSC' and b.label='22B';`);
      fallId = Number((await h.client.query<{ id: number }>("select id from academic_terms where name='Fall 2026'")).rows[0].id);
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('crs01c-admin',now()+interval '30 days',$1,'synthetic-auth-user')", [session.token]);
      await h.exec("insert into auth_user(id,name,email,email_verified) values('crs01c-viewer','Synthetic viewer','viewer@example.invalid',true);insert into portal_users(email,display_name,status) values('viewer@example.invalid','Synthetic viewer','active');insert into role_assignments(user_id,role,active_from) select id,'read_only_viewer','2020-01-01' from portal_users where email='viewer@example.invalid'");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('crs01c-viewer',now()+interval '30 days',$1,'crs01c-viewer')", [session.teacherToken]);
    });
    const snapshot = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/batch-review-snapshot.ts")); assert.equal(snapshot.status, 0, snapshot.stderr);
    const control = createServer((req, res) => {
      if (req.url === "/sign-in" || req.url === "/viewer") { res.writeHead(302, { "Set-Cookie": `better-auth.session_token=${req.url === "/viewer" ? session.teacherCookie : session.cookie}; Path=/; HttpOnly; SameSite=Lax`, Location: `http://localhost:3126/terms/${fallId}/groups` }); res.end(); return; }
      res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>CRS-01C synthetic review</title><main style="max-width:720px;margin:3rem auto;padding:1rem;font:16px/1.6 system-ui"><h1>CRS-01C owner review</h1><p>Disposable synthetic PostgreSQL; compiled production preview. Every term, cohort, course and teacher is invented.</p><p><a href="/sign-in">Sign in as synthetic administrator</a> · <a href="/viewer">View-only account</a></p><p>Review <strong>Class groups — Fall 2026</strong> (a prepared draft): create a merged class for two cohorts with two teachers, save a vacancy, change units, remove an unused class group and read the change history. Then open Summer 2026's class groups from Courses &amp; offerings to see class groups that are already scheduled.</p></main></html>`);
    });
    const env = { ...postgresChildEnv(target), NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3126", BETTER_AUTH_SECRET: session.secret, GOOGLE_CLIENT_ID: "synthetic.example.test", GOOGLE_CLIENT_SECRET: "synthetic-only", NODE_OPTIONS: "", CRS01C_FALL_ID: String(fallId) } as NodeJS.ProcessEnv;
    mkdirSync(".tmp/crs-01c", { recursive: true }); const log = openSync(".tmp/crs-01c/review-server.log", "w");
    await new Promise<void>(resolve => control.listen(3127, "127.0.0.1", resolve));
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3126", "--hostname", "127.0.0.1"], { env, stdio: ["ignore", log, log], windowsHide: true });
    try {
      let ready = false; const until = Date.now() + 60000;
      while (!ready && Date.now() < until) { try { ready = (await fetch("http://localhost:3126/api/health", { signal: AbortSignal.timeout(3000) })).ok; } catch {} if (!ready) await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.ok(ready, "Owned CRS-01C production preview ready"); console.log("CRS-01C synthetic owner preview: http://localhost:3127 (application localhost:3126)");
      if (process.argv.includes("--check")) { const child = spawn(process.execPath, [path.join(REPO_ROOT, "scripts/review-class-groups-browser.cjs")], { env, stdio: "inherit", windowsHide: true }); assert.equal(await new Promise<number | null>(resolve => child.once("exit", resolve)), 0, "CRS-01C browser checks"); }
      if (process.argv.includes("--serve")) await new Promise<void>(resolve => server.once("exit", () => resolve()));
    } finally { server.kill(); await new Promise<void>(resolve => { if (server.exitCode != null) resolve(); else server.once("exit", () => resolve()); }); closeSync(log); control.close(); await database.dispose(); }
  });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
