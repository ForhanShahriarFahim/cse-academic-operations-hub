/** BAT-01B guarded disposable review. No configured institutional database imports. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { REPO_ROOT } from "./safety/targets";
import { openSync,closeSync,mkdirSync } from "node:fs";
import { withDisposableCluster } from "./safety/pg-cluster";
import { postgresDatabase,withHandle } from "./safety/database";
import { postgresChildEnv } from "./safety/app-env";
import { populateSummerFixture } from "./safety/fixture";
import { reviewSession } from "./ux-review";

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin",async cluster => {
    const target = await cluster.createDatabase("safe01_bat01b_browser"), database = postgresDatabase(target,() => cluster.dropDatabase(target)), session = reviewSession();
    let destinationId = 0, sourceId = 0;
    await withHandle(database,async h => {
      await database.migrate(h);const source = await populateSummerFixture(h.db); sourceId = source.termId;
      await h.exec("update batch_term_placements set student_count=30,count_source='Synthetic source estimate' where student_count is null;insert into academic_terms(name,academic_year,start_date,end_date,status,managed_setup) values('Spring 2027',2027,'2027-01-02','2027-04-30','draft',true)");
      destinationId = Number((await h.client.query<{id:number}>("select id from academic_terms where name='Spring 2027'")).rows[0].id);
      await h.client.query("insert into academic_policies(term_id) values($1)",[destinationId]);
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('bat01b-admin',now()+interval '30 days',$1,'synthetic-auth-user')",[session.token]);
      await h.exec("insert into auth_user(id,name,email,email_verified) values('bat01b-viewer','Synthetic viewer','viewer@example.invalid',true);insert into portal_users(email,display_name,status) values('viewer@example.invalid','Synthetic viewer','active');insert into role_assignments(user_id,role,department_id,active_from) select u.id,'read_only_viewer',d.id,'2020-01-01' from portal_users u cross join departments d where u.email='viewer@example.invalid' and d.code='CSE'");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('bat01b-viewer',now()+interval '30 days',$1,'bat01b-viewer')",[session.teacherToken]);
    });
    // A valid synthetic frozen archive is built through the actual projection loader.
    // This review fixture is not an application publication or a source sign-off.
    const snapshot = await database.runChild(path.join(REPO_ROOT,"scripts/safety/children/batch-review-snapshot.ts"));
    assert.equal(snapshot.status,0,snapshot.stderr);
    await withHandle(database,async h => {await h.exec("update academic_terms set status='completed' where status='active'");});
    const route = `/terms/${destinationId}/rollover?source=${sourceId}`;
    const control = createServer((req,res) => {
      if (req.url === "/sign-in" || req.url === "/viewer") {res.writeHead(302,{"Set-Cookie":`better-auth.session_token=${req.url === "/viewer" ? session.teacherCookie : session.cookie}; Path=/; HttpOnly; SameSite=Lax`,Location:`http://localhost:3120${route}`});res.end();return;}
      res.setHeader("Content-Type","text/html");res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>BAT-01B synthetic review</title><main style="max-width:720px;margin:3rem auto;padding:1rem;font:16px/1.6 system-ui"><h1>BAT-01B synthetic review</h1><p>Disposable PostgreSQL data only. Preparing the draft and activation are separate actions.</p><p><a href="/sign-in">Sign in as synthetic administrator</a> · <a href="/viewer">View-only account</a></p><p>Review Summer 2026 → Spring 2027: progress one cohort, repeat another, give the semester-8 cohort a Hold or explicitly confirmed Graduate decision. Copy counts as unverified estimates; optionally clone the empty destination grid. Inspect the review, enter the exact destination identity and acknowledge. Inspect the saved receipt and retained source history, then review activation separately.</p><p>Default/alternate build results are recorded separately in docs/specs/BAT-01B/verification.md. A receipt cannot be overwritten; restarting this owned runner gives a fresh fixture.</p></main></html>');
    });
    const env = {...postgresChildEnv(target),NODE_ENV:"production",BETTER_AUTH_URL:"http://localhost:3120",BETTER_AUTH_SECRET:session.secret,GOOGLE_CLIENT_ID:"synthetic.example.test",GOOGLE_CLIENT_SECRET:"synthetic-only"} as NodeJS.ProcessEnv;
    mkdirSync(".tmp/bat-01b",{recursive:true});const log = openSync(".tmp/bat-01b/review-server.log","w");
    await new Promise<void>(r => control.listen(3121,"127.0.0.1",r));
    const server = spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3120","--hostname","127.0.0.1"],{env,stdio:["ignore",log,log],windowsHide:true});
    try {
      let ready = false;const end = Date.now()+60000;
      while (!ready && Date.now()<end) {try {ready = (await fetch("http://localhost:3120/api/health",{signal:AbortSignal.timeout(3000)})).ok;} catch {} if (!ready) await new Promise(r => setTimeout(r,100));}
      assert.ok(ready,"Owned BAT-01B production preview ready");
      console.log(`BAT-01B synthetic review: http://localhost:3121 (application localhost:3120; destination #${destinationId}, source #${sourceId})`);
      if (process.argv.includes("--check")) {
        const child = spawn(process.execPath,[path.join(REPO_ROOT,"scripts/review-rollover-browser.cjs")],{env,stdio:"inherit",windowsHide:true});assert.equal(await new Promise<number|null>(r => child.once("exit",r)),0,"BAT-01B browser review");
      }
      if (process.argv.includes("--serve")) await new Promise<void>(r => server.once("exit",() => r()));
    } finally {server.kill();await new Promise<void>(r => {if (server.exitCode != null) r();else server.once("exit",() => r());});closeSync(log);control.close();await database.dispose();}
  });
}
main().then(() => process.exit(0)).catch(error => {console.error(error);process.exit(1);});
