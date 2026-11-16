/** CRS-01A synthetic local production review. No configured institutional imports. */
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
    const target = await cluster.createDatabase("safe01_crs01a_browser"), database = postgresDatabase(target, () => cluster.dropDatabase(target)), session = reviewSession();
    await withHandle(database, async h => {
      await database.migrate(h); await populateSummerFixture(h.db);
      await h.exec("insert into courses(code,title,credits,course_type,semester,is_active) values('NEW-1000','Synthetic unused definition',3,'theory',4,true),('OLD-1000','Synthetic inactive definition',1,'sessional',2,false)");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('crs01a-admin',now()+interval '30 days',$1,'synthetic-auth-user')", [session.token]);
      await h.exec("insert into auth_user(id,name,email,email_verified) values('crs01a-viewer','Synthetic viewer','viewer@example.invalid',true);insert into portal_users(email,display_name,status) values('viewer@example.invalid','Synthetic viewer','active');insert into role_assignments(user_id,role,active_from) select id,'read_only_viewer','2020-01-01' from portal_users where email='viewer@example.invalid'");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('crs01a-viewer',now()+interval '30 days',$1,'crs01a-viewer')", [session.teacherToken]);
    });
    const snapshot = await database.runChild(path.join(REPO_ROOT, "scripts/safety/children/batch-review-snapshot.ts")); assert.equal(snapshot.status, 0, snapshot.stderr);
    const control = createServer(async (req, res) => {
      try {
        if (req.url === "/sign-in" || req.url === "/viewer") { res.writeHead(302, { "Set-Cookie": `better-auth.session_token=${req.url === "/viewer" ? session.teacherCookie : session.cookie}; Path=/; HttpOnly; SameSite=Lax`, Location: "http://localhost:3126/courses" }); res.end(); return; }
        if (req.method === "POST" && ["/mode/none", "/mode/one"].includes(req.url ?? "")) { await withHandle(database, async h => { await h.exec("update academic_terms set status='completed' where status='active';update term_context set generation=generation+1"); if (req.url === "/mode/one") await h.exec("update academic_terms set status='active' where name='Summer 2026'"); }); res.end("Synthetic mode changed; reload."); return; }
        res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>CRS-01A synthetic review</title><main style="max-width:720px;margin:3rem auto;padding:1rem;font:16px/1.6 system-ui"><h1>CRS-01A owner review</h1><p>Disposable synthetic PostgreSQL; separate Webpack production preview. Default Turbopack CSS-worker failure remains disclosed.</p><p><a href="/sign-in">Sign in as synthetic administrator</a> · <a href="/viewer">View-only account</a></p><p>Review Courses: add a definition, edit an unused course, correct a used title after impact acknowledgement, inspect history, deactivate/reactivate an unused definition, and inspect a used course’s lifecycle blockers.</p><form method="post" action="/mode/none" target="mode"><button>No active term</button></form><form method="post" action="/mode/one" target="mode"><button>Restore synthetic Summer</button></form><iframe title="Synthetic mode result" name="mode" style="height:4rem;border:0"></iframe></main></html>');
      } catch { res.writeHead(500); res.end("Synthetic fixture control failed."); }
    });
    const env = { ...postgresChildEnv(target), NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3126", BETTER_AUTH_SECRET: session.secret, GOOGLE_CLIENT_ID: "synthetic.example.test", GOOGLE_CLIENT_SECRET: "synthetic-only", NODE_OPTIONS: "" } as NodeJS.ProcessEnv;
    mkdirSync(".tmp/crs-01a", { recursive: true }); const log = openSync(".tmp/crs-01a/review-server.log", "w");
    await new Promise<void>(resolve => control.listen(3127, "127.0.0.1", resolve));
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3126", "--hostname", "127.0.0.1"], { env, stdio: ["ignore", log, log], windowsHide: true });
    try {
      let ready = false; const until = Date.now() + 60000;
      while (!ready && Date.now() < until) { try { ready = (await fetch("http://localhost:3126/api/health", { signal: AbortSignal.timeout(3000) })).ok; } catch {} if (!ready) await new Promise(resolve => setTimeout(resolve, 100)); }
      assert.ok(ready, "Owned CRS-01A production preview ready"); console.log("CRS-01A synthetic owner preview: http://localhost:3127 (application localhost:3126; Webpack)");
      if (process.argv.includes("--check")) { const child = spawn(process.execPath, [path.join(REPO_ROOT, "scripts/review-courses-browser.cjs")], { env, stdio: "inherit", windowsHide: true }); assert.equal(await new Promise<number | null>(resolve => child.once("exit", resolve)), 0); }
      if (process.argv.includes("--serve")) await new Promise<void>(resolve => server.once("exit", () => resolve()));
    } finally { server.kill(); await new Promise<void>(resolve => { if (server.exitCode != null) resolve(); else server.once("exit", () => resolve()); }); closeSync(log); control.close(); await database.dispose(); }
  });
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
