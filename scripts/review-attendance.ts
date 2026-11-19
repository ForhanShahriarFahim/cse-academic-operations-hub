/** Student roster and attendance browser review on a disposable PostgreSQL database. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { postgresChildEnv } from "./safety/app-env";
import { postgresDatabase, withHandle } from "./safety/database";
import { populateSpringFixture, populateSummerFixture } from "./safety/fixture";
import { withDisposableCluster } from "./safety/pg-cluster";
import { reviewSession } from "./ux-review";
import { workbookFixture } from "./verify-student-workbook";
import { readStudentWorkbook, writeStudentWorkbook } from "../src/lib/student-workbook";
import { dhakaToday } from "../src/lib/room-lifecycle";
import { todayIndex } from "../src/lib/teacher-routine-data";

const stu01b = process.argv.includes("--stu-01b");
const att03a = process.argv.includes("--att-03a");
const att04 = process.argv.includes("--att-04");
// ATT-03A reuses the ATT-01 teacher and Today setup on its own ports.
const att01 = process.argv.includes("--att-01") || att03a;
const appPort = att04 ? 3180 : att03a ? 3160 : att01 ? 3150 : stu01b ? 3146 : 3134;
const controlPort = appPort + 1;
const origin = `http://localhost:${appPort}`;
const controlOrigin = `http://localhost:${controlPort}`;
const captures = ".tmp/stu-01b/browser";
const requireFromRepo = createRequire(import.meta.url);

async function main() {
  await withDisposableCluster(process.env.SAFE01_PG_BIN || "F:/AI/tools/pgsql-17.11/pgsql/bin", async cluster => {
    const target = await cluster.createDatabase("safe01_stu01a_browser");
    const database = postgresDatabase(target, () => cluster.dropDatabase(target));
    const session = reviewSession();
    const { group, emptyGroup, matchedSession, archivedTerm } = await withHandle(database, async handle => {
      await database.migrate(handle);
      const summer = await populateSummerFixture(handle.db);
      await handle.client.query("insert into auth_session(id,expires_at,token,user_id) values('stu01a-review',now()+interval '1 day',$1,'synthetic-auth-user')", [session.token]);
      const group = Number((await handle.client.query<{ teaching_group_id: number }>(
        "select teaching_group_id from attendance_sessions order by id limit 1",
      )).rows[0].teaching_group_id);
      if (att04) {
        const spring = await populateSpringFixture(handle.db, summer);
        await handle.client.query(`with session as (
          insert into attendance_sessions(term_id, teaching_group_id, class_date, phase, start_minutes, end_minutes)
          values ($1, $2, '2027-02-06', 'final', 600, 660) returning id
        ) insert into attendance_records(session_id, student_id, status) select id, $3, 'absent' from session`,
        [spring.termId, spring.mergedGroupId, summer.studentIds[0]]);
        return { group: spring.mergedGroupId, archivedTerm: summer.termId, emptyGroup: 0, matchedSession: 0 };
      }
      const emptyGroup = Number((await handle.client.query<{ id: number }>(
        "insert into teaching_groups(term_id, course_id) select term_id, course_id from teaching_groups where id = $1 returning id", [group],
      )).rows[0].id);
      let matchedSession = 0;
      if (att01) {
        const now = new Date();
        const date = dhakaToday(now);
        await handle.client.query("update academic_terms set end_date = $1 where status = 'active'", [date]);
        await handle.client.query("update meetings set day_of_week = $1", [todayIndex(now)]);
        matchedSession = (await handle.client.query<{ id: number }>(
          "update attendance_sessions set class_date = $1 where teaching_group_id = $2 returning id", [date, group])).rows[0].id;
        await handle.client.query(
          "insert into attendance_sessions(term_id, teaching_group_id, class_date, phase) select term_id, teaching_group_id, class_date, 'final' from attendance_sessions where id = $1",
          [matchedSession],
        );
        // ATT-03A submits the second session, so give it the roll-call records the app's create action would write.
        if (att03a) await handle.client.query(
          `insert into attendance_records(session_id, student_id, status)
             select (select max(id) from attendance_sessions), student_id, 'absent' from attendance_records where session_id = $1`,
          [matchedSession],
        );
        await handle.client.query(
          "insert into auth_user(id,name,email,email_verified,created_at,updated_at) values('att01-teacher','Synthetic Teacher A','teacher-a@example.invalid',true,now(),now())",
        );
        await handle.client.query(
          "insert into auth_session(id,expires_at,token,user_id) values('att01-teacher',now()+interval '1 day',$1,'att01-teacher')",
          [session.teacherToken],
        );
      }
      return { group, emptyGroup, matchedSession, archivedTerm: 0 };
    });
    const control = createServer((request, response) => {
      if (request.url === "/sign-in" || (att04 && request.url === "/completed") || (att01 && request.url === "/teacher")) {
        const teacher = request.url === "/teacher";
        response.writeHead(302, {
          "Set-Cookie": `better-auth.session_token=${teacher ? session.teacherCookie : session.cookie}; Path=/; HttpOnly; SameSite=Lax`,
          Location: request.url === "/completed" ? `${origin}/terms/${archivedTerm}` : `${origin}/attendance${att01 ? "" : `?group=${group}`}`,
        }).end();
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
        .end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Attendance review</title><h1>Synthetic attendance review</h1>
          <p><a href="/sign-in">Open Attendance as administrator</a></p>${att01 ? '<p><a href="/teacher">Open Attendance as teacher</a></p>' : ""}
          ${att04 ? '<p><a href="/completed">Open completed term as administrator</a></p>' : ""}`);
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
      if (process.argv.includes("--check") && att04) await checkMarks();
      else if (process.argv.includes("--check") && att03a) await checkLifecycle(group, matchedSession);
      else if (process.argv.includes("--check") && att01) await checkSelection(group, emptyGroup, matchedSession);
      if (process.argv.includes("--check") && !att01 && !att04) await checkBrowser(emptyGroup, async () => {
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

async function checkMarks() {
  const output = ".tmp/att-04/browser";
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    async function capture(name: string) {
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
        const violations = await page.evaluate(async () => {
          const { axe } = window as unknown as { axe: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
          const result = await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] });
          return result.violations.map(row => ({ id: row.id, targets: row.nodes.map(node => node.target) }));
        });
        assert.deepEqual(violations, [], `Accessibility at ${name}, ${width}px`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${name}, ${width}px`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      }
    }
    await page.goto(`${controlOrigin}/sign-in`);
    await page.getByRole("link", { name: "Attendance marks", exact: true }).click();
    await page.getByRole("heading", { name: "Semester attendance marks" }).waitFor();
    await page.getByText("5.00 / 10", { exact: true }).waitFor();
    await capture("semester");
    await page.getByRole("link", { name: "Midterm", exact: true }).click();
    await page.getByRole("heading", { name: "Midterm attendance marks" }).waitFor();
    await page.getByText("10.00 / 10", { exact: true }).first().waitFor();
    await capture("midterm");
    const final = page.getByRole("link", { name: "Final", exact: true });
    await final.focus();
    await final.press("Enter");
    await page.getByRole("heading", { name: "Final attendance marks" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Final", exact: true }).getAttribute("aria-current"), "page");
    await page.getByText("No eligible sessions", { exact: true }).waitFor();
    await capture("final");
    await page.getByRole("link", { name: "Synthetic Student One" }).click();
    await page.getByRole("heading", { name: "Dated sessions" }).waitFor();
    await page.getByText("+1 eligible", { exact: true }).waitFor();
    await capture("student");
    await page.getByRole("link", { name: "Back to final marks" }).click();
    await page.getByRole("heading", { name: "Final attendance marks" }).waitFor();
    await page.getByRole("link", { name: "Back to attendance and roll-call" }).click();
    await page.getByRole("heading", { name: "Take attendance" }).waitFor();

    await page.goto(`${controlOrigin}/completed`);
    await page.getByRole("link", { name: "Attendance marks", exact: true }).click();
    await page.getByRole("heading", { name: "Choose a class group" }).waitFor();
    await page.getByRole("link", { name: /SYN-4101.*Synthetic Theory/ }).click();
    await page.getByRole("heading", { name: "Semester attendance marks" }).waitFor();
    await page.getByText(/Version 1 effective.*evaluated/).waitFor();
    await capture("completed");
    await page.goto(`${origin}/settings#policy`);
    await page.getByText(/Round the mark to two decimals and the percentage separately to one decimal/).waitFor();
    console.log(`ATT-04 compiled browser review passed. Captures in ${output}.`);
  } finally { await browser.close(); }
}

async function checkSelection(group: number, emptyGroup: number, matchedSession: number) {
  const output = ".tmp/att-01/browser";
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  try {
    const teacher = await browser.newPage({ viewport: { width: 320, height: 900 } });
    await teacher.goto(`${controlOrigin}/teacher`);
    await teacher.getByRole("heading", { name: "My classes", exact: true }).waitFor();
    const rollCall = teacher.getByRole("link", { name: /Open roll-call for SYN-4101/ });
    await rollCall.focus();
    await rollCall.press("Enter");
    await teacher.getByRole("region", { name: "Take attendance" }).waitFor();
    await teacher.waitForFunction(() => document.activeElement?.id === "roll-call");
    await teacher.waitForFunction(() => {
      const heading = document.getElementById("roll-call-heading")?.getBoundingClientRect();
      const topBar = document.querySelector("header.sticky")?.getBoundingClientRect();
      return heading && topBar && heading.top >= topBar.bottom && heading.bottom <= innerHeight;
    });
    assert.equal(new URL(teacher.url()).searchParams.get("session"), String(matchedSession));
    await teacher.getByRole("button", { pressed: true, name: /midterm.*9:00/ }).waitFor();
    await teacher.getByRole("combobox", { name: "Attendance for Synthetic Visiting Student" }).waitFor();
    assert.equal(await teacher.getByRole("link", { name: "Manage roster" }).count(), 0);
    assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await teacher.screenshot({ path: `${output}/teacher-roll-call-320.png`, fullPage: true });
    await teacher.getByRole("link", { name: "Printable roll-call", exact: true }).click();
    await teacher.getByRole("heading", { name: "Roll-call", exact: true }).waitFor();
    await teacher.getByText("Synthetic Visiting Student", { exact: true }).waitFor();
    await teacher.getByRole("link", { name: "Back to attendance", exact: true }).click();
    await teacher.waitForURL(url => url.pathname === "/attendance" && url.searchParams.get("group") === String(group));
    await teacher.goto(`${origin}/attendance?group=${emptyGroup}`);
    await teacher.getByText("This attendance link is unavailable.", { exact: false }).waitFor();
    assert.equal(await teacher.getByRole("region", { name: "Take attendance" }).count(), 0);
    await teacher.goto(`${origin}/attendance`);
    await teacher.getByRole("link", { name: /Open class for SYN-4102/ }).click();
    await teacher.getByText("Weekly routine slot", { exact: false }).waitFor();
    assert.equal(await teacher.locator('input[name="classDate"]').inputValue(), "");

    const admin = await browser.newPage();
    await admin.goto(`${controlOrigin}/sign-in`);
    await admin.getByRole("heading", { name: "Find a course", exact: true }).waitFor();
    await admin.getByLabel("Department", { exact: true }).selectOption({ label: "CSE" });
    await admin.getByLabel("Stream", { exact: true }).selectOption("hsc");
    await admin.getByLabel("Batch", { exact: true }).selectOption({ label: "HSC-22B · Semester 7" });
    const merged = admin.getByRole("link", { name: /Open group for SYN-4101.*HSC-22B.*DIP-22B.*EEE-22B/ });
    await merged.click();
    await admin.waitForURL(url => url.searchParams.get("group") === String(group));
    await admin.reload();
    await admin.getByRole("link", { name: "Change group" }).click();
    await admin.getByLabel("Stream", { exact: true }).selectOption("diploma");
    await admin.waitForURL(url => url.searchParams.get("stream") === "diploma" && !url.searchParams.has("group"));
    const diplomaFinder = admin.url();
    await merged.click();
    await admin.waitForURL(url => url.searchParams.get("group") === String(group));
    await admin.goBack();
    await merged.waitFor();
    assert.equal(await admin.getByLabel("Stream", { exact: true }).inputValue(), "diploma");
    await admin.goForward();
    await admin.getByRole("link", { name: "Manage roster" }).waitFor();
    await admin.getByRole("link", { name: "Manage roster" }).click();
    await admin.getByRole("heading", { name: "Manage roster", exact: true }).waitFor();
    await admin.getByRole("link", { name: "Back to attendance" }).click();
    await admin.waitForURL(url => url.pathname === "/attendance" && url.searchParams.get("group") === String(group));
    await admin.goto(`${origin}/attendance?group=${emptyGroup}&session=${matchedSession}`);
    await admin.getByText("This attendance session or routine slot is unavailable.", { exact: false }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Save", exact: true }).count(), 0);
    await admin.goto(`${origin}/attendance?group=${group}&session=2147483647`);
    await admin.getByText("This attendance session or routine slot is unavailable.", { exact: false }).waitFor();
    assert.equal(await admin.getByRole("button", { name: "Save", exact: true }).count(), 0);
    await admin.goto(`${origin}/attendance?group=${group}&group=${emptyGroup}`);
    await admin.getByText("This attendance link is unavailable.", { exact: false }).waitFor();
    assert.equal(await admin.getByRole("region", { name: "Take attendance" }).count(), 0);
    await admin.goto(diplomaFinder);
    await merged.waitFor();
    await admin.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
    for (const width of [1440, 390, 320]) {
      await admin.setViewportSize({ width, height: 900 });
      assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const violations = await admin.evaluate(async () => {
        const axe = (window as Window & { axe?: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string }> }> } }).axe!;
        return (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations.map(item => item.id);
      });
      assert.deepEqual(violations, [], `Find a course accessibility at ${width}px`);
      await admin.screenshot({ path: `${output}/course-finder-${width}.png`, fullPage: true });
    }
    console.log("ATT-01 Edge checks passed: teacher routine, exact session, unmatched slot, merged cascade, history, refused URLs and responsive layout.");
  } finally {
    await browser.close();
  }
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

/** ATT-03A compiled review: teacher submit/reopen/resubmit, reviewer lock/void/restore/lock-all, history, keyboard, axe and three widths. */
async function checkLifecycle(group: number, matchedSession: number) {
  const output = ".tmp/att-03a/browser";
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const axeAt = async (page: import("playwright").Page, label: string) => {
    await page.addScriptTag({ path: requireFromRepo.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(async () => {
      const axe = (window as Window & { axe?: { run: (node: Document, options: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: unknown; failureSummary?: string }> }> }> } }).axe!;
      return (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] })).violations
        .map(item => ({ id: item.id, nodes: item.nodes.map(node => `${JSON.stringify(node.target)} ${node.failureSummary ?? ""}`) }));
    });
    assert.deepEqual(violations, [], `${label} accessibility: ${JSON.stringify(violations)}`);
  };
  const widths = async (page: import("playwright").Page, name: string) => {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflows at ${width}px`);
      await axeAt(page, `${name} ${width}px`);
      await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  };
  const status = (page: import("playwright").Page, text: RegExp) => page.getByRole("status").filter({ hasText: text }).first().waitFor();
  const reason = async (page: import("playwright").Page, trigger: string, confirm: string, text: string) => {
    await page.getByRole("button", { name: trigger, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.id === "reason-text");
    if (text) await dialog.getByRole("textbox").fill(text);
    await dialog.getByRole("button", { name: confirm, exact: true }).click();
  };
  try {
    const teacher = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await teacher.goto(`${controlOrigin}/teacher`);
    await teacher.getByRole("link", { name: /Open roll-call for SYN-4101/ }).click();
    await teacher.getByText("Not submitted yet.").waitFor();
    await widths(teacher, "teacher-draft");
    await teacher.getByRole("button", { name: "Mark all present" }).click();
    await teacher.getByText(/unsaved, was/).first().waitFor();
    await teacher.getByRole("button", { name: "Submit roll-call" }).click();
    await status(teacher, /Roll-call submitted/);
    await teacher.getByText(/Last submitted by Synthetic Teacher A/).waitFor();
    assert.equal(await teacher.getByRole("combobox", { name: /^Attendance for / }).count(), 0, "a submitted roll-call is read-only");
    assert.equal(await teacher.getByRole("button", { name: "Lock", exact: true }).count(), 0, "teachers are not offered Lock");
    assert.equal(await teacher.getByRole("button", { name: "Delete draft" }).count(), 0);
    await widths(teacher, "teacher-submitted");

    // Reason dialog: keyboard focus, validation, Escape returns focus to the trigger.
    await teacher.getByRole("button", { name: "Reopen for correction" }).focus();
    await teacher.keyboard.press("Enter");
    await teacher.getByRole("dialog").waitFor();
    await teacher.waitForFunction(() => document.activeElement?.id === "reason-text");
    await teacher.keyboard.press("Escape");
    await teacher.waitForFunction(() => document.activeElement?.textContent === "Reopen for correction");
    await reason(teacher, "Reopen for correction", "Reopen session", "");
    await teacher.getByRole("alert").filter({ hasText: "Enter at least 3 characters." }).waitFor();
    await axeAt(teacher, "reason dialog with error");
    await teacher.getByRole("dialog").screenshot({ path: `${output}/reason-dialog-error.png` });
    await teacher.getByRole("dialog").getByRole("textbox").fill("Visiting student arrived within ten minutes");
    await teacher.getByRole("dialog").getByRole("button", { name: "Reopen session", exact: true }).click();
    await status(teacher, /Session reopened for correction/);
    await teacher.getByText("Reason for correction:").waitFor();
    await teacher.getByRole("combobox", { name: "Attendance for Synthetic Visiting Student" }).selectOption("late");
    await teacher.getByText("unsaved, was Present").waitFor();
    await widths(teacher, "teacher-reopened");
    await teacher.getByRole("button", { name: "Resubmit" }).click();
    await status(teacher, /Roll-call submitted/);
    await teacher.getByText("Session history").click();
    await teacher.getByText(/Resubmitted · Synthetic Teacher A/).waitFor();
    await teacher.getByText(/Reopened for correction · Synthetic Teacher A/).waitFor();
    await teacher.getByText("Reason: Visiting student arrived within ten minutes").waitFor();
    await teacher.getByText(/Present → Late/).waitFor();
    await widths(teacher, "teacher-history");

    // A second dated session for lock-all.
    await teacher.getByRole("button", { name: /final/ }).click();
    await teacher.getByRole("button", { name: "Submit roll-call" }).click();
    await status(teacher, /Roll-call submitted/);

    const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await admin.goto(`${controlOrigin}/sign-in`);
    await admin.goto(`${origin}/attendance?group=${group}&session=${matchedSession}`);
    await admin.getByRole("button", { name: "Lock all submitted (2)" }).waitFor();
    await reason(admin, "Lock", "Lock session", "Checked against the paper register");
    await status(admin, /Session locked/);
    await admin.getByText(/Locked by Synthetic Admin/).waitFor();
    await widths(admin, "reviewer-locked");

    await teacher.reload();
    await teacher.getByRole("button", { name: /midterm/ }).click();
    await teacher.getByText("Only an attendance reviewer can reopen or void a locked session.").waitFor();
    assert.equal(await teacher.getByRole("button", { name: "Reopen for correction" }).count(), 0);
    await widths(teacher, "teacher-locked");

    await reason(admin, "Void session", "Void session", "Class was recorded against the wrong slot");
    await status(admin, /Session voided/);
    await admin.getByText("Reason voided:").waitFor();
    await widths(admin, "reviewer-voided");
    await reason(admin, "Restore", "Restore session", "Voided by mistake");
    await status(admin, /Session restored as reopened/);
    await admin.getByText("Reason for correction:").waitFor();

    await admin.getByRole("button", { name: "Lock all submitted (1)" }).click();
    await admin.getByRole("dialog").getByRole("heading", { name: "Lock 1 submitted session(s)?" }).waitFor();
    await admin.getByRole("dialog").getByText("1 submitted", { exact: true }).waitFor();
    await admin.getByRole("dialog").getByText(/1 reopened/).first().waitFor();
    await axeAt(admin, "lock-all dialog");
    await admin.getByRole("dialog").screenshot({ path: `${output}/lock-all-dialog.png` });
    await admin.getByRole("dialog").getByRole("button", { name: "Lock 1 session(s)" }).click();
    await status(admin, /1 submitted session\(s\) locked/);
    await admin.getByText(/session\(s\) not yet submitted/).waitFor();
    await widths(admin, "reviewer-after-lock-all");
    console.log("ATT-03A browser: teacher submit, read-only state, keyboard reason dialog with validation and Escape, reopen/correction/resubmit, history, reviewer lock, teacher locked view, void, restore, lock-all confirmation, axe and 1440/390/320 checks passed.");
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
