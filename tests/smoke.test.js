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

// Opens the app in a fresh context. External hosts (CDNs, analytics) are
// blocked so the tests are fast and deterministic.
async function openApp(browser, base, { query = '', initScript, serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({ serviceWorkers });
  if (initScript) await context.addInitScript(initScript, DAY_MS);
  const external = []; // URLs of blocked external requests, newest last
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    external.push(route.request().url());
    route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/' + query);
  await page.waitForSelector('#task-list .task-item');
  return { context, page, errors, external };
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
  page.once('dialog', (d) => d.accept('Print handouts'));
  await page.locator('#task-list .task-item').first().locator('.add-subtask-btn').click();
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
  page.on('dialog', (d) => d.accept());
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
  page.once('dialog', (d) => d.accept('Sports Coordinator'));
  await page.click('#add-role-btn');
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
  page.once('dialog', (d) => d.accept('Exams Officer'));
  await page.click('#add-role-btn');
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
  other.page.on('dialog', (d) => d.accept());
  await other.page.setInputFiles('#import-backup-input', { name: 'backup.json', mimeType: 'application/json', buffer: fileBuffer });
  await other.page.locator('.tab[data-role="exams_officer"]', { hasText: 'Exams Officer' }).click();
  await other.page.locator('#task-list .task-text', { hasText: 'Collate exam scripts' }).waitFor();
  assert.strictEqual(await other.page.inputValue('#scratchpad-textarea'), 'Remember chalk');
  assert.deepStrictEqual(other.errors, []);
  await other.context.close();
});

test('old-format backups still restore', async (browser, base) => {
  const { context, page, errors } = await openApp(browser, base);
  page.on('dialog', (d) => d.accept());
  const oldBackup = { teacher: [{ id: 'a', text: 'Old backup task', freq: 'daily', done: false }] };
  await page.setInputFiles('#import-backup-input', {
    name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldBackup))
  });
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
