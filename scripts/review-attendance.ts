/** ATT-02 browser review on a disposable PostgreSQL database. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { postgresChildEnv } from "./safety/app-env";
import { postgresDatabase, withHandle } from "./safety/database";
import { populateSummerFixture } from "./safety/fixture";
import { withDisposableCluster } from "./safety/pg-cluster";
import { reviewSession } from "./ux-review";

const appPort = 3130;
const controlPort = 3131;
const origin = `http://localhost:${appPort}`;
const controlOrigin = `http://localhost:${controlPort}`;
const captures = ".tmp/att-02/browser";
const requireFromRepo = createRequire(import.meta.url);

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin", async cluster => {
    const target = await cluster.createDatabase("safe01_att02_browser");
    const database = postgresDatabase(target, () => cluster.dropDatabase(target));
    const session = reviewSession();
    const group = await withHandle(database, async handle => {
      await database.migrate(handle);
      await populateSummerFixture(handle.db);
      await handle.client.query("insert into auth_session(id,expires_at,token,user_id) values('att02-review',now()+interval '1 day',$1,'synthetic-auth-user')", [session.token]);
      return Number((await handle.client.query<{ teaching_group_id: number }>(
        "select teaching_group_id from attendance_sessions order by id limit 1",
      )).rows[0].teaching_group_id);
    });
    const control = createServer((request, response) => {
      if (request.url === "/sign-in") {
        response.writeHead(302, {
          "Set-Cookie": `better-auth.session_token=${session.cookie}; Path=/; HttpOnly; SameSite=Lax`,
          Location: `${origin}/attendance?group=${group}`,
        }).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Attendance review</title><h1>ATT-02 synthetic review</h1><a href="/sign-in">Sign in and open Attendance</a>');
    });
    await new Promise<void>((resolve, reject) => {
      control.once("error", reject);
      control.listen(controlPort, "127.0.0.1", resolve);
    });
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
      console.log(`ATT-02 synthetic review: ${controlOrigin}/sign-in`);
      if (process.argv.includes("--check")) await checkBrowser();
      if (process.argv.includes("--serve")) await exited;
    } finally {
      if (server.exitCode === null) server.kill();
      await exited;
      control.close();
      await database.dispose();
    }
  });
}

async function checkBrowser() {
  await mkdir(captures, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${controlOrigin}/sign-in`);
    const picker = page.getByLabel("Roster CSV file");
    const button = page.getByRole("button", { name: "Import roster CSV", exact: true });
    const feedback = page.locator('[data-feedback="import"]');
    await picker.waitFor();
    await picker.focus();
    assert.equal(await picker.evaluate(el => document.activeElement === el), true);
    async function chooseFile(text: string, name = "synthetic.csv") {
      await picker.setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
    }
    async function submitFile() {
      await page.waitForFunction(() => Array.from(document.querySelectorAll("button"))
        .some(item => item.textContent === "Import roster CSV" && !item.disabled));
      await button.focus();
      await button.press("Enter");
    }
    async function upload(text: string) {
      await chooseFile(text);
      await submitFile();
    }
    await upload("Bad Header,Name\n001,Test");
    await feedback.getByText(/must include valid/).waitFor();
    await page.waitForFunction(() => document.activeElement?.matches("input[type=file]"));
    const header = "Student ID,Student Name\n";
    const row = "ATT-02-REVIEW,Synthetic Browser Student";
    await page.evaluate(() => {
      const read = File.prototype.text;
      File.prototype.text = async function (this: File) {
        if (this.name === "unreadable.csv") throw new Error("Synthetic file read failure");
        if (this.name !== "slow.csv") return read.call(this);
        await new Promise<void>(resolve => window.addEventListener("release-slow-csv", () => resolve(), { once: true }));
        const text = await read.call(this);
        window.dispatchEvent(new Event("slow-csv-read"));
        return text;
      };
    });
    await chooseFile(header + row, "unreadable.csv");
    await feedback.getByText(/file could not be read/).waitFor();
    assert.equal(await button.isDisabled(), true);
    await chooseFile(header + "ATT-02-OLD,Outdated File", "slow.csv");
    await feedback.getByText("Reading CSV…").waitFor();
    assert.equal(await button.isDisabled(), true);
    await chooseFile(header + row + "\n\nINVALID,\n" + row);
    await feedback.getByText("Reading CSV…").waitFor({ state: "hidden" });
    await page.evaluate(() => new Promise<void>(resolve => {
      window.addEventListener("slow-csv-read", () => requestAnimationFrame(() => resolve()), { once: true });
      window.dispatchEvent(new Event("release-slow-csv"));
    }));
    await submitFile();
    await feedback.getByText("1 created · 0 updated · 0 unchanged · 1 skipped · 1 failed").waitFor();
    await feedback.getByText(/Line 4 · Failed/).waitFor();
    await feedback.getByText(/Line 5 · Skipped/).waitFor();
    await page.waitForFunction(() => document.activeElement?.matches('[data-feedback="import"] [role="status"]'));
    await page.getByRole("region", { name: "Student roster and semester summary" }).getByText("Synthetic Browser Student").waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (window as Window & { axe?: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string }> }> } }).axe!;
        return (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map(item => item.id);
      });
      assert.deepEqual(violations, [], `Accessibility at ${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
      await feedback.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${captures}/partial-${width}.png` });
    }
    await upload(header + row);
    await feedback.getByText("0 created · 0 updated · 1 unchanged · 0 skipped · 0 failed").waitFor();
    assert.equal(await picker.inputValue(), "");
    const marks = page.getByRole("region", { name: "Attendance marks for this session" });
    const firstMark = marks.getByRole("combobox").first();
    const nextStatus = await firstMark.inputValue() === "late" ? "present" : "late";
    await firstMark.selectOption(nextStatus);
    const save = page.getByRole("button", { name: "Save", exact: true });
    const saveFeedback = page.locator('[data-feedback="marks"]');
    const attendanceRequest = (url: URL) => url.pathname === "/attendance";
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.route(attendanceRequest, async route => {
      if (route.request().method() !== "POST") return route.fallback();
      await hold;
      await route.abort();
    });
    try {
      await save.click();
      await saveFeedback.getByText("Saving attendance…").waitFor();
      assert.equal(await save.isDisabled(), true);
    } finally { release(); }
    await saveFeedback.getByText(/result could not be confirmed/).waitFor();
    assert.equal(await firstMark.inputValue(), nextStatus, "Failed save preserves the draft");
    await page.unroute(attendanceRequest);
    await save.click();
    await saveFeedback.getByText(/Attendance saved/).waitFor();
    await page.waitForLoadState("networkidle");
    await page.reload();
    assert.equal(await firstMark.inputValue(), nextStatus);
    const date = page.getByLabel("Date", { exact: true });
    const start = page.getByLabel("Start (optional)");
    const end = page.getByLabel("End (optional)");
    const create = page.getByRole("button", { name: "Create session", exact: true });
    await date.fill("2026-06-01");
    await start.fill("09:00");
    await create.click();
    await page.locator('[data-feedback="create"]').getByText(/Enter both times/).waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute("name") === "endTime");
    assert.equal(await start.inputValue(), "09:00");
    await end.fill("10:00");
    await create.click();
    await page.locator('[data-feedback="create"]').getByText(/Attendance session created/).waitFor();
    await page.getByRole("button", { name: /2026-06-01 · midterm/ }).click();
    await page.getByRole("button", { name: "Delete this attendance session" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete session" }).click();
    await page.locator('[data-feedback="delete"]').getByText("Attendance session removed.").waitFor();
    const rosterName = "Synthetic Manual Student";
    await page.getByLabel("Student ID", { exact: true }).fill("ATT-02-MANUAL");
    await page.getByLabel("Student name", { exact: true }).fill(rosterName);
    await page.getByRole("button", { name: "Add student", exact: true }).click();
    await page.locator('[data-feedback="student"]').getByText("Student added and enrolled.").waitFor();
    const roster = page.getByRole("region", { name: "Student roster and semester summary" });
    const editedName = "Synthetic Edited Student";
    await roster.getByRole("row").filter({ hasText: rosterName }).getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Student name", { exact: true }).fill(editedName);
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.locator('[data-feedback="student"]').getByText("Student updated.").waitFor();
    await roster.getByRole("button", { name: `Remove ${editedName} from this roster` }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove from roster" }).click();
    await page.locator('[data-feedback="roster"]').getByText(/Student removed from this roster/).waitFor();
    await roster.getByText(editedName).waitFor({ state: "hidden" });
    await page.getByLabel("Course / teaching group").selectOption({ index: 1 });
    await page.locator('[data-feedback="roster"]').getByText(/Student removed from this roster/).waitFor({ state: "hidden" });
    await page.waitForLoadState("networkidle");
    assert.deepEqual(errors, []);
    console.log("ATT-02 browser: keyboard, file read failures/replacement, import receipts and focus, marks retry/persistence, session create/delete, roster add/edit/removal, group navigation, axe and three viewport checks passed.");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
