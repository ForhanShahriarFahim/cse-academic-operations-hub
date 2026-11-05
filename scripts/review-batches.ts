/** BAT-01A owned synthetic owner preview. Never uses configured institutional storage. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { openSync,closeSync,mkdirSync,writeFileSync } from "node:fs";
import { withDisposableCluster } from "./safety/pg-cluster";
import { postgresDatabase,withHandle } from "./safety/database";
import { postgresChildEnv } from "./safety/app-env";
import { populateSummerFixture,populateSpringFixture } from "./safety/fixture";
import { reviewSession } from "./ux-review";
import path from "node:path";
import { REPO_ROOT } from "./safety/targets";

async function main(){
  const bin=process.env.SAFE01_PG_BIN||"F:/AI/tools/pgsql-17.11/pgsql/bin";
  await withDisposableCluster(bin,async cluster=>{
    const target=await cluster.createDatabase("safe01_bat01a_browser"),database=postgresDatabase(target,()=>cluster.dropDatabase(target)),session=reviewSession();
    await withHandle(database,async h=>{
      await database.migrate(h);const summer=await populateSummerFixture(h.db);await populateSpringFixture(h.db,summer);
      await h.exec("update academic_terms set status='completed';update academic_terms set status='active' where name='Summer 2026';insert into batches(stream,label,intake,is_draft) values('HSC','REVIEW-NEW','Synthetic unused intake',true)");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('bat01a-admin',now()+interval '30 days',$1,'synthetic-auth-user')",[session.token]);
      await h.exec("insert into auth_user(id,name,email,email_verified) values('bat01a-viewer','Synthetic viewer','viewer@example.invalid',true);insert into portal_users(email,display_name,status) values('viewer@example.invalid','Synthetic viewer','active');insert into role_assignments(user_id,role,department_id,active_from) select u.id,'read_only_viewer',d.id,'2020-01-01' from portal_users u cross join departments d where u.email='viewer@example.invalid' and d.code='CSE'");
      await h.client.query("insert into auth_session(id,expires_at,token,user_id) values('bat01a-viewer',now()+interval '30 days',$1,'bat01a-viewer')",[session.teacherToken]);
    });
    const env={...postgresChildEnv(target),NODE_ENV:"production",BETTER_AUTH_URL:"http://localhost:3116",BETTER_AUTH_SECRET:session.secret,GOOGLE_CLIENT_ID:"synthetic.example.test",GOOGLE_CLIENT_SECRET:"synthetic-only"} as NodeJS.ProcessEnv;
    // Build a synthetic frozen publication through the actual loader. Request-only
    // dependencies are controlled in the pinned child; no publication gate is bypassed in the app.
    const snapshot=await database.runChild(path.join(REPO_ROOT,"scripts/safety/children/batch-review-snapshot.ts"));
    assert.equal(snapshot.status,0,snapshot.stderr);
    const control=createServer(async(req,res)=>{
      try{
        if(req.url==="/sign-in"||req.url==="/viewer"){res.writeHead(302,{"Set-Cookie":`better-auth.session_token=${req.url==="/viewer"?session.teacherCookie:session.cookie}; Path=/; HttpOnly; SameSite=Lax`,Location:"http://localhost:3116/batches"});return res.end();}
        if(req.method==="POST"&&["/mode/one","/mode/none"].includes(req.url??"")){
          await withHandle(database,async h=>{await h.exec("update academic_terms set status='completed' where status='active';update term_context set generation=generation+1");if(req.url==="/mode/one")await h.exec("update academic_terms set status='active' where name='Summer 2026'");});return res.end("Synthetic fixture mode changed; reload the portal.");
        }
        res.setHeader("Content-Type","text/html");res.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>BAT-01A synthetic review</title><main style="max-width:720px;margin:3rem auto;padding:1rem;font:16px/1.6 system-ui"><h1>BAT-01A owner review</h1><p>Disposable synthetic PostgreSQL. Separately labelled Webpack production preview; the default Turbopack build failed.</p><p><a href="/sign-in">Sign in as synthetic administrator</a> · <a href="/viewer">View-only account</a> · <a href="http://localhost:3116/public/routine">Public routine</a></p><p>Review: add batch → place in active term → save estimate → confirm count → inspect history. Review a used cohort’s blocked graduation and a new unused cohort’s lifecycle/deletion.</p><p>Fixture controls below are for testing, not portal features:</p><form method="post" action="/mode/none" target="mode"><button>No active term</button></form><form method="post" action="/mode/one" target="mode"><button>Restore synthetic Summer</button></form><iframe title="Fixture control result" name="mode" style="height:4rem;border:0"></iframe></main></html>');
      }catch{res.writeHead(500);res.end("Synthetic control failed");}
    });
    await new Promise<void>(r=>control.listen(3117,"127.0.0.1",r));
    mkdirSync(".tmp/bat-01a",{recursive:true});const log=openSync(".tmp/bat-01a/review-server.log","w");
    const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3116","--hostname","127.0.0.1"],{env,stdio:["ignore",log,log],windowsHide:true});
    try{
      let ready=false;const until=Date.now()+60000;
      while(!ready&&Date.now()<until){try{ready=(await fetch("http://localhost:3116/api/health",{signal:AbortSignal.timeout(3000)})).ok;}catch{}if(!ready)await new Promise(r=>setTimeout(r,100));}assert.ok(ready,"Owned production preview ready");
      console.log("BAT-01A synthetic owner preview: http://localhost:3117 (application localhost:3116; Webpack review build)");
      if(process.argv.includes("--check")){
        const check=spawn(process.execPath,[".tmp/bat-01a/runtime-review.cjs"],{env,stdio:"inherit",windowsHide:true});assert.equal(await new Promise<number|null>(r=>check.once("exit",r)),0,"BAT-01A browser review");writeFileSync(".tmp/bat-01a/browser-complete.txt","BAT-01A production browser checks passed.\n");
      }
      if(process.argv.includes("--serve"))await new Promise<void>(r=>server.once("exit",()=>r()));
    }finally{server.kill();await new Promise<void>(r=>{if(server.exitCode!=null)r();else server.once("exit",()=>r());});closeSync(log);control.close();await database.dispose();}
  });
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});
