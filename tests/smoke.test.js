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

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// Opens the app in a fresh context. External hosts (CDNs, analytics) are
// blocked so the tests are fast and deterministic.
async function openApp(browser, base, { query = '', initScript, serviceWorkers = 'block' } = {}) {
  const context = await browser.newContext({ serviceWorkers });
  if (initScript) await context.addInitScript(initScript);
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/' + query);
  await page.waitForSelector('#task-list .task-item');
  return { context, page, errors };
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
