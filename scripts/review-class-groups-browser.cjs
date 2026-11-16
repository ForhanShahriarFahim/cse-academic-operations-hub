/* global axe */
/** Guarded synthetic production QA for CRS-01C, launched only by review-class-groups.ts --check. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { chromium } = require('playwright');
const { Client } = require('pg');
(async () => {
  const target = new URL(process.env.DATABASE_URL); assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname)); assert.equal(target.pathname, '/safe01_crs01c_browser');
  const fall = Number(process.env.CRS01C_FALL_ID); assert.ok(Number.isSafeInteger(fall) && fall > 0);
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), context = await browser.newContext(), page = await context.newPage();
  const base = 'http://localhost:3126', control = 'http://localhost:3127', out = 'output/playwright/CRS-01C/runtime'; fs.mkdirSync(out, { recursive: true });
  const captures = [], errors = [], checks = [], hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); page.on('pageerror', error => errors.push(String(error)));
  const preserved = ['schedule_versions', 'attendance_sessions', 'attendance_records', 'extra_load_classes', 'meetings', 'meeting_teachers', 'meeting_rooms', 'course_enrollments', 'course_offerings', 'batch_term_placements', 'courses', 'teachers', 'academic_terms', 'term_context'];
  const snapshot = async () => { const result = {}; for (const table of preserved) result[table] = hash((await client.query(`select * from ${table} order by id`)).rows); return result; };
  const before = await snapshot();
  const summer = (await client.query("select * from academic_terms where status='active'")).rows[0], version = (await client.query('select * from schedule_versions order by id limit 1')).rows[0];
  const archive = `${base}/terms/${summer.id}/publications/${version.id}`, list = `/terms/${fall}/groups`;
  const id = async (sql, params = []) => (await client.query(sql, params)).rows[0]?.id;
  const course = code => id('select id from courses where code=$1', [code]);
  const offering = (term, code, stream, label) => id('select o.id from course_offerings o join courses c on c.id=o.course_id join batches b on b.id=o.batch_id where o.term_id=$1 and c.code=$2 and b.stream=$3 and b.label=$4', [term, code, stream, label]);
  const groupFor = offeringId => id('select teaching_group_id as id from teaching_group_offerings where offering_id=$1', [offeringId]);
  const allocations = async groupId => (await client.query('select t.short_code, a.units, a.allocation_method from workload_allocations a join teachers t on t.id=a.teacher_id where a.teaching_group_id=$1 order by t.short_code', [groupId])).rows.map(r => `${r.short_code}:${r.units}:${r.allocation_method}`);
  async function capture(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.evaluate(() => document.fonts.ready); await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')).slice(0, 4) })));
      assert.deepEqual(violations, [], `${name} accessibility ${width}`); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false, `${name} overflow ${width}`);
      await page.screenshot({ path: `${out}/${name}-${width}.png`, fullPage: true }); captures.push({ name, width, overflow, violations });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const heading = name => page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  async function navigate(route, name) { await page.goto(base + route); await (name ? heading(name) : page.locator('main h1').waitFor()); }
  const press = name => page.getByRole('button', { name, exact: true }).click();
  const csvOf = async () => { const response = await page.request.get(archive + '/export'); assert.ok(response.ok()); return response.body(); };
  const LIST = 'Class groups — Fall 2026';
  try {
    // Sign in lands on the prepared draft's class groups: nothing grouped yet.
    await page.goto(control + '/sign-in'); await heading(LIST); await capture('list-empty');
    assert.ok(await page.getByText('viewing it does not change the active term').isVisible()); assert.ok(await page.getByText('No class group yet. Create one from an offering below.').isVisible());
    const csvBefore = await csvOf();
    const theory = await course('SYN-4101'), sessional = await course('SYN-4102'), elective = await course('SYN-4103');
    const hscTheory = await offering(fall, 'SYN-4101', 'HSC', '23A'), dipTheory = await offering(fall, 'SYN-4101', 'DIPLOMA', '22B'), hscLab = await offering(fall, 'SYN-4102', 'HSC', '23A');

    // Create a merged class: validation keeps ticks, teachers and units; then one group with two links.
    await page.getByRole('link', { name: 'Create class group for SYN-4101, HSC-23A', exact: true }).click(); await heading('Create class group');
    assert.ok(await page.getByLabel('HSC-23A · Semester 7', { exact: true }).isChecked(), 'the chosen offering is preselected'); await capture('new');
    await page.getByLabel('DIP-22B · Semester 4', { exact: true }).check(); await page.getByText('One merged class for 2 cohorts.').waitFor();
    await press('Add a teacher'); await page.getByLabel('Teacher 1', { exact: true }).selectOption({ label: 'SYA · Synthetic Teacher A' });
    assert.equal(await page.locator('#cg-units-0').inputValue(), '3.00', 'units suggested from the last recorded allocation'); await page.getByText('This term: 0.00 →').waitFor();
    await press('Add another teacher'); await page.getByLabel('Teacher 2', { exact: true }).selectOption({ label: 'SYB · Synthetic Teacher B' });
    assert.equal(await page.getByLabel('Teacher 2', { exact: true }).locator('option', { hasText: 'SYA' }).count(), 0, 'a teacher already chosen is not offered twice');
    assert.equal(await page.locator('#cg-minutes').inputValue(), '150'); assert.ok(await page.getByText('Suggested from SYN-4101 in Summer 2026.').isVisible());
    await press('Create class group'); await page.getByText('Choose how the teachers are credited.', { exact: true }).waitFor();
    assert.ok(await page.getByLabel('DIP-22B · Semester 4', { exact: true }).isChecked(), 'ticks survive validation'); assert.equal(await page.locator('#cg-units-1').inputValue(), '3.00', 'teachers survive validation'); await capture('new-validation');
    assert.equal(await groupFor(hscTheory), undefined);
    await page.getByLabel('Each is credited in full', { exact: true }).check(); await press('Create class group');
    await heading(LIST); await page.getByText('Class group created for SYN-4101', { exact: false }).waitFor(); await capture('list-created');
    const merged = await groupFor(hscTheory); assert.ok(merged); assert.equal(await groupFor(dipTheory), merged, 'one class group for both cohorts');
    assert.deepEqual(await allocations(merged), ['SYA:3.00:shared_policy', 'SYB:3.00:shared_policy']);
    checks.push('A merged class for two cohorts with two teachers was created after a validation round that kept every tick, teacher and unit; units and weekly minutes were suggested from the previous term and shown with their source.');

    // A vacancy is allowed.
    await navigate(`${list}/new?course=${sessional}&offering=${hscLab}`, 'Create class group'); assert.ok(await page.getByText('No teacher yet. Saving like this records a vacancy.').isVisible());
    await press('Create class group'); await heading(LIST); await page.getByText('Class group created for SYN-4102', { exact: false }).waitFor();
    const vacancy = await groupFor(hscLab); assert.ok(vacancy); assert.deepEqual(await allocations(vacancy), []); await navigate(`${list}?state=vacancy`); await capture('list-vacancy');
    assert.ok(await page.getByText('Synthetic Sessional').isVisible()); assert.equal(await page.getByText('Synthetic Theory', { exact: true }).count(), 0, 'the state filter narrows rows');

    // Change units: a reason is required, entries survive, then the split is saved.
    await navigate(`${list}/${merged}`, 'SYN-4101 for DIP-22B and HSC-23A'); await capture('group');
    await page.locator('#cg-units-0').fill('1.50'); await page.locator('#cg-units-1').fill('1.50'); await page.getByLabel('The units are split between them', { exact: true }).check();
    await press('Save changes'); await page.getByText('Enter a reason for this change.', { exact: true }).waitFor();
    assert.equal(await page.locator('#cg-units-1').inputValue(), '1.50'); assert.ok(await page.getByLabel('The units are split between them', { exact: true }).isChecked()); await capture('group-validation');
    await page.locator('#cg-reason').fill('Teachers share the class equally'); await press('Save changes'); await heading(LIST); await page.getByText('Class group for SYN-4101', { exact: false }).waitFor();
    assert.deepEqual(await allocations(merged), ['SYA:1.50:split', 'SYB:1.50:split']);
    checks.push('Changing units needed a reason; the entered units and crediting choice survived the validation round and were then saved as a split.');

    // Stale: the record changes underneath an open form.
    await navigate(`${list}/${merged}`, 'SYN-4101 for DIP-22B and HSC-23A');
    await client.query("update workload_allocations set units='2.00' where teaching_group_id=$1 and teacher_id=(select id from teachers where short_code='SYB')", [merged]);
    await page.locator('#cg-units-0').fill('2.00'); await page.locator('#cg-reason').fill('Synthetic stale edit'); await press('Save changes');
    await page.getByText('This class group changed since you opened this page. Review the current details before saving.', { exact: true }).waitFor(); await capture('group-stale');
    assert.deepEqual(await allocations(merged), ['SYA:1.50:split', 'SYB:2.00:split']); checks.push('A stale edit is refused with the plain stale message; nothing is saved and the entries stay on screen.');

    // Remove the unused vacancy group: typed code and reason.
    await navigate(`${list}/${vacancy}`, 'SYN-4102 for HSC-23A'); await capture('group-unused');
    await press('Remove class group'); await page.getByText('Type the course code to confirm removal.', { exact: true }).waitFor();
    await page.getByLabel('Type SYN-4102 to confirm', { exact: true }).fill('SYN-4102'); await page.locator('#cg-remove-reason').fill('Created too early'); await press('Remove class group');
    await heading(LIST); await page.getByText('was removed. Its offerings are unchanged.', { exact: false }).waitFor(); assert.equal(await groupFor(hscLab), undefined);
    assert.ok(await page.getByRole('link', { name: 'Create class group for SYN-4102, HSC-23A', exact: true }).isVisible(), 'its offering is waiting again');
    checks.push('An unused class group was removed with the typed course code and a reason; its offering returned to the ungrouped list.');

    // Keyboard and history.
    await navigate(`${list}/new?course=${theory}`); await page.locator('#cg-course').focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'cg-external', 'no cohort left for this course: focus moves on to the next field');
    await navigate(`${list}/new?course=${sessional}`, 'Create class group'); await page.locator('#cg-course').focus(); await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'offering', 'cohort ticks follow the course in tab order');
    await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => document.activeElement?.checked), false, 'a tick is operable from the keyboard');
    await navigate(`${list}/history`, 'Change history'); await capture('history');
    for (const text of ['Class group created', 'Class group changed', 'Class group removed', 'Reason: Created too early', 'Reason: Teachers share the class equally', 'units split between them']) assert.ok(await page.getByText(text, { exact: false }).first().isVisible(), text);
    assert.equal(await page.getByText('@example.invalid').count(), 0, 'no actor email in history');
    await navigate(list); await page.pdf({ path: `${out}/class-groups.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true });

    // Active term: used groups are protected; a new group joins the existing completeness report.
    await navigate(`/terms/${summer.id}/groups`, 'Class groups — Summer 2026'); await capture('active-term');
    for (const text of ['This is the active term.', 'Partially scheduled', 'EEE-22B · outside audience · count unknown']) assert.ok(await page.getByText(text, { exact: false }).first().isVisible(), text);
    const used = await groupFor(await offering(summer.id, 'SYN-4101', 'HSC', '22B'));
    await navigate(`/terms/${summer.id}/groups/${used}`); await page.getByText('The audience is fixed because this class group is already in use.', { exact: false }).waitFor(); await capture('group-used');
    assert.ok(await page.getByText('This class group cannot be removed.').isVisible()); assert.equal(await page.getByRole('button', { name: 'Remove class group', exact: true }).count(), 0);
    assert.ok(await page.getByText('Teaches a scheduled class of this group, so cannot be removed here.', { exact: false }).first().isVisible()); assert.ok(await page.getByText('Summer 2026 is the active term.').isVisible());
    const open = await offering(summer.id, 'SYN-4103', 'HSC', '22B');
    await navigate(`/terms/${summer.id}/groups/new?course=${elective}&offering=${open}`, 'Create class group');
    await press('Add a teacher'); await page.getByLabel('Teacher 1', { exact: true }).selectOption({ label: 'SYB · Synthetic Teacher B' });
    assert.equal(await page.locator('#cg-units-0').inputValue(), '3.00'); assert.ok(await page.getByText("Suggested 3.00 from this course's catalog credits.", { exact: false }).isVisible());
    await page.locator('#cg-units-0').fill('12.50'); await page.getByText("Above this teacher's advisory limit", { exact: false }).waitFor(); await capture('new-active');
    await page.locator('#cg-units-0').fill('3.00'); await page.locator('#cg-meetings').fill('2'); await page.locator('#cg-minutes').fill('150'); await press('Create class group');
    await heading('Class groups — Summer 2026'); await page.getByText('Class group created for SYN-4103', { exact: false }).waitFor();
    const fresh = await groupFor(open); assert.deepEqual(await allocations(fresh), ['SYB:3.00:sole']);
    await navigate(`/terms/${summer.id}/groups/${fresh}`, 'SYN-4103 for HSC-22B'); assert.ok(await page.getByText('Not scheduled · 0 classes · 0 minutes').isVisible());
    await page.getByRole('link', { name: 'Schedule in Routine builder', exact: true }).click(); await page.waitForURL(/\/routine/); await heading('Routine builder');
    await navigate('/courses', 'Courses & offerings'); assert.ok(await page.getByRole('link', { name: 'Fall 2026 class groups', exact: true }).isVisible()); assert.ok(await page.getByRole('link', { name: 'Summer 2026 class groups', exact: true }).isVisible());
    const row = page.locator('tr', { hasText: 'SYN-4103' }); await row.first().waitFor(); assert.ok(await row.first().getByText('Unscheduled').isVisible(), 'the new group is in the existing completeness report'); await capture('courses-links');
    await navigate(`/terms/${fall}/offerings`); assert.ok(await page.getByText('In 1 class group').first().isVisible()); assert.ok(await page.getByRole('link', { name: 'Class groups for SYN-4101', exact: true }).first().isVisible());
    checks.push('Active-term class groups that are in use show a fixed audience, a locked teacher and no remove control; a new active-term group shows the consequence notice, appears in the existing completeness report as unscheduled and links to the Routine builder.');

    // View-only account: data without controls, and editor pages are refused.
    await page.goto(control + '/viewer'); await heading(LIST); await capture('viewer');
    assert.ok(await page.getByText('View only').isVisible()); assert.ok(await page.getByText('SYA').first().isVisible(), 'viewers read teachers and units');
    for (const name of ['Create class group', 'Change history']) assert.equal(await page.getByRole('link', { name, exact: true }).count(), 0, name);
    assert.equal(await page.getByRole('link', { name: /^Open / }).count(), 0, 'no open-to-edit links');
    for (const route of [`${list}/new`, `${list}/history`, `${list}/${merged}`]) { await page.goto(base + route); await page.waitForURL(/\/forbidden/); }
    checks.push('A view-only account reads class groups, teachers and units with no controls; direct editor URLs redirect to the forbidden page.');

    // Preservation: published output and every table outside the class-group records are unchanged.
    await page.goto(control + '/sign-in'); await heading(LIST);
    assert.ok(Buffer.compare(csvBefore, await csvOf()) === 0, 'archived CSV bytes unchanged');
    assert.deepEqual(await snapshot(), before);
    checks.push('Archived CSV bytes and every preserved table (offerings, meetings and their teachers and rooms, enrollments, attendance, extra-load records, snapshots, placements, courses, teachers, terms, term context) are identical after the whole flow.');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${out}/review.json`, JSON.stringify({ captures, checks, errors }, null, 2));
    console.log(`CRS-01C browser review passed: ${captures.length} captures.`);
  } catch (error) {
    await page.screenshot({ path: `${out}/failure.png`, fullPage: true }).catch(() => {}); throw error;
  } finally { await browser.close(); await client.end(); }
})().catch(error => { console.error(error); process.exit(1); });
