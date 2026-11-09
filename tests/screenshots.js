/* ========================================
   Regenerates the README screenshots in screenshots/.
   Run: npm run screenshots   (needs Playwright + Chromium, like the tests)
   Uses made-up sample data; nothing from a real user.
   ======================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Runs in the page before the app loads: sample tasks, a term, some history
function seed({ lang }) {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const iso = (n) => { const d = new Date(Date.now() + n * 864e5); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  localStorage.setItem('eduplanner_lang', lang);
  localStorage.setItem('eduplanner_analytics_consent', 'denied');
  localStorage.setItem('eduplanner_restore_offer_dismissed', '1');
  localStorage.setItem('eduplanner_last_backup', String(Date.now()));
  // Mark today as already opened so the sample ticks aren't reset as a "new day"
  // (same period keys as checkRecurringResets in app.js)
  const now = new Date();
  const wk = (() => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return d.getUTCFullYear() + '-W' + Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  })();
  localStorage.setItem('eduplanner_last_opened', JSON.stringify({ daily: iso(0), weekly: wk, monthly: now.getFullYear() + '-' + now.getMonth() }));
  localStorage.setItem('eduplanner_report_info', JSON.stringify({ staff: 'Ada Obi', school: 'Unity Secondary School, Awka' }));
  localStorage.setItem('eduplanner_terms', JSON.stringify([{ start: iso(-60), end: iso(30), breakStart: iso(-25), breakEnd: iso(-21) }, { start: iso(45), end: iso(130) }, null]));

  const t = (text, freq, done, extra) => ({ id: Math.random().toString(36).slice(2), text, freq, done, ...extra });
  localStorage.setItem('eduplanner_tasks', JSON.stringify({
    teacher: [
      t('Review lesson plan for today', 'daily', true),
      t('Take class attendance', 'daily', true),
      t('Update student progress notes', 'daily', false, { tag: 'JSS2' }),
      t('Mark and return assignments', 'daily', false, { dueDate: iso(1), subtasks: [{ text: 'JSS2 Basic Science', done: true }, { text: 'JSS3 Basic Science', done: false }] }),
      t("Prepare materials for tomorrow's lessons", 'daily', false),
      t('Supervise student behavior during break', 'daily', true),
      t('Communicate updates to parents (if needed)', 'daily', false),
      t('Submit weekly lesson notes to HOD', 'weekly', true),
      t('Prepare and grade quizzes/tests', 'weekly', false, { dueDate: iso(3) }),
      t('Attend staff meeting', 'weekly', false),
      t('Submit monthly progress report', 'monthly', false, { dueDate: iso(12) }),
      t('Analyze student performance data', 'monthly', false)
    ],
    administrator: [
      t('Hold management team briefing', 'weekly', true),
      t('Review budget expenditure report', 'weekly', true),
      t('Monitor cleanliness and facility maintenance', 'weekly', false),
      t('Review admission and enrollment status', 'weekly', false, { tag: 'admissions' }),
      t('Coordinate extracurricular activities schedule', 'weekly', false),
      t('Approve purchase orders and requisitions', 'weekly', false, { dueDate: iso(2) })
    ],
    ict: [
      t('Check all computer systems and devices', 'daily', true),
      t('Resolve IT support tickets', 'daily', false),
      t('Monitor internet connectivity', 'daily', true),
      t('Back up critical school data', 'daily', false),
      t('Run system and software updates', 'weekly', true),
      t('Audit device inventory', 'weekly', false),
      t('Submit IT infrastructure status report', 'monthly', false),
      t('Conduct cybersecurity awareness session', 'monthly', false, { tag: 'training' })
    ]
  }));

  // About six weeks of school-day history for the term report
  const daily = ['Review lesson plan for today', 'Take class attendance', 'Update student progress notes', 'Mark and return assignments', "Prepare materials for tomorrow's lessons"];
  const rates = [0.95, 0.98, 0.6, 0.75, 0.85];
  const weekly = ['Submit weekly lesson notes to HOD', 'Prepare and grade quizzes/tests', 'Attend staff meeting'];
  let s = 7;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const history = [];
  for (let n = 45; n >= 1; n--) {
    const d = new Date(Date.now() - n * 864e5);
    if (d.getDay() === 0 || d.getDay() === 6 || (n >= 21 && n <= 25)) continue; // weekends, mid-term break
    const done = daily.filter((_, i) => rnd() < rates[i]);
    history.push({ role: 'teacher', freq: 'daily', period: iso(-n), date: iso(-n), d: done, p: daily.filter(x => !done.includes(x)) });
  }
  for (let w = 6; w >= 1; w--) {
    const done = weekly.filter((_, i) => rnd() < [0.9, 0.7, 0.95][i]);
    history.push({ role: 'teacher', freq: 'weekly', period: 'w' + w, date: iso(-w * 7 + 2), d: done, p: weekly.filter(x => !done.includes(x)) });
  }
  localStorage.setItem('eduplanner_history', JSON.stringify(history));
}

async function shoot(browser, base, { file, lang = 'en', theme = 'light', role = 'teacher', freq = 'daily', mobile = false, action }) {
  const context = await browser.newContext({
    ...(mobile
      ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
      : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }),
    colorScheme: theme,
    serviceWorkers: 'block'
  });
  // Fonts load from Fontshare; everything else external is blocked
  await context.route(/^https?:\/\/(?!127\.0\.0\.1|api\.fontshare\.com|cdn\.fontshare\.com)/, (r) => r.abort());
  await context.addInitScript(seed, { lang });
  await context.addInitScript(() => { window.print = () => {}; });
  const page = await context.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#task-list .task-item');
  await page.evaluate(() => document.fonts.ready);
  await page.click(`.tab[data-role="${role}"]`);
  await page.click(`.freq-tab[data-freq="${freq}"]`);
  let target = page;
  if (action) target = (await action(page, context)) || page;
  await target.waitForTimeout(300);
  await target.screenshot({ path: path.join(OUT, file), fullPage: target !== page });
  console.log('  ✓ screenshots/' + file);
  await context.close();
}

(async () => {
  const server = await startServer();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  await shoot(browser, base, { file: 'hero-light.png' });
  await shoot(browser, base, { file: 'dark-mode.png', theme: 'dark', role: 'administrator', freq: 'weekly' });
  await shoot(browser, base, { file: 'all-tasks.png', role: 'ict', freq: 'all' });
  await shoot(browser, base, { file: 'mobile.png', mobile: true });
  await shoot(browser, base, { file: 'mobile-dark.png', mobile: true, theme: 'dark', lang: 'fr' });
  await shoot(browser, base, {
    file: 'term-report.png',
    action: async (page, context) => {
      await page.click('#term-report-btn');
      await page.waitForSelector('#app-dialog[open]');
      const popup = context.waitForEvent('page');
      await page.click('#app-dialog-ok');
      const report = await popup;
      await report.setViewportSize({ width: 900, height: 1200 });
      await report.waitForLoadState();
      await report.emulateMedia({ media: 'print' });
      return report;
    }
  });
  await browser.close();
  server.close();
})();
