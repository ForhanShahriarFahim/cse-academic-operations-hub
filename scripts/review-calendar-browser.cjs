/* global axe */
/**
 * CAL-01 browser review against the disposable `npm run ux:review` server on :3100
 * (synthetic reviewer, disposable PGlite). Never point it at institutional data.
 *   node scripts/review-calendar-browser.cjs
 * Screenshots and the A4 PDF go to .tmp/cal-01/ (ignored by Git).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const base = 'http://localhost:3100', out = path.join('.tmp', 'cal-01'); fs.mkdirSync(out, { recursive: true });
const session = JSON.parse(fs.readFileSync(path.join('.tmp', 'ux-review', 'session.local.json'), 'utf8'));
const checks = [], errors = [];
const ok = line => { checks.push(line); console.log('ok -', line); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const cookie = value => [{ name: 'better-auth.session_token', value: decodeURIComponent(value), url: base, sameSite: 'Lax' }];
  const context = await browser.newContext(); await context.addCookies(cookie(session.cookie));
  const page = await context.newPage(); page.setDefaultTimeout(180000); page.on('pageerror', error => errors.push(String(error)));
  const term = 1, cal = `/terms/${term}/calendar`;
  const go = async (route, h1) => { await page.goto(base + route); await page.getByRole('heading', { level: 1, name: h1 }).waitFor(); await page.waitForFunction(() => { const f = document.querySelector('main form'); return !f || Object.keys(f).some(k => k.startsWith('__react')); }); };
  async function capture(name) {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 }); await page.evaluate(() => document.fonts.ready); await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`));
      assert.deepEqual(violations, [], `${name} axe at ${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflow at ${width}px`);
      await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    ok(`${name}: no axe WCAG 2.1 AA violations and no page-wide overflow at 1440, 390 and 320 px`);
  }
  const save = async label => { await page.getByRole('button', { name: label, exact: true }).click(); };
  const added = async () => { await page.waitForURL(url => url.pathname === cal && url.searchParams.has('done')); await page.getByRole('heading', { level: 1, name: 'Academic calendar' }).waitFor(); };
  const entry = async ({ kind, title, start, end = start, effect, source = 'Synthetic review notice', url }) => {
    await go(`${cal}/new`, 'Add calendar entry');
    await page.getByRole('radio', { name: kind, exact: true }).check();
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Start date', { exact: true }).fill(start); await page.getByLabel('End date', { exact: true }).fill(end);
    if (effect) await page.getByRole('radio', { name: effect, exact: true }).check();
    await page.getByLabel('Source reference', { exact: true }).fill(source);
    if (url) await page.getByLabel('Public source link (optional)', { exact: true }).fill(url);
    await save('Save entry'); await added();
  };
  try {
    // Empty state.
    await go(cal + '?date=2026-08-14', 'Academic calendar');
    assert.ok(await page.getByText('Teaching dates have not been recorded.').first().isVisible());
    assert.ok(await page.getByText('No calendar entries have been recorded for this term.').isVisible());
    await capture('empty');

    // Teaching dates: a failed save keeps every value, marks the field and moves focus to the summary.
    await go(`${cal}/teaching`, 'Record teaching dates');
    await page.getByLabel('First regular class day').fill('2026-06-07'); await page.getByLabel('Last regular class day').fill('2026-06-01');
    await page.getByLabel('Source reference').fill('Synthetic review circular 01, 1 June 2026');
    await save('Save teaching dates');
    await page.getByText('The last class day must be on or after the first class day.').waitFor();
    assert.equal(await page.getByLabel('First regular class day').inputValue(), '2026-06-07');
    assert.equal(await page.getByLabel('Last regular class day').inputValue(), '2026-06-01');
    assert.equal(await page.getByLabel('Source reference').inputValue(), 'Synthetic review circular 01, 1 June 2026');
    assert.equal(await page.getByLabel('Last regular class day').getAttribute('aria-invalid'), 'true');
    assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /Check the highlighted teaching dates/);
    await capture('teaching-error');
    ok('Failed teaching save keeps all values, marks the field invalid and focuses the announced summary');
    await page.getByLabel('Last regular class day').fill('2026-09-24'); await save('Save teaching dates'); await added();
    assert.ok(await page.getByText('Regular teaching dates saved: 7 June – 24 September 2026.').isVisible());

    // Entries of every type, including an exam beyond teaching and an overlapping exam and holiday.
    await go(`${cal}/new`, 'Add calendar entry');
    await page.getByRole('radio', { name: 'Midterm period', exact: true }).check();
    await page.getByLabel('Title', { exact: true }).fill('Midterm examinations'); await page.getByLabel('Start date').fill('2026-07-26'); await page.getByLabel('End date').fill('2026-08-01');
    await page.getByLabel('Source reference').fill('Exam office notice 04, 10 July 2026'); await save('Save entry');
    await page.getByText('Choose whether regular classes continue during this exam period.').waitFor();
    assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), 'Midterm examinations');
    ok('Missing exam effect is refused with the entered values kept');
    await page.getByRole('radio', { name: 'Regular classes may continue', exact: true }).check(); await save('Save entry'); await added();
    await entry({ kind: 'University holiday', title: 'Ashura', start: '2026-07-28', source: 'Academic office notice 07, 20 July 2026', url: 'https://example.invalid/notices/07' });
    await entry({ kind: 'Public holiday', title: 'National Mourning Day', start: '2026-08-15' });
    await entry({ kind: 'Class suspension', title: 'Campus closure for maintenance of the main academic building and its electrical systems', start: '2026-08-20', end: '2026-08-21', source: 'Registrar office notice 112 regarding temporary closure of the main academic building, 12 August 2026' });
    await entry({ kind: 'Final period', title: 'Final examinations', start: '2026-10-01', end: '2026-10-15', effect: 'Regular classes suspended' });
    // A semantic duplicate is refused.
    await go(`${cal}/new`, 'Add calendar entry');
    await page.getByRole('radio', { name: 'Public holiday', exact: true }).check(); await page.getByLabel('Title', { exact: true }).fill('  national   MOURNING day ');
    await page.getByLabel('Start date').fill('2026-08-15'); await page.getByLabel('End date').fill('2026-08-15'); await page.getByLabel('Source reference').fill('Another copy'); await save('Save entry');
    await page.getByText(/already recorded/).waitFor(); ok('A case- and whitespace-variant duplicate is refused with field feedback');
    await capture('entry-error');

    // Lookup on the saved calendar.
    await go(cal + '?date=2026-07-28', 'Academic calendar');
    const status = page.locator('section[aria-labelledby="cal-check"]');
    assert.match(await status.innerText(), /Regular classes suspended[\s\S]*Midterm examinations[\s\S]*Ashura · University holiday · closes regular classes/);
    await capture('calendar');
    await page.getByLabel('Date in Asia/Dhaka').fill('2026-07-27'); await page.getByRole('button', { name: 'Check', exact: true }).click(); await page.waitForURL(/date=2026-07-27/);
    assert.match(await page.locator('section[aria-labelledby="cal-check"]').innerText(), /Within regular teaching dates/);
    await page.goto(base + cal + '?date=2026-10-05'); assert.match(await page.locator('section[aria-labelledby="cal-check"]').innerText(), /Regular classes suspended[\s\S]*Final examinations/);
    await page.goto(base + cal + '?date=2026-05-03'); assert.match(await page.locator('section[aria-labelledby="cal-check"]').innerText(), /Outside regular teaching dates/);
    ok('Lookup: overlapping exam and holiday is suspended with both shown; continuing exam day is within teaching; exam beyond teaching suspends; before teaching is outside');

    // Correction with reason, and a stale second editor keeps their values.
    const midtermId = await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent.includes('Midterm examinations'))?.getAttribute('href'));
    assert.ok(midtermId);
    const second = await context.newPage(); second.setDefaultTimeout(180000);
    await go(midtermId, 'Edit midterm period');
    await second.goto(base + midtermId); await second.getByRole('heading', { level: 1, name: 'Edit midterm period' }).waitFor(); await second.waitForFunction(() => Object.keys(document.querySelector('main form')).some(k => k.startsWith('__react')));
    await page.getByLabel('End date').first().fill('2026-08-02'); await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByText('Enter a reason for correcting this entry.').waitFor();
    await page.getByLabel('Reason for correction').first().fill('Exam office issued a revised notice.'); await page.getByRole('button', { name: 'Save changes' }).click(); await added();
    await second.getByLabel('Title', { exact: true }).fill('Midterm examinations (revised)'); await second.getByLabel('Reason for correction').first().fill('Second editor');
    await second.getByRole('button', { name: 'Save changes' }).click();
    await second.getByText(/The calendar changed since you opened it/).waitFor();
    assert.equal(await second.getByLabel('Title', { exact: true }).inputValue(), 'Midterm examinations (revised)');
    assert.ok(await second.getByRole('button', { name: 'Reload the current calendar' }).isVisible());
    await second.close();
    ok('Correction requires a reason; a second editor with an older form is told the calendar changed, keeps their values and is offered a reload');

    // Removal reviews the named entry.
    await go(cal, 'Academic calendar');
    const holidayHref = await page.evaluate(() => [...document.querySelectorAll('a')].find(a => a.textContent.includes('National Mourning Day'))?.getAttribute('href'));
    await go(holidayHref, 'Edit public holiday');
    assert.match(await page.locator('form[aria-labelledby="remove-entry"]').innerText(), /Public holiday “National Mourning Day” \(15 August 2026\)/);
    await capture('edit-entry');
    await page.locator('form[aria-labelledby="remove-entry"]').getByLabel('Reason for correction').fill('Notice withdrawn'); await save('Remove entry'); await added();
    assert.equal(await page.getByText('National Mourning Day').count(), 1, 'only the success notice names the removed entry');

    // Keyboard: the add form is reachable and ordered by Tab.
    await go(`${cal}/new`, 'Add calendar entry');
    await page.getByRole('radio', { name: 'Public holiday', exact: true }).focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.value), 'university_holiday');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.name), 'title');
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement?.name), 'startDate');
    ok('Keyboard: type radios move with arrows and Tab proceeds to title then start date');

    // History.
    await go(`${cal}/history`, 'Change history');
    const history = await page.locator('section[aria-label="Calendar changes"]').innerText();
    assert.match(history, /Calendar entry removed[\s\S]*Reason: Notice withdrawn/); assert.match(history, /Calendar entry corrected[\s\S]*Reason: Exam office issued a revised notice\./); assert.match(history, /Teaching dates recorded/);
    await capture('history');

    // Enough entries for a continued A4 page, then the native print.
    for (let i = 1; i <= 16; i++) await entry({ kind: 'Class suspension', title: `Synthetic suspension ${String(i).padStart(2, '0')} with a deliberately long display title for wrapping`, start: `2026-09-${String(i).padStart(2, '0')}`, source: `Synthetic notice ${i}, a long source reference that names the issuing office and the notice date to test wrapping` });
    await go(`${cal}/print`, /Academic calendar — /);
    await capture('print-screen');
    const screenRows = await page.locator('.term-calendar-table tbody tr').count();
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.locator('.no-print').first().isVisible(), false, 'controls are hidden in print');
    await page.pdf({ path: path.join(out, 'calendar-a4.pdf'), preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await go(cal, 'Academic calendar'); const listed = await page.locator('section[aria-labelledby="cal-entries"] li').count();
    assert.equal(screenRows, listed, 'print rows match the screen projection');
    ok(`A4 print lists all ${listed} saved entries (matching the screen), hides controls, and was saved as a PDF`);

    // View-only teacher.
    const viewer = await browser.newContext(); await viewer.addCookies(cookie(session.teacherCookie)); const v = await viewer.newPage(); v.setDefaultTimeout(180000);
    await v.goto(base + cal); await v.getByRole('heading', { level: 1, name: 'Academic calendar' }).waitFor();
    assert.ok(await v.getByText(/You can view and print this calendar/).isVisible());
    assert.equal(await v.getByRole('link', { name: 'Add calendar entry' }).count(), 0); assert.equal(await v.getByRole('link', { name: 'Change history' }).count(), 0); assert.equal(await v.getByRole('link', { name: /^Edit/ }).count(), 0);
    await v.goto(base + `${cal}/new`); await v.waitForURL(/\/forbidden/);
    await viewer.close();
    ok('A teacher sees the calendar view-only, without add, edit or history, and the add page is forbidden');

    assert.deepEqual(errors, [], 'no page errors');
    fs.writeFileSync(path.join(out, 'review.json'), JSON.stringify({ at: new Date().toISOString(), checks }, null, 2));
    console.log(`\nCAL-01 browser review passed (${checks.length} checks). Evidence in ${out}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
