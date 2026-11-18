/** Student roster and attendance browser review on a disposable PostgreSQL database. */
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
import { workbookFixture } from "./verify-student-workbook";
import { readStudentWorkbook, writeStudentWorkbook } from "../src/lib/student-workbook";

const stu01b = process.argv.includes("--stu-01b");
const appPort = stu01b ? 3146 : 3134;
const controlPort = stu01b ? 3147 : 3135;
const origin = `http://localhost:${appPort}`;
const controlOrigin = `http://localhost:${controlPort}`;
const captures = ".tmp/stu-01b/browser";
const requireFromRepo = createRequire(import.meta.url);

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin", async cluster => {
    const target = await cluster.createDatabase("safe01_stu01a_browser");
    const database = postgresDatabase(target, () => cluster.dropDatabase(target));
    const session = reviewSession();
    const { group, emptyGroup } = await withHandle(database, async handle => {
      await database.migrate(handle);
      await populateSummerFixture(handle.db);
      await handle.client.query("insert into auth_session(id,expires_at,token,user_id) values('stu01a-review',now()+interval '1 day',$1,'synthetic-auth-user')", [session.token]);
      const group = Number((await handle.client.query<{ teaching_group_id: number }>(
        "select teaching_group_id from attendance_sessions order by id limit 1",
      )).rows[0].teaching_group_id);
      const emptyGroup = Number((await handle.client.query<{ id: number }>(
        "insert into teaching_groups(term_id, course_id) select term_id, course_id from teaching_groups where id = $1 returning id", [group],
      )).rows[0].id);
      return { group, emptyGroup };
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
        .end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Attendance review</title><h1>Student roster synthetic review</h1><a href="/sign-in">Sign in and open Attendance</a>');
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
      console.log(`Student roster synthetic review: ${controlOrigin}/sign-in`);
      if (process.argv.includes("--check")) await checkBrowser(emptyGroup, async () => {
        await withHandle(database, async handle => {
          await handle.client.query(`with added as (
              insert into students(student_code, full_name)
              select 'PAGE-' || lpad(n::text, 3, '0'), repeat('Long Synthetic Student Name ', 6) || n
              from generate_series(1, 57) n returning id
            ) insert into course_enrollments(student_id, term_id, teaching_group_id, audience_type)
              select added.id, teaching_groups.term_id, teaching_groups.id, 'merged'
              from added cross join teaching_groups where teaching_groups.id = $1`, [group]);
        });
      });
      if (process.argv.includes("--serve")) await exited;
    } finally {
      if (server.exitCode === null) server.kill();
      await exited;
      control.close();
      await database.dispose();
    }
  });
}

