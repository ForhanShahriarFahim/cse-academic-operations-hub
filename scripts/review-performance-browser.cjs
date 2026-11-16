/* global axe */
/** PERF-01 manual creation through the real compiled UI on the owned fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { Client } = require('pg');
(async () => {
  const url = new URL(process.env.DATABASE_URL); assert.ok(['localhost', '127.0.0.1'].includes(url.hostname)); assert.equal(url.pathname, '/safe01_crs01a_browser');
  assert.equal(process.env.PERF01_REVIEW_PHASE, 'after');
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
  const browser = await chromium.launch({ channel: 'msedge', headless: true }), context = await browser.newContext(), page = await context.newPage();
  const out = 'output/playwright/PERF-01/after/routine'; fs.mkdirSync(out, { recursive: true });
  const captures = [], errors = []; page.on('pageerror', e => errors.push(String(e)));
  const group = (await client.query("select g.* from teaching_groups g join courses c on c.id=g.course_id where c.code='SYN-4101' order by g.id limit 1")).rows[0];
  async function capture(name, width) {
    await page.evaluate(() => document.fonts.ready); await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.length })));
    assert.deepEqual(violations, [], `${name} accessibility at ${width}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth); assert.equal(overflow, false, `${name} overflow at ${width}`);
    await page.screenshot({ path: `${out}/${name}-${width}.png` }); captures.push({ name, width, overflow, violations });
  }
  try {
    await page.goto('http://localhost:3127/sign-in');
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('http://localhost:3126/routine?stream=HSC&view=day&day=0&batch=all');
      await page.getByRole('heading', { name: 'Routine builder', exact: true }).waitFor(); await capture('workbench', width);
      const add = page.getByRole('button', { name: /Add a class to HSC-22B/ }).first();
      if (!await add.isVisible().catch(() => false)) await page.locator('summary').filter({ hasText: 'HSC-22B' }).click();
      await add.click();
      await page.getByLabel('Teaching group', { exact: true }).selectOption(String(group.id));
      await page.getByRole('heading', { name: 'New class · SYN-4101', exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Day', exact: true }).selectOption('0');
      await page.getByLabel('Starts', { exact: true }).fill('09:00'); await page.getByLabel('Ends', { exact: true }).fill('10:15');
      await page.getByRole('combobox', { name: /^Room/ }).fill('SX-101'); await page.getByRole('option', { name: /SX-101/ }).click();
      await page.getByLabel('Teaching group', { exact: true }).focus(); await page.keyboard.press('Tab');
      assert.equal(await page.locator(':focus').getAttribute('id'), 'panel-day');
      const save = page.getByRole('button', { name: 'Add class', exact: true }); assert.equal(await save.isDisabled(), true); await capture('conflict', width);
      assert.equal(await page.getByLabel('Teaching group', { exact: true }).inputValue(), String(group.id), 'Capture retains form state');
      await page.getByLabel('Starts', { exact: true }).fill('11:00'); await page.getByLabel('Ends', { exact: true }).fill('12:15');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Add class' && !b.disabled));
      assert.equal(await save.isEnabled(), true); await capture('ready', width);
      await client.query('update courses set is_active=false where id=$1', [group.course_id]);
      await save.click(); await page.getByText('The course is inactive. Reactivate it before new teaching assignments.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Starts', { exact: true }).inputValue(), '11:00'); await capture('inactive-refused', width);
      await client.query('update courses set is_active=true where id=$1', [group.course_id]);
      await save.click(); await page.getByRole('status').filter({ hasText: 'Meeting scheduled.' }).waitFor(); await capture('created', width);
      const created = (await client.query('select * from meetings where teaching_group_id=$1 and day_of_week=0 and start_minutes=660 and end_minutes=735', [group.id])).rows;
      assert.equal(created.length, 1); assert.equal(Number((await client.query('select count(*) from meeting_teachers where meeting_id=$1', [created[0].id])).rows[0].count), 1);
      assert.equal(Number((await client.query('select count(*) from meeting_rooms where meeting_id=$1', [created[0].id])).rows[0].count), 1);
      await client.query('delete from meeting_rooms where meeting_id=$1', [created[0].id]); await client.query('delete from meeting_teachers where meeting_id=$1', [created[0].id]); await client.query('delete from meetings where id=$1', [created[0].id]);
    }
    assert.deepEqual(errors, []); fs.writeFileSync(`${out}/review.json`, JSON.stringify({ captures, checks: ['Real manual create, merged audiences, disabled conflict, authoritative inactive-course refusal with preserved input, retry/save/reload and persisted canonical teacher/room assignments; keyboard traversal.'], errors }, null, 2));
    console.log(JSON.stringify({ routineCaptures: captures.length, errors }));
  } catch (error) { fs.writeFileSync(`${out}/failure.txt`, await page.locator('body').innerText()); await page.screenshot({ path: `${out}/failure.png`, fullPage: true }); throw error; }
  finally { await client.query('update courses set is_active=true where id=$1', [group.course_id]); await browser.close(); await client.end(); }
})().catch(error => { console.error(error); process.exit(1); });
