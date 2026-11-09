/* ========================================
   EduPlanner smoke tests
   Run: npm test   (needs Playwright + Chromium)
   Serves the repo root on a local port and drives the app in Chromium.
   ======================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png'
};

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const DAY_MS = 86400000;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ---------- Checks without a browser ----------
test('app.js and sw.js have the same APP_VERSION, listed in CHANGELOG.md', async () => {
  const version = (file) => (fs.readFileSync(path.join(ROOT, file), 'utf8').match(/APP_VERSION = '([^']+)'/) || [])[1];
  assert.ok(version('app.js'), 'APP_VERSION found in app.js');
  assert.strictEqual(version('sw.js'), version('app.js'), 'sw.js APP_VERSION matches app.js');
  assert.ok(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').includes('## ' + version('app.js')), 'CHANGELOG has this version');
});

test('every built-in task and UI string is translated', async () => {
  const sandbox = { window: {} };
  const load = (file) => new Function('window', fs.readFileSync(path.join(ROOT, file), 'utf8'))(sandbox.window);
  load('i18n.js');
  load('default-tasks.js');
  const { ui, tasks } = sandbox.window.EDU_I18N;
  const missing = [];
  for (const role of Object.values(sandbox.window.EDU_DEFAULT_TASKS)) {
    for (const list of Object.values(role)) {
      for (const text of list) {
        for (const lang of ['fr', 'pidgin']) if (!(tasks[text] && tasks[text][lang])) missing.push(lang + ': ' + text);
      }
    }
  }
  for (const lang of ['fr', 'pidgin']) {
    for (const key of Object.keys(ui.en)) if (!ui[lang][key]) missing.push(lang + ' ui: ' + key);
  }
  assert.deepStrictEqual(missing, []);
});

// Opens the app in a fresh context. External hosts (CDNs, analytics) are
// blocked so the tests are fast and deterministic.
async function openApp(browser, base, { query = '', initScript, serviceWorkers = 'block' } = {}, initArg) {
  const context = await browser.newContext({ serviceWorkers });
  if (initScript) await context.addInitScript(initScript, initArg === undefined ? DAY_MS : [DAY_MS, initArg]);
  const external = []; // URLs of blocked external requests, newest last
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => { errors.push('native ' + d.type() + ' dialog: ' + d.message()); d.dismiss(); });
  await page.goto(base + '/' + query);
  await page.waitForSelector('#task-list .task-item');
  return { context, page, errors, external };
}

// Fills the in-app dialog's fields by name, then presses OK (or Cancel)
async function answerDialog(page, values = {}, { cancel = false } = {}) {
  const dlg = page.locator('#app-dialog[open]');
  await dlg.waitFor();
  for (const [name, value] of Object.entries(values)) {
    const field = dlg.locator(`[name="${name}"]`);
    if (await field.evaluate((el) => el.tagName) === 'SELECT') await field.selectOption(value);
    else await field.fill(value);
  }
  await dlg.locator(cancel ? '#app-dialog-cancel' : '#app-dialog-ok').click();
  await dlg.waitFor({ state: 'hidden' });
}

test('loads with default tasks and no errors', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  assert.ok(await page.locator('#task-list .task-item').count() > 0, 'tasks rendered');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('adds a task', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.fill('#new-task-input', 'Smoke test task');
  await page.press('#new-task-input', 'Enter');
  await page.getByText('Smoke test task').waitFor();
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('adds and completes a subtask', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.locator('#task-list .task-item').first().locator('.add-subtask-btn').click();
  await answerDialog(page, { value: 'Print handouts' });
  const sub = page.locator('#task-list .task-item').first().locator('.subtask-check');
  await sub.check();
  assert.ok(await page.locator('#task-list .task-item').first().locator('.subtask-check').isChecked());
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('shared link cannot inject HTML', async (browser, base) => {
  const payload = {
    role: 'teacher',
    data: [{ text: 'Imported task', freq: 'daily', dueDate: '<img src=x onerror="window.__pwned=1">' }]
  };
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(payload))).toString('base64');
  const { context, page, errors } = await openApp(browser, base, { query: '?import=' + encodeURIComponent(encoded) });
  await answerDialog(page);
  await page.getByText('Imported task').waitFor();
  assert.strictEqual(await page.evaluate(() => window.__pwned), undefined);
  assert.strictEqual(await page.locator('#task-list img').count(), 0);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('rejects an invalid backup file', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const before = await page.locator('#task-list .task-item').count();
  await page.setInputFiles('#import-backup-input', {
    name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"teacher": "nope"}')
  });
  await page.getByText('Error restoring backup').waitFor();
  assert.strictEqual(await page.locator('#task-list .task-item').count(), before);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('adds a custom role without reloading', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.evaluate(() => { window.__noReload = true; });
  await page.click('#add-role-btn');
  await answerDialog(page, { value: 'Sports Coordinator' });
  await page.locator('.tab[data-role="sports_coordinator"].active').waitFor();
  assert.strictEqual(await page.evaluate(() => window.__noReload), true, 'page did not reload');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('works when the Notification API is missing (iOS Safari)', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base, {
    initScript: () => { delete window.Notification; }
  });
  assert.ok(await page.locator('#task-list .task-item').count() > 0);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('works offline after first visit', async (browser, base) => {
  const { context, page } = await openApp(browser, base, { serviceWorkers: 'allow' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // let the worker take control
  await page.waitForSelector('#task-list .task-item');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  await context.close();
});

test('fits a phone screen without sideways scrolling', async (browser, base) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  const page = await context.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#task-list .task-item');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  assert.ok(width <= 390, 'page is ' + width + 'px wide on a 390px phone');
  await context.close();
});

test('Quick Notes: opens from the keyboard and is a small button on phones', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.focus('#scratchpad-header');
  await page.keyboard.press('Enter');
  assert.ok(await page.locator('#scratchpad-textarea').isVisible(), 'opened with Enter');
  assert.strictEqual(await page.getAttribute('#scratchpad-header', 'aria-expanded'), 'true');
  await page.keyboard.type('Buy chalk');
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.strictEqual(await page.inputValue('#scratchpad-textarea'), 'Buy chalk', 'notes saved');
  await page.setViewportSize({ width: 375, height: 812 });
  const box = await page.locator('#scratchpad-container').boundingBox();
  assert.ok(box.width <= 50 && box.height <= 50, 'compact on phones: ' + JSON.stringify(box));
  assert.deepStrictEqual(errors, []);
  await context.close();
});

// ---------- Editing & dialogs ----------
test('edits a task: text, frequency, due date and tag', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const first = page.locator('#task-list .task-item').first();
  await first.hover();
  await first.locator('.task-edit').click();
  assert.strictEqual(await page.inputValue('#app-dialog [name="text"]'), 'Review lesson plan for today');
  const box = await page.locator('#app-dialog').boundingBox();
  const vw = page.viewportSize().width;
  assert.ok(Math.abs(box.x + box.width / 2 - vw / 2) < 2, 'dialog is centred');
  await answerDialog(page, { text: 'Review **Year 9** lesson plan', freq: 'weekly', dueDate: '2026-12-01', tag: '#urgent' });
  await page.click('.freq-tab[data-freq="weekly"]');
  const edited = page.locator('#task-list .task-item', { hasText: 'Year 9' });
  await edited.waitFor();
  assert.strictEqual(await edited.locator('strong').textContent(), 'Year 9');
  assert.strictEqual((await edited.locator('.task-tag').textContent()).trim(), 'urgent');
  await page.reload();
  await page.click('.freq-tab[data-freq="weekly"]');
  await page.locator('#task-list .task-item', { hasText: 'Year 9' }).waitFor();
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('edit dialog: Cancel, Escape and empty text change nothing', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const first = page.locator('#task-list .task-item').first();
  await first.hover();
  await first.locator('.task-edit').click();
  await answerDialog(page, { text: 'Should not be saved' }, { cancel: true });
  await first.hover();
  await first.locator('.task-edit').click();
  await page.fill('#app-dialog [name="text"]', 'Also not saved');
  await page.keyboard.press('Escape');
  await page.locator('#app-dialog[open]').waitFor({ state: 'hidden' });
  await first.hover();
  await first.locator('.task-edit').click();
  await page.fill('#app-dialog [name="text"]', '   ');
  await page.click('#app-dialog-ok');
  assert.ok(await page.locator('#app-dialog[open]').isVisible(), 'stays open when text is empty');
  assert.strictEqual(await page.getAttribute('#app-dialog [name="text"]', 'aria-invalid'), 'true');
  await page.keyboard.press('Escape');
  assert.strictEqual((await first.locator('.task-text').textContent()).trim(), 'Review lesson plan for today');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('saving a built-in task unchanged keeps it translatable', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base, {
    initScript: () => localStorage.setItem('eduplanner_lang', 'fr')
  });
  const first = page.locator('#task-list .task-item').first();
  await first.hover();
  await first.locator('.task-edit').click();
  assert.strictEqual(await page.inputValue('#app-dialog [name="text"]'), 'Revoir le plan de cours du jour');
  await answerDialog(page, { tag: 'cours' });
  await page.getByText('Tâche modifiée').waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_tasks')).teacher[0]);
  assert.strictEqual(stored.text, 'Review lesson plan for today', 'still stored in English');
  assert.strictEqual(stored.tag, 'cours');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('removes a subtask', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const first = page.locator('#task-list .task-item').first();
  await first.locator('.add-subtask-btn').click();
  await answerDialog(page, { value: 'Wrong subtask' });
  await first.locator('.subtask-remove').click();
  assert.strictEqual(await first.locator('.subtask-check').count(), 0);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('emptying Recently deleted asks first', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const first = page.locator('#task-list .task-item').first();
  await first.hover();
  await first.locator('.task-delete').click();
  await page.click('#trash-btn');
  await page.locator('#trash-list .trash-item').first().waitFor();
  await page.click('#trash-empty');
  await answerDialog(page, {}, { cancel: true });
  assert.strictEqual(await page.locator('#trash-list .trash-item').count(), 1, 'cancel keeps items');
  await page.click('#trash-empty');
  await answerDialog(page);
  await page.waitForFunction(() => document.querySelectorAll('#trash-list .trash-item').length === 0);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

// ---------- Data safety ----------
const DAY = 86400000;

test('deleted task appears in "Recently deleted" and can be restored', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const first = page.locator('#task-list .task-item').first();
  const text = (await first.locator('.task-text').textContent()).trim();
  await first.hover();
  await first.locator('.task-delete').click();
  await page.waitForFunction((t) => ![...document.querySelectorAll('#task-list .task-text')].some(e => e.textContent.trim() === t), text);
  await page.click('#trash-btn');
  await page.locator('#trash-list .trash-item', { hasText: text }).getByText('Restore').click();
  await page.locator('#task-list .task-text', { hasText: text }).waitFor();
  assert.strictEqual(await page.locator('#trash-list .trash-item').count(), 0);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('archive drops entries older than 30 days and keeps at most 200', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base, {
    initScript: (DAY) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      const old = { text: 'Ancient', freq: 'daily', role: 'teacher', deletedAt: new Date(Date.now() - 40 * DAY).toISOString() };
      const recent = Array.from({ length: 250 }, (_, i) => ({ text: 'Recent ' + i, freq: 'daily', role: 'teacher', deletedAt: new Date().toISOString() }));
      localStorage.setItem('eduplanner_archive', JSON.stringify([old, ...recent]));
    }
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_archive')));
  assert.strictEqual(stored.length, 200);
  assert.ok(!stored.some(e => e.text === 'Ancient'), 'old entry pruned');
  assert.strictEqual(stored[199].text, 'Recent 249', 'newest kept');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('backup includes roles and notes, and restores them on another device', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.click('#add-role-btn');
  await answerDialog(page, { value: 'Exams Officer' });
  await page.fill('#new-task-input', 'Collate exam scripts');
  await page.press('#new-task-input', 'Enter');
  await page.evaluate(() => localStorage.setItem('eduplanner_notes', 'Remember chalk'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-backup')]);
  const file = await download.path();
  const fileBuffer = fs.readFileSync(file); // the download is deleted when the context closes
  const backup = JSON.parse(fileBuffer.toString('utf8'));
  assert.strictEqual(backup.version, 2);
  assert.strictEqual(backup.customRoles.exams_officer, 'Exams Officer');
  assert.strictEqual(backup.notes, 'Remember chalk');
  assert.ok(await page.evaluate(() => Number(localStorage.getItem('eduplanner_last_backup')) > 0), 'backup date recorded');
  assert.deepStrictEqual(errors, []);
  await context.close();

  // Fresh device: restore the file
  const other = await openApp(browser, base);
  await other.page.setInputFiles('#import-backup-input', { name: 'backup.json', mimeType: 'application/json', buffer: fileBuffer });
  await answerDialog(other.page);
  await other.page.locator('.tab[data-role="exams_officer"]', { hasText: 'Exams Officer' }).click();
  await other.page.locator('#task-list .task-text', { hasText: 'Collate exam scripts' }).waitFor();
  assert.strictEqual(await other.page.inputValue('#scratchpad-textarea'), 'Remember chalk');
  assert.deepStrictEqual(other.errors, []);
  await other.context.close();
});

test('old-format backups still restore', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  const oldBackup = { teacher: [{ id: 'a', text: 'Old backup task', freq: 'daily', done: false }] };
  await page.setInputFiles('#import-backup-input', {
    name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldBackup))
  });
  await answerDialog(page);
  await page.locator('#task-list .task-text', { hasText: 'Old backup task' }).waitFor();
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('first visit offers to restore a backup; "No thanks" is remembered', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.locator('#data-notice[data-kind="restore-offer"]').waitFor();
  await page.click('#data-notice-secondary');
  assert.ok(await page.locator('#data-notice').isHidden());
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.ok(await page.locator('#data-notice').isHidden(), 'not shown again');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('reminds to back up after 14 days of changes; downloading clears it', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base, {
    initScript: (DAY) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_tasks', JSON.stringify({ teacher: [{ id: 'x', text: 'Existing task', freq: 'daily', done: false }] }));
      localStorage.setItem('eduplanner_first_use', String(Date.now() - 20 * DAY));
      localStorage.setItem('eduplanner_last_change', String(Date.now() - DAY));
    }
  });
  await page.locator('#data-notice[data-kind="backup-reminder"]').waitFor();
  await Promise.all([page.waitForEvent('download'), page.click('#data-notice-primary')]);
  assert.ok(await page.locator('#data-notice').isHidden());
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.ok(await page.locator('#data-notice').isHidden(), 'no reminder right after a backup');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('unreadable saved data is kept, not overwritten', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base, {
    initScript: () => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_tasks', '{not valid json');
    }
  });
  await page.locator('#data-notice[data-kind="unreadable"]').waitFor();
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('eduplanner_tasks_unreadable')), '{not valid json');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('warns when changes cannot be saved (storage full)', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'eduplanner_tasks') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return real.call(this, k, v);
    };
  });
  await page.fill('#new-task-input', 'Will not fit');
  await page.press('#new-task-input', 'Enter');
  await page.locator('#data-notice[data-kind="storage-error"]').waitFor();
  assert.deepStrictEqual(errors, []);
  await context.close();
});

// ---------- Languages ----------
// English UI strings that should never be visible once another language is chosen
async function leftoverEnglish(page, lang) {
  return page.evaluate((lang) => {
    // Toasts shown before the switch are still in the old language; ignore them
    document.getElementById('toast-container').replaceChildren();
    const { ui } = window.EDU_I18N;
    const english = Object.keys(ui.en)
      .filter(k => ui[lang][k] !== ui.en[k] && ui.en[k].length >= 3 && !ui.en[k].includes('{'))
      .map(k => ui.en[k]);
    const visible = [...document.querySelectorAll('body *')]
      .filter(el => el.offsetParent !== null || el.tagName === 'OPTION')
      .flatMap(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()))
      .concat([...document.querySelectorAll('[placeholder]')].map(el => el.placeholder))
      .concat([...document.querySelectorAll('[aria-label]')].map(el => el.getAttribute('aria-label')))
      .filter(Boolean);
    return english.filter(e => visible.includes(e));
  }, lang);
}

test('French: whole interface and built-in tasks are translated', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.fill('#new-task-input', 'My own task');
  await page.press('#new-task-input', 'Enter');
  await page.selectOption('#lang-select', 'fr');
  assert.strictEqual(await page.getAttribute('html', 'lang'), 'fr');
  assert.strictEqual(await page.textContent('.welcome-title'), 'Votre planificateur de tâches scolaires');
  await page.getByText("Faire l'appel en classe").waitFor();
  await page.getByText('My own task').waitFor(); // typed tasks are left as written
  assert.deepStrictEqual(await leftoverEnglish(page, 'fr'), [], 'English text left in French UI');
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.strictEqual(await page.inputValue('#lang-select'), 'fr', 'choice remembered');
  await page.getByText("Faire l'appel en classe").waitFor();
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('Pidgin: whole interface and built-in tasks are translated', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.selectOption('#lang-select', 'pidgin');
  assert.strictEqual(await page.getAttribute('html', 'lang'), 'pcm');
  await page.getByText('Mark class register').waitFor();
  await page.click('.freq-tab[data-freq="all"]');
  assert.deepStrictEqual(await leftoverEnglish(page, 'pidgin'), [], 'English text left in Pidgin UI');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('French browsers start in French; search finds translated tasks', async (browser, base) => {
  const context = await browser.newContext({ locale: 'fr-FR', serviceWorkers: 'block' });
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/');
  await page.waitForSelector('#task-list .task-item');
  assert.strictEqual(await page.inputValue('#lang-select'), 'fr');
  await page.fill('#search-input', 'appel');
  await page.getByText("Faire l'appel en classe").waitFor();
  assert.strictEqual(await page.locator('#task-list .task-item').count(), 1);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

// ---------- History & term report ----------
// Local "YYYY-MM-DD" n days ago (in the browser)
const isoDaysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

test('records the finished day in history before resetting it', async (browser, base) => {
  const yesterday = isoDaysAgo(1);
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, yesterday]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_tasks', JSON.stringify({ teacher: [
        { id: '1', text: 'Take class attendance', freq: 'daily', done: true },
        { id: '2', text: 'Mark and return assignments', freq: 'daily', done: false },
        { id: '3', text: 'Attend staff meeting', freq: 'weekly', done: true }
      ] }));
      localStorage.setItem('eduplanner_last_opened', JSON.stringify({ daily: yesterday, weekly: 'old-week', monthly: 'old-month' }));
    }
  }, yesterday);
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_history')));
  const daily = history.find(r => r.freq === 'daily');
  assert.strictEqual(daily.date, yesterday);
  assert.deepStrictEqual(daily.d, ['Take class attendance']);
  assert.deepStrictEqual(daily.p, ['Mark and return assignments']);
  const weekly = history.find(r => r.freq === 'weekly');
  assert.deepStrictEqual(weekly.d, ['Attend staff meeting'], 'ended week recorded too');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_tasks')).teacher);
  assert.strictEqual(stored[0].done, false, 'daily task reset');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('term report: summary, per-task rates, weeks and signature lines', async (browser, base) => {
  const days = [3, 4, 5, 10, 11].map(isoDaysAgo);
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, days]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_tasks', JSON.stringify({ teacher: [
        { id: '1', text: 'Take class attendance', freq: 'daily', done: false },
        { id: '2', text: 'Mark and return assignments', freq: 'daily', done: false }
      ] }));
      localStorage.setItem('eduplanner_history', JSON.stringify(days.map((date, i) => ({
        role: 'teacher', freq: 'daily', period: date, date,
        d: i < 4 ? ['Take class attendance'] : [],
        p: i < 4 ? ['Mark and return assignments'] : ['Take class attendance', 'Mark and return assignments']
      }))));
    }
  }, days);
  await page.click('#term-report-btn');
  const popupPromise = context.waitForEvent('page');
  await answerDialog(page, { staff: 'Ada Obi', school: 'Unity Secondary School', from: isoDaysAgo(30), to: isoDaysAgo(0) });
  const report = await popupPromise;
  await report.waitForLoadState('domcontentloaded');
  const text = await report.textContent('body');
  assert.ok(text.includes('Ada Obi') && text.includes('Unity Secondary School'), 'staff and school shown');
  // 5 recorded days; today is still in progress, so it isn't counted
  assert.ok(text.includes('4 of 5'), 'per-task rate: ' + text.slice(0, 2000));
  assert.ok(text.includes('0 of 5'), 'never-done task listed');
  assert.ok(await report.locator('.sig').count() === 3, 'three signature blocks');
  assert.ok(text.includes('Week of'), 'week-by-week section');
  assert.deepStrictEqual(errors, []);
  // Name and school are remembered for next time
  await page.click('#term-report-btn');
  assert.strictEqual(await page.inputValue('#app-dialog [name="school"]'), 'Unity Secondary School');
  await answerDialog(page, {}, { cancel: true });
  await context.close();
});

test('term report with no history shows a message, not an empty report', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  await page.click('#term-report-btn');
  await answerDialog(page, { role: 'teacher', from: isoDaysAgo(300), to: isoDaysAgo(200) });
  await page.getByText('No history yet').waitFor();
  assert.strictEqual(context.pages().length, 1, 'no report window opened');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('history is included in backups and restored', async (browser, base) => {
  const day = isoDaysAgo(2);
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, day]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_history', JSON.stringify([{ role: 'teacher', freq: 'daily', period: day, date: day, d: ['Take class attendance'], p: [] }]));
    }
  }, day);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-backup')]);
  const buffer = fs.readFileSync(await download.path());
  assert.strictEqual(JSON.parse(buffer.toString('utf8')).history.length, 1);
  await context.close();

  const other = await openApp(browser, base);
  await other.page.setInputFiles('#import-backup-input', { name: 'b.json', mimeType: 'application/json', buffer });
  await answerDialog(other.page);
  await other.page.getByText('Backup restored').waitFor();
  const restored = await other.page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_history')));
  assert.strictEqual(restored[0].date, day);
  assert.deepStrictEqual(errors, []);
  assert.deepStrictEqual(other.errors, []);
  await other.context.close();
});

// ---------- School terms ----------
const isoDaysAhead = (n) => isoDaysAgo(-n);

test('school terms: set in the dialog, chip shows the term week', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  assert.strictEqual((await page.textContent('#term-chip')).trim(), 'Set school terms');
  await page.click('#term-chip');
  // First term started 20 days ago (so we are in week 3) and lasts 13 weeks
  await answerDialog(page, { start0: isoDaysAgo(20), end0: isoDaysAhead(70) });
  await page.getByText('School terms saved').waitFor();
  assert.strictEqual((await page.textContent('#term-chip')).trim(), 'First term · Week 3 of 13');
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.strictEqual((await page.textContent('#term-chip')).trim(), 'First term · Week 3 of 13', 'saved');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('school terms: mid-term break and holidays are shown and not recorded', async (browser, base) => {
  const yesterday = isoDaysAgo(1);
  const terms = [
    { start: isoDaysAgo(40), end: isoDaysAhead(40), breakStart: isoDaysAgo(3), breakEnd: isoDaysAhead(3) },
    null,
    null
  ];
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, [terms, yesterday]]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_terms', JSON.stringify(terms));
      localStorage.setItem('eduplanner_tasks', JSON.stringify({ teacher: [
        { id: '1', text: 'Take class attendance', freq: 'daily', done: true }
      ] }));
      localStorage.setItem('eduplanner_last_opened', JSON.stringify({ daily: yesterday, weekly: 'x', monthly: 'y' }));
    }
  }, [terms, yesterday]);
  assert.strictEqual((await page.textContent('#term-chip')).trim(), 'First term · Mid-term break');
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem('eduplanner_history') || '[]'));
  assert.deepStrictEqual(history, [], 'nothing recorded for a day in the mid-term break');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('school terms: holiday chip names the next term', async (browser, base) => {
  const terms = [{ start: isoDaysAgo(100), end: isoDaysAgo(10) }, { start: isoDaysAhead(10), end: isoDaysAhead(100) }, null];
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, terms]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_terms', JSON.stringify(terms));
    }
  }, terms);
  const chip = (await page.textContent('#term-chip')).trim();
  assert.ok(chip.startsWith('Holiday · Second term starts'), chip);
  assert.ok(await page.locator('#term-chip.holiday').count() === 1);
  // The term report defaults to the last term, and names it
  await page.click('#term-report-btn');
  assert.strictEqual(await page.inputValue('#app-dialog [name="from"]'), terms[0].start);
  assert.strictEqual(await page.inputValue('#app-dialog [name="to"]'), terms[0].end);
  await answerDialog(page, {}, { cancel: true });
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('school terms: term report title names the term', async (browser, base) => {
  const terms = [{ start: isoDaysAgo(30), end: isoDaysAhead(60) }, null, null];
  const day = isoDaysAgo(5);
  const { context, page, errors } = await openApp(browser, base, {
    initScript: ([, [terms, day]]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('eduplanner_terms', JSON.stringify(terms));
      localStorage.setItem('eduplanner_history', JSON.stringify([
        { role: 'teacher', freq: 'daily', period: day, date: day, d: ['Take class attendance'], p: [] }
      ]));
    }
  }, [terms, day]);
  await page.click('#term-report-btn');
  const popupPromise = context.waitForEvent('page');
  await answerDialog(page);
  const report = await popupPromise;
  await report.waitForLoadState('domcontentloaded');
  assert.strictEqual((await report.textContent('h1')).trim(), 'Term Report · First term');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

// ---------- Analytics consent (opt-in) ----------
const isTracker = (url) => /posthog\.com|cloudflareinsights\.com/.test(url);

test('analytics: nothing loads before consent, banner is shown', async (browser, base) => {
  const { context, page, errors, external } = await openApp(browser, base);
  await page.locator('#consent-banner').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  assert.deepStrictEqual(external.filter(isTracker), [], 'no tracker requests before consent');
  assert.strictEqual(await page.textContent('#analytics-toggle'), 'Usage stats: Off');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('analytics: "Allow" loads trackers and is remembered', async (browser, base) => {
  const { context, page, errors, external } = await openApp(browser, base);
  await page.click('#consent-accept');
  await page.locator('#consent-banner').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelector('script[src*="posthog"]'));
  assert.ok(external.some((u) => /cloudflareinsights\.com/.test(u)), 'Cloudflare beacon requested');
  assert.strictEqual(await page.textContent('#analytics-toggle'), 'Usage stats: On');
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  assert.ok(await page.locator('#consent-banner').isHidden(), 'banner stays hidden after reload');
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('analytics: "No thanks" sends nothing, footer switch can turn it on', async (browser, base) => {
  const { context, page, errors, external } = await openApp(browser, base);
  await page.click('#consent-decline');
  await page.locator('#consent-banner').waitFor({ state: 'hidden' });
  await page.reload();
  await page.waitForSelector('#task-list .task-item');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#consent-banner').isHidden(), 'banner stays hidden after reload');
  assert.deepStrictEqual(external.filter(isTracker), [], 'no tracker requests after declining');
  await page.click('#analytics-toggle');
  assert.strictEqual(await page.textContent('#analytics-toggle'), 'Usage stats: On');
  await page.waitForFunction(() => document.querySelector('script[src*="posthog"]'));
  assert.deepStrictEqual(errors, []);
  await context.close();
});

test('analytics: Global Privacy Control hides the banner and sends nothing', async (browser, base) => {
  const { context, page, errors, external } = await openApp(browser, base, {
    initScript: () => { Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }); }
  });
  await page.waitForTimeout(500);
  assert.ok(await page.locator('#consent-banner').isHidden());
  assert.ok(await page.locator('#analytics-toggle').isHidden());
  assert.deepStrictEqual(external.filter(isTracker), []);
  assert.deepStrictEqual(errors, []);
  await context.close();
});

(async () => {
  const server = await startServer();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn(browser, base);
      console.log('  ✓ ' + t.name);
    } catch (e) {
      failed++;
      console.log('  ✗ ' + t.name + '\n    ' + (e && e.message));
    }
  }
  await browser.close();
  server.close();
  console.log(`\n${tests.length - failed}/${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