async function checkBrowser(emptyGroup: number, addPrintRoster: () => Promise<void>) {
  await mkdir(captures, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${controlOrigin}/sign-in`);
    const attendanceUrl = page.url();
    await page.getByRole("link", { name: "Manage roster" }).click();
    await page.waitForURL(url => url.pathname === "/attendance/roster");
    const rosterUrl = page.url();
    const picker = page.getByLabel("CSV or Excel file");
    await picker.focus();
    assert.equal(await picker.evaluate(el => document.activeElement === el), true);
    async function upload(text: string) {
      await picker.setInputFiles({ name: "synthetic.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
      await page.getByRole("button", { name: "Preview import", exact: true }).click();
    }
    const header = "Student ID,Student Name\n";
    const row = "000-STU-REVIEW,Synthetic Browser Student";
    await upload(header + row + "\n\nINVALID,\n" + row);
    const review = page.locator("#import-students");
    await review.getByText(/Preview ready/).waitFor();
    await review.getByText(/Line 4 · Failed/i).waitFor();
    await review.getByText(/Line 5 · Skipped/i).waitFor();
    assert.equal(await page.getByText("Synthetic Browser Student", { exact: true }).count(), 0, "preview is write-free");
    await page.getByRole("button", { name: "Import 1 eligible row" }).click();
    await review.getByRole("heading", { name: "Receipt" }).waitFor();
    await page.getByText("Synthetic Browser Student", { exact: true }).waitFor();
    async function checkResponsive(prefix: string) {
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => {
          const axe = (window as Window & { axe?: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string }> }> } }).axe!;
          return (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map(item => item.id);
        });
        assert.deepEqual(violations, [], `Accessibility at ${prefix} ${width}px`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${prefix} ${width}px`);
        await page.screenshot({ path: `${captures}/${prefix}-${width}.png`, fullPage: true });
      }
    }
    await checkResponsive("roster-receipt");
    const workbook = workbookFixture("000-WORKBOOK-REVIEW");
    await picker.setInputFiles({ name: "synthetic.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: workbook });
    const selector = page.getByLabel("Worksheet");
    await selector.waitFor();
    assert.equal(await selector.locator("option").count(), 3, "hidden sheet omitted");
    await selector.selectOption({ label: "Students" });
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await review.getByText(/Row 8 · Failed/i).waitFor();
    assert.equal(await page.getByText("Synthetic Workbook Student", { exact: true }).count(), 0);
    await selector.selectOption({ label: "Other group" });
    assert.equal(await review.getByRole("button", { name: /eligible row/ }).count(), 0);
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await review.getByText(/Row 8 · Failed/i).waitFor();
    await page.getByRole("button", { name: "Import 1 eligible row" }).click();
    await review.getByRole("heading", { name: "Receipt" }).waitFor();
    await page.getByText("Synthetic Workbook Student", { exact: true }).waitFor();
    await checkResponsive("excel-receipt");
    const csvHref = (await page.getByRole("link", { name: "Download CSV", exact: true }).getAttribute("href"))!;
    const excelHref = (await page.getByRole("link", { name: "Download Excel", exact: true }).getAttribute("href"))!;
    const printHref = (await page.getByRole("link", { name: "Printable roll-call", exact: true }).getAttribute("href"))!;
    const [download] = await Promise.all([
      page.waitForEvent("download"), page.getByRole("link", { name: "Download Excel", exact: true }).click(),
    ]);
    assert.match(download.suggestedFilename(), /roster-term-\d+-group-\d+\.xlsx/);
    await page.getByRole("status").filter({ hasText: "Excel roster ready." }).waitFor();
    const csvUrl = new URL(csvHref, origin);
    await page.route(csvUrl.href, route => route.fulfill({ status: 409, json: { error: "The academic term changed. Reopen Attendance and try again." } }));
    await page.getByRole("link", { name: "Download CSV", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "The academic term changed." }).waitFor();
    assert.equal(page.url(), rosterUrl);
    await page.unroute(csvUrl.href);
    const csvResponse = await page.request.get(new URL(csvHref, origin).href);
    assert.equal(csvResponse.status(), 200);
    assert.match(csvResponse.headers()["cache-control"], /private.*no-store/);
    const csvText = await csvResponse.text();
    assert.match(csvText, /"000-WORKBOOK-REVIEW","Synthetic Workbook Student","external"/);
    const excelResponse = await page.request.get(new URL(excelHref, origin).href);
    assert.equal(excelResponse.status(), 200);
    assert.match(excelResponse.headers()["content-disposition"], /roster-term-\d+-group-\d+\.xlsx/);
    const excelRows = (await readStudentWorkbook(await excelResponse.body())).selected!.rows
      .map(row => row.cells.map(cell => "text" in cell ? cell.text : null));
    assert.deepEqual(excelRows, csvText.trim().split("\r\n").slice(1).map(line => line.slice(1, -1).split('","')));
    const printResponse = await page.goto(new URL(printHref, origin).href);
    assert.match(printResponse?.headers()["cache-control"] ?? "", /private.*no-store/);
    await page.getByRole("button", { name: "Print roll-call" }).waitFor();
    assert.deepEqual(await page.locator("tbody tr td:nth-child(1)").allTextContents(), excelRows.map(row => row[0]));
    assert.ok((await page.locator("tbody tr td:nth-child(4)").allTextContents()).every(value => value === ""));
    await page.pdf({ path: `${captures}/roll-call-a4.pdf`, preferCSSPageSize: true });
    await checkResponsive("roll-call");
    const anonymousDownload = await browser.newContext();
    try { assert.equal((await anonymousDownload.request.get(new URL(excelHref, origin).href)).status(), 401); }
    finally { await anonymousDownload.close(); }
    const emptyPrint = new URL(printHref, origin);
    emptyPrint.searchParams.set("group", String(emptyGroup));
    await page.goto(emptyPrint.href);
    await page.getByText("This group has no active roster members.").waitFor();
    assert.equal(await page.getByRole("button", { name: "Print roll-call" }).count(), 0);
    const emptyCsv = new URL(csvHref, origin);
    emptyCsv.searchParams.set("group", String(emptyGroup));
    assert.match((await (await page.request.get(emptyCsv.href)).text()).trim(), /^"Student ID","Student Name","Audience Type"$/);
    await page.goto(new URL(printHref, origin).href);
    await page.getByRole("link", { name: "Back to roster" }).click();
    await page.waitForURL(url => url.pathname === "/attendance/roster");
    await upload(header + row);
    await review.getByText(/Enrollment already matches/).waitFor();
    assert.equal(await page.getByRole("button", { name: /eligible row/ }).count(), 0);
    await page.goto(`${origin}/students`);
    const sampleHref = (await page.getByRole("link", { name: "Excel sample" }).getAttribute("href"))!;
    const sampleResponse = await page.request.get(new URL(sampleHref, origin).href);
    assert.equal(sampleResponse.status(), 200);
    assert.deepEqual((await readStudentWorkbook(await sampleResponse.body())).selected!.headings, ["Student ID", "Student Name", "Department"]);
    await picker.setInputFiles({ name: "directory.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(writeStudentWorkbook([["Student ID", "Student Name"], ["000-DIRECTORY-WORKBOOK", "Synthetic Directory Workbook"]])) });
    await page.getByRole("button", { name: "Preview import", exact: true }).click();
    await review.getByText(/Row 2 · Created/i).waitFor();
    await review.getByRole("button", { name: "Import 1 eligible row" }).click();
    await review.getByRole("heading", { name: "Receipt" }).waitFor();
    await page.getByLabel("Student ID or name").fill("000-STU-REVIEW");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("link", { name: "Synthetic Browser Student" }).waitFor();
    await checkResponsive("directory");
    await page.getByRole("link", { name: "Synthetic Browser Student" }).click();
    assert.equal(await page.getByLabel("Student ID", { exact: true }).getAttribute("readonly"), "");
    await page.getByLabel("Private phone").fill("+0000000141");
    await page.getByRole("button", { name: "Save student" }).click();
    await page.getByRole("status").filter({ hasText: "Student saved." }).waitFor();
    await page.reload();
    assert.equal(await page.getByLabel("Private phone").inputValue(), "+0000000141");
    await checkResponsive("detail");
    await page.goto(attendanceUrl);
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
    await page.goto(rosterUrl);
    const rosterName = "Synthetic Manual Student";
    await page.getByLabel("Student ID", { exact: true }).fill("STU-01A-MANUAL");
    await page.getByLabel("Student name", { exact: true }).fill(rosterName);
    await page.getByRole("button", { name: "Add to roster", exact: true }).click();
    await page.getByText("Student enrolled.", { exact: true }).waitFor();
    const member = page.getByRole("listitem").filter({ hasText: rosterName });
    await member.getByText("Remove from roster", { exact: true }).click();
    await member.getByRole("button", { name: "Confirm removal" }).click();
    await member.getByRole("button", { name: "Restore enrollment" }).waitFor();
    await member.getByRole("button", { name: "Restore enrollment" }).click();
    await member.getByText(/Active enrollment/).waitFor();

    const batchReview = page.locator("section").filter({ has: page.getByRole("heading", { name: "Enroll a batch", exact: true }) });
    const batchId = (await batchReview.getByLabel("Home batch").selectOption({ index: 1 }))[0];
    await page.goto(`${origin}/students/new`);
    await page.getByLabel("Student ID", { exact: true }).fill("000-BROWSER-BATCH");
    await page.getByLabel("Student name", { exact: true }).fill("Synthetic Batch Candidate");
    await page.locator("select[name=homeBatchId]").selectOption(batchId);
    await page.getByRole("button", { name: "Add student", exact: true }).click();
    await page.getByRole("heading", { name: "Synthetic Batch Candidate", exact: true }).waitFor();
    await page.goto(rosterUrl);
    await batchReview.getByLabel("Home batch").selectOption(batchId);
    await batchReview.getByLabel("Audience for new enrollments").selectOption("merged");
    await batchReview.getByRole("button", { name: "Preview enrollment", exact: true }).click();
    await batchReview.getByRole("list", { name: "Batch candidates" }).getByText(/Synthetic Batch Candidate/).waitFor();
    await batchReview.getByRole("button", { name: /^Enroll \d+ students?$/ }).click();
    await batchReview.getByRole("heading", { name: "Receipt" }).waitFor();

    const anonymous = await browser.newPage();
    await anonymous.goto(`${origin}/students`);
    await anonymous.waitForURL(url => url.pathname === "/login");
    assert.equal(await anonymous.getByText("Synthetic Batch Candidate").count(), 0);
    await anonymous.close();
    await page.waitForLoadState("networkidle");
    assert.deepEqual(errors, []);
    await addPrintRoster();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(new URL(printHref, origin).href);
    await page.getByRole("button", { name: "Print roll-call" }).waitFor();
    assert.equal(await page.getByText(/Long Synthetic Student Name/).count(), 57);
    await page.pdf({ path: `${captures}/roll-call-multi-a4.pdf`, preferCSSPageSize: true });
    console.log("Student roster browser: CSV and Excel preview and confirmation, both downloads, roster parity, denied download, A4 roll-call, directory and enrollment flows, captured marks, axe and three viewport checks passed.");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
