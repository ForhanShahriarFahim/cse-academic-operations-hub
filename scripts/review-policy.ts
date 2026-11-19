/** SET-01B policy history and reviewed changes: compiled browser review on a disposable PostgreSQL database. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium, type Page } from "playwright";
import { postgresChildEnv } from "./safety/app-env";
import { postgresDatabase, withHandle } from "./safety/database";
import { populateSummerFixture } from "./safety/fixture";
import { withDisposableCluster } from "./safety/pg-cluster";
import { reviewSession } from "./ux-review";

const appPort = 3170, controlPort = 3171;
const origin = `http://localhost:${appPort}`, controlOrigin = `http://localhost:${controlPort}`;
const captures = ".tmp/set-01b/browser";
const requireFromRepo = createRequire(import.meta.url);

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin", async cluster => {
    const target = await cluster.createDatabase("safe01_set01b_browser");
    const database = postgresDatabase(target, () => cluster.dropDatabase(target));
    const session = reviewSession();
    const { termId, group } = await withHandle(database, async handle => {
      await database.migrate(handle);
      await populateSummerFixture(handle.db);
      // Give the review one recorded class on each side of the proposal date.
      await handle.client.query(`insert into extra_load_classes(term_id,teacher_id,teaching_group_id,class_date,start_minutes,end_minutes,course_code_snapshot,course_title_snapshot,batch_label_snapshot)
        select term_id,teacher_id,teaching_group_id,'2026-07-09',start_minutes,end_minutes,course_code_snapshot,course_title_snapshot,batch_label_snapshot
        from extra_load_classes where class_date='2026-07-04'`);
      await handle.client.query("insert into auth_session(id,expires_at,token,user_id) values('set01b-review',now()+interval '1 day',$1,'synthetic-auth-user')", [session.token]);
      // A second administrator (synthetic) decides proposals; reuses the review session's second token.
      await handle.client.query(`with approver as (insert into portal_users(email, display_name, status) values ('approver@example.invalid', 'Synthetic Approver', 'active') returning id)
        insert into role_assignments(user_id, role, granted_by_user_id) select approver.id, 'academic_administrator', (select id from portal_users where email = 'admin@example.invalid') from approver`);
      await handle.client.query("insert into auth_user(id,name,email,email_verified,created_at,updated_at) values('set01b-approver','Synthetic Approver','approver@example.invalid',true,now(),now())");
      await handle.client.query("insert into auth_session(id,expires_at,token,user_id) values('set01b-approver',now()+interval '1 day',$1,'set01b-approver')", [session.teacherToken]);
      const termId = Number((await handle.client.query<{ id: number }>("select id from academic_terms where status = 'active'")).rows[0].id);
      const group = Number((await handle.client.query<{ teaching_group_id: number }>("select teaching_group_id from attendance_sessions order by id limit 1")).rows[0].teaching_group_id);
      return { termId, group };
    });
    const control = createServer((request, response) => {
      if (request.url === "/sign-in" || request.url === "/approver") {
        const approver = request.url === "/approver";
        response.writeHead(302, {
          "Set-Cookie": `better-auth.session_token=${approver ? session.teacherCookie : session.cookie}; Path=/; HttpOnly; SameSite=Lax`,
          Location: `${origin}/settings#policy`,
        }).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Policy review</title><h1>Synthetic policy review</h1>
          <p><a href="/sign-in">Open Settings as the proposing administrator</a></p><p><a href="/approver">Open Settings as the second administrator</a></p>
          <p>Use separate browser profiles (or a private window) for the two accounts.</p>`);
    });
    await new Promise<void>((resolve, reject) => { control.once("error", reject); control.listen(controlPort, "127.0.0.1", resolve); });
    const env: NodeJS.ProcessEnv = { ...postgresChildEnv(target), NODE_ENV: "production", BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: session.secret, GOOGLE_CLIENT_ID: "synthetic.example.test", GOOGLE_CLIENT_SECRET: "synthetic-only" };
    const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(appPort), "--hostname", "127.0.0.1"],
      { env, stdio: "inherit", windowsHide: true });
    const exited = new Promise(resolve => server.once("exit", resolve));
    try {
      const deadline = Date.now() + 30000;
      let ready = false;
      while (!ready && server.exitCode === null && Date.now() < deadline) {
        try { ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) })).ok; } catch {}
        if (!ready) await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert.ok(ready, "Synthetic preview did not start.");
      console.log(`SET-01B synthetic policy review: ${controlOrigin}/`);
      if (process.argv.includes("--check")) await check(termId, group);
      if (process.argv.includes("--serve")) await exited;
    } finally {
      if (server.exitCode === null) server.kill();
      await exited;
      control.close();
      await database.dispose();
    }
  });
}

async function audit(page: Page, prefix: string) {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as Window & { axe?: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } }).axe!;
      return (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(" ")).join(", ")}`);
    });
    assert.deepEqual(violations, [], `Accessibility at ${prefix} ${width}px`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${prefix} ${width}px`);
    await page.screenshot({ path: `${captures}/${prefix}-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function check(termId: number, group: number) {
  await mkdir(captures, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const admin = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await admin.goto(`${controlOrigin}/sign-in`);
    const panel = admin.getByRole("region", { name: "Academic, attendance & payment policy" });
    await panel.waitFor();
    await panel.getByText("Version 1", { exact: true }).first().waitFor();
    await audit(admin, "settings-baseline");

    // Propose with keyboard-reachable labelled fields; preview first, nothing saved.
    await admin.getByLabel(/^Payment per extra class/).fill("300");
    await admin.getByLabel(/^Extra-load threshold/).fill("2");
    await admin.getByLabel(/^Effective from/).fill("2026-07-05");
    await admin.getByLabel(/^Reason/).fill("Synthetic rate revision for review");
    await admin.getByRole("button", { name: "Preview impact" }).click();
    const preview = admin.getByRole("region", { name: "Impact preview" });
    await preview.waitFor();
    await preview.getByText("Extra-load eligibility").waitFor();
    await preview.getByRole("row", { name: "Total 1 ৳200.00 ৳300.00" }).waitFor();
    await audit(admin, "settings-preview");
    await admin.getByRole("button", { name: "Submit proposal" }).click();
    await admin.getByText(/^Proposal saved\./).first().waitFor();
    await admin.reload();
    const open = admin.getByRole("region", { name: /Proposed change — review impact/ });
    await open.waitFor();
    await open.getByText("You proposed this change", { exact: false }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Approve change" }).count(), 0, "the proposer has no approve control");
    await audit(admin, "settings-own-proposal");

    // Second administrator: acknowledgement gates approval; a rejection without a note is refused.
    const approver = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
    await approver.goto(`${controlOrigin}/approver`);
    const card = approver.getByRole("region", { name: /Proposed change — review impact/ });
    await card.waitFor();
    const approve = approver.getByRole("button", { name: "Approve change" });
    assert.equal(await approve.isDisabled(), true, "approval needs the acknowledgement");
    await approver.getByRole("button", { name: "Reject" }).click();
    await approver.getByText("Enter a note of 1–500 characters explaining the rejection.", { exact: false }).first().waitFor();
    await audit(approver, "settings-approver");
    const acknowledge = approver.getByRole("checkbox", { name: /I reviewed this impact/ });
    await acknowledge.focus(); await acknowledge.press("Space");
    await approve.click();
    await approver.getByText(/^Version 2 approved from 2026-07-05/).first().waitFor();
    await approver.reload();
    await approver.getByRole("region", { name: "Academic, attendance & payment policy" }).getByText("Version 2", { exact: true }).first().waitFor();
    await audit(approver, "settings-history");

    // Outputs: per-class rate and version, attendance version label, term history and top-sheet trace.
    await admin.goto(`${origin}/extra-load`);
    const recorded = admin.getByRole("region", { name: "Recorded extra classes" });
    await recorded.getByRole("row", { name: /2026-07-04.*৳200\.00.*Version 1/ }).waitFor();
    await recorded.getByRole("row", { name: /2026-07-09.*৳300\.00.*Version 2/ }).waitFor();
    await audit(admin, "extra-load");
    await admin.goto(`${origin}/attendance?group=${group}`);
    await admin.getByText("(Version 2, in force today)", { exact: true }).waitFor();
    await admin.goto(`${origin}/terms/${termId}`);
    await admin.getByRole("heading", { name: "Policy history" }).waitFor();
    await audit(admin, "term-history");
    await admin.goto(`${origin}/extra-load/top-sheet/print?from=2026-06-01&to=2026-09-30`);
    await admin.getByText(/^Payment policy: Version 1 \(Tk 200\.00, from 2026-06-01\) and Version 2 \(Tk 300\.00, from 2026-07-05\)/).waitFor();
    await admin.emulateMedia({ media: "print" });
    await admin.pdf({ path: `${captures}/top-sheet-letter.pdf`, preferCSSPageSize: true });
    await admin.pdf({ path: `${captures}/top-sheet-a4.pdf`, format: "A4" });
    await admin.screenshot({ path: `${captures}/top-sheet-print.png`, fullPage: true });
    console.log(`SET-01B compiled review passed; captures in ${captures}.`);
  } finally { await browser.close(); }
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
