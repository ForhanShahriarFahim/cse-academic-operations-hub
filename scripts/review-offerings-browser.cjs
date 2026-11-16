/* global axe */
/** Guarded synthetic production QA for CRS-01B, launched only by review-offerings.ts --check. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { Client } = require('pg');
(async () => {
  const target = new URL(process.env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname)); assert.equal(target.pathname, '/safe01_crs01b_browser');
  const fall = Number(process.env.CRS01B_FALL_ID); assert.ok(Number.isSafeInteger(fall) && fall > 0);
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), context = await browser.newContext(), page = await context.newPage();
  const base = 'http://localhost:3126', control = 'http://localhost:3127', out = 'output/playwright/CRS-01B/runtime'; fs.mkdirSync(out, { recursive: true });
  const captures = [], errors = [], checks = [], hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); page.on('pageerror', error => errors.push(String(error)));
  const preserved = ['schedule_versions', 'attendance_sessions', 'attendance_records', 'workload_allocations', 'extra_load_classes', 'teaching_groups', 'teaching_group_offerings', 'meetings', 'course_enrollments', 'batch_term_placements', 'courses', 'academic_terms', 'term_context'];
  const snapshot = async () => { const result = {}; for (const table of preserved) result[table] = hash((await client.query(`select * from ${table} order by id`)).rows); return result; };
  const before = await snapshot();
  const summer = (await client.query("select * from academic_terms where status='active'")).rows[0], version = (await client.query('select * from schedule_versions order by id limit 1')).rows[0];
  const summerOfferings = async () => hash((await client.query('select * from course_offerings where term_id=$1 order by id', [summer.id])).rows), summerBefore = await summerOfferings();
  const archive = `${base}/terms/${summer.id}/publications/${version.id}`, list = `/terms/${fall}/offerings`;
  const rows = async () => (await client.query('select c.code, b.label, o.status from course_offerings o join courses c on c.id=o.course_id join batches b on b.id=o.batch_id where o.term_id=$1 order by b.label, c.code', [fall])).rows.map(r => `${r.label}:${r.code}:${r.status}`);
  async function capture(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.evaluate(() => document.fonts.ready); await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })));
      assert.deepEqual(violations, [], `${name} accessibility ${width}`); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false, `${name} overflow ${width}`);
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true }); captures.push({ name, width, overflow, violations });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const heading = name => page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  async function navigate(route, name) { await page.goto(base + route); await (name ? heading(name) : page.locator('main h1').waitFor()); }
  const press = name => page.getByRole('button', { name, exact: true }).click();
  const csvOf = async () => { const response = await page.request.get(archive + '/export'); assert.ok(response.ok()); return response.body(); };
  try {
    // Sign in lands on the prepared draft's offerings.
    await page.goto(control + '/sign-in'); await heading('Term offerings — Fall 2026'); await capture('list-not-started');
    assert.ok(await page.getByText('viewing it does not change the active term').isVisible());
    assert.deepEqual(await rows(), []);
    const csvBefore = await csvOf();
    for (const kind of ['official', 'teachers']) { await page.goto(`${archive}/${kind}`); await page.locator('main h1').waitFor(); await page.evaluate(() => document.fonts.ready); await page.pdf({ path: `${out}/before-${kind}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true }); }

    // Reviewed start: validation keeps ticks, then creates exactly the ticked rows.
    await navigate(list); await page.getByRole('link', { name: 'Start from previous term', exact: true }).first().click(); await heading('Start from previous term'); await capture('start');
    assert.ok(await page.getByText('3 offerings will be created for 2 cohorts in Fall 2026.').isVisible());
    await page.getByLabel(/SYN-4103/).check(); assert.ok(await page.getByText('4 offerings will be created for 2 cohorts in Fall 2026.').isVisible());
    assert.equal(await page.getByLabel(/SYN-4104/).count(), 0, 'inactive course has no checkbox');
    await press('Create 4 offerings'); await page.getByText('Enter a reason for this start.', { exact: true }).waitFor(); assert.ok(await page.getByLabel(/SYN-4103/).isChecked(), 'ticks survive validation'); await capture('start-validation'); assert.deepEqual(await rows(), []);
    await page.getByLabel('Reason (required)', { exact: true }).fill('Preparing Fall 2026 from Summer 2026'); await press('Create 4 offerings');
    await heading('Term offerings — Fall 2026'); await page.getByText('4 offerings created for 2 cohorts.', { exact: false }).waitFor(); await capture('list-started');
    assert.deepEqual(await rows(), ['22B:SYN-4201:planned', '22B:SYN-4202:planned', '23A:SYN-4101:planned', '23A:SYN-4103:planned']);
    checks.push('Reviewed start created exactly the four ticked offerings as planned rows after a validation round that kept the ticks.');

    // Stale review: a second tab applies an older review after the list changed.
    await navigate(`${list}/start`, 'Start from previous term'); await page.getByLabel(/SYN-4102/).check();
    await client.query("insert into course_offerings(course_id,batch_id,term_id,status) select c.id,b.id,$1,'planned' from courses c, batches b where c.code='SYN-2201' and b.stream='DIPLOMA' and b.label='22B'", [fall]);
    await page.getByLabel('Reason (required)', { exact: true }).fill('Synthetic stale review'); await press('Create 1 offering');
    await page.getByText('These offerings changed since you opened this page. Review the current list before saving.', { exact: true }).waitFor(); await capture('start-stale');
    assert.ok(!(await rows()).includes('23A:SYN-4102:planned')); checks.push('A stale start review is refused with the plain stale message; nothing is saved.');

    // Add: out-of-semester needs the tick and a reason.
    await navigate(`${list}/add`, 'Add course'); await capture('add');
    await page.getByLabel('Cohort', { exact: true }).selectOption({ label: 'HSC-23A · Semester 7' }); await page.getByLabel('Course', { exact: true }).selectOption({ label: 'SYN-4201 · Synthetic Capstone (semester 8)' });
    await page.getByText('Different curriculum semester.').waitFor(); await press('Add offering'); await page.getByText(/Tick the confirmation to offer it anyway\./).waitFor(); await capture('add-validation');
    await page.getByLabel('Offer this course outside its curriculum semester', { exact: true }).check(); await page.getByLabel('Reason (required)', { exact: true }).fill('Approved early capstone'); await press('Add offering');
    await heading('Term offerings — Fall 2026'); await page.getByText('SYN-4201 is now offered to HSC-23A.', { exact: false }).waitFor(); assert.ok((await rows()).includes('23A:SYN-4201:planned'));
    checks.push('Out-of-semester add required the explicit tick and reason, then created one planned offering.');

    // Cancel, restore through Add, cancel again, restore, remove.
    const offering = (await client.query("select o.id from course_offerings o join courses c on c.id=o.course_id join batches b on b.id=o.batch_id where o.term_id=$1 and c.code='SYN-4201' and b.label='23A'", [fall])).rows[0].id;
    await navigate(`${list}/${offering}`, 'SYN-4201 for HSC-23A'); await capture('change');
    await press('Cancel offering'); await page.getByText('Enter a reason for cancelling.', { exact: true }).waitFor();
    await page.locator('#change-cancel-reason').fill('Not running this term'); await press('Cancel offering'); await heading('Term offerings — Fall 2026'); assert.ok((await rows()).includes('23A:SYN-4201:cancelled')); await capture('list-cancelled');
    await navigate(`${list}/${offering}`, 'SYN-4201 for HSC-23A'); await capture('change-cancelled'); await page.locator('#change-restore-reason').fill('Running after all'); await press('Restore offering'); await heading('Term offerings — Fall 2026'); assert.ok((await rows()).includes('23A:SYN-4201:planned'));
    await navigate(`${list}/${offering}`, 'SYN-4201 for HSC-23A'); await page.locator('#change-remove-reason').fill('Added by mistake'); await press('Remove offering'); await page.getByText('Type the course code to confirm removal.', { exact: true }).waitFor();
    await page.getByLabel('Type SYN-4201 to confirm', { exact: true }).fill('SYN-4201'); await press('Remove offering'); await heading('Term offerings — Fall 2026'); assert.ok(!(await rows()).some(r => r.startsWith('23A:SYN-4201')));
    checks.push('Cancel, restore and draft removal each needed a reason; removal also needed the typed course code.');

    // Keyboard: the first control on the add form is reachable and operable without a pointer.
    await navigate(`${list}/add`, 'Add course'); await page.getByLabel('Cohort', { exact: true }).focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'add-course');
    await navigate(`${list}/history`, 'Change history'); await capture('history'); for (const text of ['Started from a previous term', 'Offering removed', 'Reason: Added by mistake']) assert.ok(await page.getByText(text, { exact: false }).first().isVisible(), text);
    assert.equal(await page.getByText('@example.invalid').count(), 0, 'no actor email in history');

    // Filters and print.
    await navigate(`${list}?compare=added`); await capture('list-filtered'); await navigate(list);
    await page.pdf({ path: `${out}/offerings.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });

    // Active term: offerings in class groups are left alone.
    await navigate(`/terms/${summer.id}/offerings`, 'Term offerings — Summer 2026'); await capture('active-term');
    const linked = (await client.query("select o.id from course_offerings o join teaching_group_offerings l on l.offering_id=o.id where o.term_id=$1 order by o.id limit 1", [summer.id])).rows[0].id;
    await navigate(`/terms/${summer.id}/offerings/${linked}`); await page.getByText('This offering is part of a class group.').waitFor(); await capture('linked'); assert.equal(await page.getByRole('button', { name: 'Cancel offering', exact: true }).count(), 0);
    await navigate('/courses', 'Courses & offerings'); assert.ok(await page.getByRole('link', { name: 'Fall 2026 offerings', exact: true }).isVisible()); assert.ok(await page.getByRole('link', { name: 'Summer 2026 offerings', exact: true }).isVisible()); await capture('courses-links');
    checks.push('Active-term offerings in class groups show no cancel/remove control; Courses & offerings links to both terms.');

    // View-only account: data without controls, and editor pages are refused.
    await page.goto(control + '/viewer'); await heading('Term offerings — Fall 2026'); await capture('viewer');
    for (const name of ['Start from previous term', 'Add course', 'Change history']) assert.equal(await page.getByRole('link', { name, exact: true }).count(), 0, name);
    await page.goto(`${base}${list}/add`); await page.waitForURL(/\/forbidden/); await page.goto(`${base}${list}/history`); await page.waitForURL(/\/forbidden/);
    checks.push('A view-only account reads the list and comparison with no controls; direct editor URLs redirect to the forbidden page.');

    // Preservation: published output and every non-offering table are unchanged.
    await page.goto(control + '/sign-in'); await heading('Term offerings — Fall 2026');
    assert.ok(Buffer.compare(csvBefore, await csvOf()) === 0, 'archived CSV bytes unchanged');
    for (const kind of ['official', 'teachers']) { await page.goto(`${archive}/${kind}`); await page.locator('main h1').waitFor(); await page.evaluate(() => document.fonts.ready); await page.pdf({ path: `${out}/after-${kind}.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true }); }
    assert.deepEqual(await snapshot(), before); assert.equal(await summerOfferings(), summerBefore);
    checks.push('Archived CSV bytes, source-term offerings and every preserved table (groups, links, meetings, allocations, enrollments, attendance, claims, snapshots, placements, courses, terms, term context) are identical after the whole flow.');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/review.json`, JSON.stringify({ captures, checks, errors }, null, 2));
    console.log(`CRS-01B browser review passed: ${captures.length} captures.`);
  } catch (error) {
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); throw error;
  } finally { await browser.close(); await client.end(); }
})().catch(error => { console.error(error); process.exit(1); });
