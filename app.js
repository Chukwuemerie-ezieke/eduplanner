/* ========================================
   EduPlanner — App Logic
   Harmony Digital Consults Ltd
   Open Source | MIT License
   ======================================== */

(function () {
  'use strict';

  // Release version: keep in sync with APP_VERSION in sw.js and CHANGELOG.md
  const APP_VERSION = '2.0.1';

  // ---------- Language (translations live in i18n.js) ----------
  const I18N = window.EDU_I18N || {
    ui: { en: {} }, tasks: {}, locales: { en: { date: 'en-GB', html: 'en' } }, languages: ['en']
  };
  const LANG_KEY = 'eduplanner_lang';

  // Saved choice first; otherwise follow the browser (French browsers get French)
  function detectLanguage() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved && I18N.ui[saved]) return saved;
    } catch (e) { /* storage blocked */ }
    const nav = String(navigator.language || '').toLowerCase();
    if (nav.startsWith('fr') && I18N.ui.fr) return 'fr';
    if (nav.startsWith('pcm') && I18N.ui.pidgin) return 'pidgin';
    return 'en';
  }
  let currentLang = detectLanguage();

  // Translate a UI string. Fills {placeholders}; picks key_one/key_other from vars.n.
  function tr(key, vars) {
    const dict = I18N.ui[currentLang] || {};
    let k = key;
    if (vars && typeof vars.n === 'number') {
      const plural = key + (vars.n === 1 ? '_one' : '_other');
      if (dict[plural] || I18N.ui.en[plural]) k = plural;
    }
    let str = dict[k] || I18N.ui.en[k] || key;
    if (vars) str = str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
    return str;
  }

  // Built-in tasks are stored in English and translated for display.
  // Anything the user typed is shown exactly as written.
  function taskText(text) {
    if (currentLang === 'en') return text;
    const entry = I18N.tasks[text];
    return (entry && entry[currentLang]) || text;
  }

  function dateLocale() {
    return (I18N.locales[currentLang] || I18N.locales.en).date;
  }

  // "2026-11-07" -> "7 Nov 2026" / "7 nov. 2026" in the current language
  function formatDate(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d)) return isoDate;
    return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // ---------- In-app dialog (dialog.js) ----------
  const { openDialog, askText, askConfirm } = window.EduDialog.create(tr);

  // ---------- Pre-populated tasks by role and frequency (default-tasks.js) ----------
  const DEFAULT_TASKS = window.EDU_DEFAULT_TASKS || {};

  const ROLE_LABELS = {
    teacher: 'Teacher',
    administrator: 'Administrator',
    hod: 'Head of Department',
    ict: 'ICT Coordinator',
    librarian: 'Librarian',
    counselor: 'School Counselor'
  };
  const BUILT_IN_ROLES = Object.keys(ROLE_LABELS);

  // Built-in roles are translated; custom roles keep the name the user gave them
  function roleLabel(key) {
    if (BUILT_IN_ROLES.includes(key)) return tr('role.' + key);
    return ROLE_LABELS[key] || key || tr('unknownRole');
  }

  // ---------- State ----------
  let currentRole = 'teacher';
  let activeTagFilter = null;

  let lastDeletedTask = null;
  let lastDeletedRole = null;

  // ---------- Recently deleted (archive) ----------
  // Deleted and cleared tasks are kept for ARCHIVE_DAYS so they can be
  // restored, capped at ARCHIVE_MAX entries so they can't fill up storage.
  const ARCHIVE_MAX = 200;
  const ARCHIVE_DAYS = 30;
  const DAY_MS = 86400000;

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v === null || v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function pruneArchive(list) {
    if (!Array.isArray(list)) return [];
    const cutoff = Date.now() - ARCHIVE_DAYS * DAY_MS;
    return list
      .filter(a => a && typeof a.text === 'string' && Date.parse(a.deletedAt) >= cutoff)
      .slice(-ARCHIVE_MAX);
  }

  let archive = pruneArchive(readJSON('eduplanner_archive', []));

  // ---------- Completion history ----------
  // When a day, week or month ends, the state of that period's tasks is saved
  // before the ticks are reset: { role, freq, period, date, d: [done], p: [pending] }
  // `date` is the last day the app was opened in that period.
  const HISTORY_KEY = 'eduplanner_history';
  const HISTORY_MAX = 5000;
  const HISTORY_DAYS = 400;

  function sanitizeHistory(list) {
    if (!Array.isArray(list)) return [];
    const cutoff = localDateStr(new Date(Date.now() - HISTORY_DAYS * DAY_MS));
    const texts = (arr) => (Array.isArray(arr) ? arr : [])
      .filter(x => typeof x === 'string' && x.trim()).slice(0, 200).map(x => x.slice(0, 500));
    return list
      .filter(r => r && isSafeRoleKey(r.role) && FREQS.includes(r.freq) &&
        typeof r.date === 'string' && DATE_RE.test(r.date) && r.date >= cutoff)
      .map(r => ({ role: r.role, freq: r.freq, period: String(r.period || '').slice(0, 20), date: r.date, d: texts(r.d), p: texts(r.p) }))
      .slice(-HISTORY_MAX);
  }

  let historyLog = null; // loaded at init (helpers it needs are defined further down)

  function saveHistory() {
    historyLog = sanitizeHistory(historyLog);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(historyLog));
    } catch (e) { /* storage full: the task list warning covers this */ }
  }

  // ---------- School terms ----------
  // Up to three terms: { start, end, breakStart, breakEnd } ("YYYY-MM-DD"; break optional).
  // With terms set, holidays and mid-term breaks are not recorded in history.
  const TERMS_KEY = 'eduplanner_terms';
  const TERM_NAMES = ['term1', 'term2', 'term3'];

  function sanitizeTerms(list) {
    if (!Array.isArray(list)) return [];
    const ok = (d) => typeof d === 'string' && DATE_RE.test(d);
    return list.slice(0, 3).map(t => {
      if (!t || !ok(t.start) || !ok(t.end)) return null;
      let [start, end] = t.start <= t.end ? [t.start, t.end] : [t.end, t.start];
      const term = { start, end };
      if (ok(t.breakStart) && ok(t.breakEnd)) {
        const [bs, be] = t.breakStart <= t.breakEnd ? [t.breakStart, t.breakEnd] : [t.breakEnd, t.breakStart];
        if (bs >= start && be <= end) { term.breakStart = bs; term.breakEnd = be; }
      }
      return term;
    });
  }

  let schoolTerms = []; // loaded at init; entries may be null for unset terms

  function termsSet() {
    return schoolTerms.some(Boolean);
  }

  // Index of the term containing the date, or -1
  function termIndexFor(date) {
    return schoolTerms.findIndex(t => t && date >= t.start && date <= t.end);
  }

  function inBreak(term, date) {
    return !!(term && term.breakStart && date >= term.breakStart && date <= term.breakEnd);
  }

  // Without terms every day counts; with terms, holidays and breaks don't
  function isSchoolDay(date) {
    if (!termsSet()) return true;
    const i = termIndexFor(date);
    return i > -1 && !inBreak(schoolTerms[i], date);
  }

  // Snapshot the given frequencies for the period that just ended
  function recordHistory(freqs, lastOpened) {
    if (!isSchoolDay(lastOpened.daily)) return; // holiday or mid-term break
    for (const role in tasks) {
      for (const freq of freqs) {
        const list = (tasks[role] || []).filter(t => t.freq === freq);
        if (!list.length) continue;
        const record = {
          role, freq, period: lastOpened[freq], date: lastOpened.daily,
          d: list.filter(t => t.done).map(t => t.text),
          p: list.filter(t => !t.done).map(t => t.text)
        };
        // One record per role, frequency and period
        const i = historyLog.findIndex(r => r.role === role && r.freq === freq && r.period === record.period);
        if (i > -1) historyLog[i] = record; else historyLog.push(record);
      }
    }
    saveHistory();
  }

  function archiveTask(task, role) {
    archive.push({ ...task, role, deletedAt: new Date().toISOString() });
  }

  function saveArchive() {
    archive = pruneArchive(archive);
    try {
      localStorage.setItem('eduplanner_archive', JSON.stringify(archive));
    } catch (e) { /* non-critical: the task list itself is saved separately */ }
    renderTrash();
  }

  let draggedTaskIndex = null;
  let currentFreq = 'daily';
  let tasks = {}; // { role: [{ id, text, freq, done }] }

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const taskList = $('#task-list');
  const emptyState = $('#empty-state');
  const addForm = $('#add-task-form');
  const taskInput = $('#new-task-input');
  const taskFreqSelect = $('#new-task-freq');
  const progressFill = $('.progress-fill');
  const statDone = $('#stat-done');
  const statTotal = $('#stat-total');
  const toastContainer = $('#toast-container');

  // ---------- Local Storage ----------

  // ---------- Recurring Task Auto-Reset ----------
  function checkRecurringResets() {
    const now = new Date();
    const todayStr = localDateStr(now);
    const currentWeekStr = getWeekYearString(now);
    const currentMonthStr = now.getFullYear() + '-' + now.getMonth();

    const lastOpened = readJSON('eduplanner_last_opened', {}) || {};

    // Save what was done in any period that has ended, before resetting it
    const current = { daily: todayStr, weekly: currentWeekStr, monthly: currentMonthStr };
    const ended = FREQS.filter(f => lastOpened[f] && lastOpened[f] !== current[f]);
    if (ended.length && typeof lastOpened.daily === 'string' && DATE_RE.test(lastOpened.daily)) {
      recordHistory(ended, lastOpened);
    }

    let needsSave = false;
    // First visit on this device (or after storage was cleared): there's no
    // earlier visit to compare with, so keep existing ticks as they are
    const firstVisit = !lastOpened.daily;

    for (const r in tasks) {
      if (tasks[r] && !firstVisit) {
        tasks[r].forEach(t => {
          if (t.done) {
            if (t.freq === 'daily' && lastOpened.daily !== todayStr) {
              t.done = false;
              if(t.subtasks) t.subtasks.forEach(st => st.done = false);
              needsSave = true;
            }
            if (t.freq === 'weekly' && lastOpened.weekly !== currentWeekStr) {
              t.done = false;
              if(t.subtasks) t.subtasks.forEach(st => st.done = false);
              needsSave = true;
            }
            if (t.freq === 'monthly' && lastOpened.monthly !== currentMonthStr) {
              t.done = false;
              if(t.subtasks) t.subtasks.forEach(st => st.done = false);
              needsSave = true;
            }
          }
        });
      }
    }

    if (needsSave) {
      saveTasks(false);
    }

    // Update last opened stamps
    try {
      localStorage.setItem('eduplanner_last_opened', JSON.stringify(current));
    } catch (e) { /* storage full or blocked */ }
  }

  // If the app stays open past midnight (or a new week/month), reset and
  // record history when it comes back into view, not only on reload
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    checkRecurringResets();
    updateAnalytics();
    renderTasks();
    renderTermChip();
  });

  function getWeekYearString(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return d.getUTCFullYear() + '-W' + weekNo;
  }

  let isFirstRun = false;   // no saved tasks on this device yet
  let loadFailed = false;   // saved tasks existed but couldn't be read

  function loadTasks() {
    let saved = null;
    try {
      saved = localStorage.getItem('eduplanner_tasks');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          tasks = parsed;
          return;
        }
        throw new Error('Unexpected task data');
      }
      isFirstRun = true;
    } catch (e) {
      // Keep a copy of the unreadable data instead of silently overwriting it
      loadFailed = true;
      try {
        if (saved) localStorage.setItem('eduplanner_tasks_unreadable', saved);
      } catch (_) { /* storage full or blocked */ }
    }
    // Initialize with defaults
    initDefaults();
  }

  function initDefaults() {
    tasks = {};
    for (const role of Object.keys(DEFAULT_TASKS)) {
      tasks[role] = [];
      for (const freq of ['daily', 'weekly', 'monthly']) {
        const items = DEFAULT_TASKS[role][freq] || [];
        items.forEach((text) => {
          tasks[role].push({
            id: uid(),
            text,
            freq,
            done: false
          });
        });
      }
    }
    saveTasks(false);
  }

  let storageWarningShown = false;

  // userChange=false for automatic saves (defaults, recurring resets)
  function saveTasks(userChange = true) {
    try {
      localStorage.setItem('eduplanner_tasks', JSON.stringify(tasks));
      if (userChange) onUserDataChange();
    } catch (e) {
      // Storage full or blocked: tell the user once instead of failing silently
      if (!storageWarningShown) {
        storageWarningShown = true;
        showDataNotice('storage-error');
      }
    }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // YYYY-MM-DD in the user's local time zone (toISOString() would use UTC)
  function localDateStr(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  // ---------- Validation for untrusted data (backups, shared links) ----------
  const FREQS = ['daily', 'weekly', 'monthly'];
  const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];
  function isSafeRoleKey(k) {
    return typeof k === 'string' && k.length > 0 && k.length <= 80 && !FORBIDDEN_KEYS.includes(k);
  }
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Returns a clean task object, or null if the input is not a usable task.
  function sanitizeTask(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 500) : '';
    if (!text) return null;
    const subtasks = Array.isArray(raw.subtasks)
      ? raw.subtasks
          .filter(st => st && typeof st.text === 'string' && st.text.trim())
          .slice(0, 50)
          .map(st => ({ text: st.text.trim().slice(0, 300), done: st.done === true }))
      : [];
    return {
      id: uid(),
      text,
      freq: FREQS.includes(raw.freq) ? raw.freq : 'daily',
      dueDate: typeof raw.dueDate === 'string' && DATE_RE.test(raw.dueDate) ? raw.dueDate : null,
      tag: typeof raw.tag === 'string' && raw.tag.trim() ? raw.tag.trim().slice(0, 40) : null,
      subtasks,
      done: raw.done === true
    };
  }

  function sanitizeTaskList(list) {
    if (!Array.isArray(list)) return [];
    return list.map(sanitizeTask).filter(Boolean);
  }

  // Validates a full backup ({ role: [tasks] }). Returns null if invalid.
  function sanitizeBackup(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const clean = {};
    for (const role of Object.keys(data)) {
      if (!isSafeRoleKey(role) || !Array.isArray(data[role])) return null;
      clean[role] = sanitizeTaskList(data[role]);
    }
    return Object.keys(clean).length ? clean : null;
  }

  // ---------- Render ----------
  function getFilteredTasks() {
    const roleTasks = tasks[currentRole] || [];
    if (currentFreq === 'all') return roleTasks;
    return roleTasks.filter(t => t.freq === currentFreq);
  }


  // Edit a task's text, due date, tag and frequency
  async function editTask(task) {
    const shownText = taskText(task.text);
    const r = await openDialog({
      title: tr('editTask'),
      okLabel: tr('save'),
      fields: [
        { name: 'text', label: tr('colTask'), value: shownText, required: true, maxlength: 200 },
        { name: 'freq', label: tr('taskFrequency'), type: 'select', value: task.freq, row: 1,
          options: FREQS.map(f => ({ value: f, label: tr(f) })) },
        { name: 'dueDate', label: tr('dueDateLabel'), type: 'date', value: task.dueDate || '', row: 1 },
        { name: 'tag', label: tr('tagLabel'), value: task.tag || '', placeholder: '#tag', maxlength: 40 }
      ]
    });
    if (!r) return;

    const newText = r.text.trim();
    // Unchanged built-in tasks keep their English original so they stay translated
    if (newText && newText !== shownText) task.text = newText;
    task.freq = FREQS.includes(r.freq) ? r.freq : task.freq;
    task.dueDate = DATE_RE.test(r.dueDate) ? r.dueDate : null;
    task.tag = r.tag.trim().replace(/^#/, '').slice(0, 40) || null;
    saveTasks();
    renderTasks();
    showToast(tr('taskUpdated'));
  }

  function renderTagFilters(roleTasks) {
    const container = document.getElementById('tag-filters');
    if (!container) return;

    // Extract unique tags
    const tags = new Set();
    roleTasks.forEach(t => {
      if (t.tag) tags.add(t.tag.toLowerCase());
    });

    if (tags.size === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'flex';
    container.innerHTML = '';

    // "All" pill
    const allPill = document.createElement('button');
    allPill.className = 'btn btn-sm ' + (activeTagFilter === null ? 'btn-primary' : 'btn-outline');
    allPill.style.borderRadius = '20px';
    allPill.style.padding = '2px 10px';
    allPill.style.fontSize = '12px';
    allPill.textContent = tr('all');
    allPill.addEventListener('click', () => {
      activeTagFilter = null;
      renderTasks();
    });
    container.appendChild(allPill);

    // Tag pills
    Array.from(tags).sort().forEach(tag => {
      const pill = document.createElement('button');
      pill.className = 'btn btn-sm ' + (activeTagFilter === tag ? 'btn-primary' : 'btn-outline');
      pill.style.borderRadius = '20px';
      pill.style.padding = '2px 10px';
      pill.style.fontSize = '12px';
      pill.textContent = '#' + tag;
      pill.addEventListener('click', () => {
        activeTagFilter = tag;
        renderTasks();
      });
      container.appendChild(pill);
    });
  }

  function renderTasks() {
    const printDate = document.getElementById('print-date');
    if (printDate) printDate.textContent = tr('printRoleDate', { role: roleLabel(currentRole), date: new Date().toLocaleDateString(dateLocale()) });
    taskList.innerHTML = '';

    const roleTasks = tasks[currentRole] || [];
    renderTagFilters(roleTasks);

    let toShow = currentFreq === 'all' ? roleTasks : roleTasks.filter(t => t.freq === currentFreq);

    if (activeTagFilter) {
      toShow = toShow.filter(t => t.tag && t.tag.toLowerCase() === activeTagFilter);
    }


    // Apply search filter
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
      toShow = toShow.filter(t =>
        t.text.toLowerCase().includes(searchTerm) || taskText(t.text).toLowerCase().includes(searchTerm));
    }



    if (currentViewMode === 'calendar') {
      renderCalendarView(toShow);
      updateStats();
      return;
    }
    calendarContainer.style.display = 'none';
    taskList.style.display = 'block';

    if (toShow.length === 0) {
      emptyState.style.display = 'flex';
    } else {
      emptyState.style.display = 'none';
      toShow.forEach(t => {
        const item = document.createElement('div');
        item.className = 'task-item' + (t.done ? ' done' : '');
        item.dataset.id = t.id;

        const checkId = 'check-' + t.id;

        item.innerHTML = `
          <input type="checkbox" id="${checkId}" class="task-checkbox" ${t.done ? 'checked' : ''} aria-label="${escHtml(tr('markComplete'))}">
          <div class="task-content">
            <label for="${checkId}" class="task-text">${parseMarkdown(taskText(t.text))}</label>

            ${currentFreq === 'all' ? `<div class="task-freq-badge ${escHtml(t.freq)}">${escHtml(tr(t.freq))}</div>` : ''}
            ${t.dueDate ? `<div class="task-due-date" style="font-size:11px;color:var(--color-text-faint);margin-top:2px;display:inline-block;">${escHtml(tr('due', { date: formatDate(t.dueDate) }))}</div>` : ''}
            ${t.tag ? `<span class="task-tag" style="font-size:10px; background:var(--color-surface-2); border: 1px solid var(--color-border); padding:2px 6px; border-radius:4px; margin-left: 6px; display:inline-block;">${escHtml(t.tag)}</span>` : ''}
            ${Array.isArray(t.subtasks) && t.subtasks.length ? `
            <ul class="subtask-list" style="list-style:none; margin:6px 0 0; padding:0;">
              ${t.subtasks.map((st, sidx) => `
              <li style="display:flex; align-items:center; gap:6px; font-size:13px;">
                <input type="checkbox" class="subtask-check" id="${checkId}-st${sidx}" data-sidx="${sidx}" ${st.done ? 'checked' : ''}>
                <label for="${checkId}-st${sidx}" style="${st.done ? 'text-decoration:line-through; opacity:0.6;' : ''}">${escHtml(st.text)}</label>
                <button type="button" class="subtask-remove" data-sidx="${sidx}" aria-label="${escHtml(tr('removeSubtask'))}" title="${escHtml(tr('removeSubtask'))}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </li>`).join('')}
            </ul>` : ''}
          </div>

          <div class="task-actions">
            <button type="button" class="task-edit" aria-label="${escHtml(tr('editTask'))}" title="${escHtml(tr('editTask'))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="add-subtask-btn" aria-label="${escHtml(tr('addSubtask'))}" title="${escHtml(tr('addSubtask'))}" style="background:transparent; border:none; cursor:pointer; color:var(--color-text-muted); padding:4px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="task-delete" aria-label="${escHtml(tr('deleteTask'))}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `;

        // Checkbox event
        item.querySelector('.task-checkbox').addEventListener('change', (e) => {
          t.done = e.target.checked;
          if (window.Analytics) window.Analytics.track(t.done ? 'task_complete' : 'task_uncomplete', { role: currentRole, frequency: t.freq });
          if (t.done) {
            item.classList.add('done');
          } else {
            item.classList.remove('done');
          }
          saveTasks();
          updateStats();
        });


        // Subtask events
        item.querySelectorAll('.subtask-check').forEach(cb => {
          cb.addEventListener('change', (e) => {
            const sidx = Number(e.target.getAttribute('data-sidx'));
            t.subtasks[sidx].done = e.target.checked;
            saveTasks();
            renderTasks();
          });
        });

        item.querySelectorAll('.subtask-remove').forEach(btn => {
          btn.addEventListener('click', () => {
            t.subtasks.splice(Number(btn.dataset.sidx), 1);
            saveTasks();
            renderTasks();
          });
        });

        item.querySelector('.add-subtask-btn').addEventListener('click', async () => {
          const stText = await askText({
            title: tr('addSubtask'),
            okLabel: tr('add'),
            field: { label: tr('subtaskLabel') }
          });
          if (stText) {
            if (!t.subtasks) t.subtasks = [];
            t.subtasks.push({ text: stText.slice(0, 300), done: false });
            saveTasks();
            renderTasks();
          }
        });

        item.querySelector('.task-edit').addEventListener('click', () => editTask(t));

        // Delete event

        item.querySelector('.task-delete').addEventListener('click', () => {

          lastDeletedTask = t;
          lastDeletedRole = currentRole;
          archiveTask(t, currentRole);
          saveArchive();

          tasks[currentRole] = tasks[currentRole].filter(x => x.id !== t.id);
          if (window.Analytics) window.Analytics.track('task_delete', { role: currentRole });
          item.style.opacity = '0';
          setTimeout(() => {
            saveTasks();
            renderTasks();
            showUndoToast(tr('taskDeleted'));
          }, 200);
        });


        // Drag and Drop
        item.setAttribute('draggable', 'true');
        item.addEventListener('dragstart', (e) => {
          draggedTaskIndex = tasks[currentRole].findIndex(x => x.id === t.id);
          e.dataTransfer.effectAllowed = 'move';
          item.style.opacity = '0.5';
        });

        item.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          item.style.borderTop = '2px solid var(--color-primary)';
        });

        item.addEventListener('dragleave', () => {
          item.style.borderTop = '';
        });

        item.addEventListener('drop', (e) => {
          e.preventDefault();
          item.style.borderTop = '';
          const targetTaskIndex = tasks[currentRole].findIndex(x => x.id === t.id);
          if (draggedTaskIndex !== null && targetTaskIndex !== null && draggedTaskIndex !== targetTaskIndex) {
            const draggedTask = tasks[currentRole][draggedTaskIndex];
            tasks[currentRole].splice(draggedTaskIndex, 1);
            tasks[currentRole].splice(targetTaskIndex, 0, draggedTask);
            saveTasks();
            renderTasks();
          }
        });

        item.addEventListener('dragend', () => {
          item.style.opacity = '1';
          draggedTaskIndex = null;
        });

        taskList.appendChild(item);
      });
    }
    updateStats();
  }

  function updateAnalytics() {
    let total = 0;
    let done = 0;
    for (const r in tasks) {
      if (tasks[r]) {
        total += tasks[r].length;
        done += tasks[r].filter(t => t.done).length;
      }
    }
    const scoreEl = document.getElementById('productivity-score');
    if (scoreEl) {
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      scoreEl.textContent = pct + '%';
    }
  }

  function updateStats() {
    const filtered = getFilteredTasks();
    const done = filtered.filter(t => t.done).length;
    const total = filtered.length;
    statDone.textContent = done;
    statTotal.textContent = total;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    progressFill.style.width = pct + '%';
    $('#progress-bar').setAttribute('aria-valuenow', pct);
  }


  function parseMarkdown(str) {
    let html = escHtml(str);
    // Bold **text**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    return html;
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }


  let customRoles = JSON.parse(localStorage.getItem('eduplanner_custom_roles')) || {};
  Object.assign(ROLE_LABELS, customRoles);

  // Create tabs for custom roles
  const tabsScroll = document.querySelector('.tabs-scroll');
  const addRoleBtn = document.getElementById('add-role-btn');
  function addRoleTab(key, label) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.role = key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${escHtml(label)}`;
    tabsScroll.insertBefore(btn, addRoleBtn);
    return btn;
  }
  for (const [key, label] of Object.entries(customRoles)) {
    if (isSafeRoleKey(key) && typeof label === 'string') addRoleTab(key, label);
  }


  // Search event
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderTasks();
    });
  }


  // ---------- View Toggle (List vs Calendar) ----------
  let currentViewMode = 'list'; // 'list' or 'calendar'
  const viewToggleBtn = document.getElementById('view-toggle-btn');
  const calendarContainer = document.getElementById('calendar-view');

  if (viewToggleBtn) {
    viewToggleBtn.addEventListener('click', () => {
      currentViewMode = currentViewMode === 'list' ? 'calendar' : 'list';
      updateViewToggleText();
      renderTasks();
    });
  }

  function updateViewToggleText() {
    if (viewToggleBtn) viewToggleBtn.textContent = tr(currentViewMode === 'list' ? 'switchToCalendar' : 'switchToList');
  }

  function renderCalendarView(tasksToRender) {
    taskList.style.display = 'none';
    calendarContainer.style.display = 'grid';
    calendarContainer.innerHTML = '';

    // Group tasks by dueDate (or "No Date")
    const grouped = tasksToRender.reduce((acc, t) => {
      const dateKey = t.dueDate || 'No Date';
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(t);
      return acc;
    }, {});

    // Sort dates
    const sortedDates = Object.keys(grouped).sort((a, b) => {
      if (a === 'No Date') return 1;
      if (b === 'No Date') return -1;
      return new Date(a) - new Date(b);
    });

    if (sortedDates.length === 0) {
      calendarContainer.style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    sortedDates.forEach(date => {
      const col = document.createElement('div');
      col.style.border = '1px solid var(--color-border)';
      col.style.borderRadius = '8px';
      col.style.background = 'var(--color-surface-2)';
      col.style.padding = '10px';
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.gap = '8px';

      const header = document.createElement('div');
      header.style.fontWeight = 'bold';
      header.style.borderBottom = '1px solid var(--color-divider)';
      header.style.paddingBottom = '5px';
      header.style.marginBottom = '5px';
      header.style.color = date === 'No Date' ? 'var(--color-text-muted)' : 'var(--color-primary)';
      header.textContent = date === 'No Date' ? tr('noDate') : formatDate(date);
      col.appendChild(header);

      grouped[date].forEach(t => {
        const tDiv = document.createElement('div');
        tDiv.style.background = 'var(--color-bg)';
        tDiv.style.padding = '8px';
        tDiv.style.borderRadius = '4px';
        tDiv.style.fontSize = '12px';
        tDiv.style.borderLeft = t.done ? '3px solid var(--color-success)' : '3px solid var(--color-accent)';
        if (t.done) tDiv.style.opacity = '0.6';

        tDiv.innerHTML = `
          <div style="${t.done ? 'text-decoration:line-through' : ''}">${parseMarkdown(taskText(t.text))}</div>
          ${t.tag ? `<span style="font-size:9px; background:var(--color-surface-2); padding:1px 4px; border-radius:3px; margin-top:4px; display:inline-block;">${escHtml(t.tag)}</span>` : ''}
        `;
        col.appendChild(tDiv);
      });

      calendarContainer.appendChild(col);
    });
  }

  // ---------- Event Handlers ----------

  // Add Role Button
  if ($('#add-role-btn')) {
    $('#add-role-btn').addEventListener('click', async () => {
      const roleName = await askText({
        title: tr('addRoleTitle'),
        okLabel: tr('add'),
        field: { label: tr('roleNameLabel'), placeholder: tr('rolePlaceholder'), maxlength: 60 }
      });
      if (roleName) {
        const roleKey = roleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50);
        if (!roleKey || !isSafeRoleKey(roleKey)) {
           showToast(tr('roleInvalid'));
           return;
        }
        if (ROLE_LABELS[roleKey]) {
           showToast(tr('roleExists'));
           return;
        }
        ROLE_LABELS[roleKey] = roleName.trim();
        customRoles[roleKey] = roleName.trim();
        localStorage.setItem('eduplanner_custom_roles', JSON.stringify(customRoles));

        // Add default empty tasks array for this role
        tasks[roleKey] = [];
        saveTasks();

        addRoleTab(roleKey, roleName.trim()).click();
        showToast(tr('roleAdded'));
      }
    });
  }

  // Role tabs (delegated, so tabs added at runtime work without a reload)
  tabsScroll.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab[data-role]');
    if (!tab) return;
    $$('.tab[data-role]').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    currentRole = tab.dataset.role;
    if (window.Analytics) window.Analytics.track('planner_view', { role: currentRole, frequency: currentFreq });
    activeTagFilter = null;
    renderTasks();
  });

  // Frequency tabs
  $$('.freq-tab[data-freq]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.freq-tab[data-freq]').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentFreq = tab.dataset.freq;
      if (window.Analytics) window.Analytics.track('planner_view', { role: currentRole, frequency: currentFreq });
      taskFreqSelect.value = currentFreq === 'all' ? 'daily' : currentFreq;
      renderTasks();
    });
  });

  // Add task
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    const dueDate = $('#new-task-date').value;
    const tag = $('#new-task-tag') ? $('#new-task-tag').value.trim().replace(/^#/, '').slice(0, 40) : '';
    if (!text) return;

    const freq = taskFreqSelect.value;
    if (!tasks[currentRole]) tasks[currentRole] = [];
    if (window.Analytics) window.Analytics.track('task_create', { role: currentRole, frequency: freq });
    tasks[currentRole].push({
      id: uid(),
      text,
      freq,
      dueDate: dueDate || null,
      tag: tag || null,
      subtasks: [],
      done: false
    });
    saveTasks();
    taskInput.value = '';
    $('#new-task-date').value = '';
    if ($('#new-task-tag')) $('#new-task-tag').value = '';
    // Switch freq view if needed
    if (currentFreq !== 'all' && currentFreq !== freq) {
      // Auto switch to the frequency of the added task
      $$('.freq-tab[data-freq]').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      const target = $(`.freq-tab[data-freq="${freq}"]`);
      if (target) {
        target.classList.add('active');
        target.setAttribute('aria-selected', 'true');
      }
      currentFreq = freq;
    }
    renderTasks();
    showToast(tr('taskAdded'));
  });

  // Clear completed
  $('#clear-done').addEventListener('click', () => {
    if (!tasks[currentRole]) return;
    const before = tasks[currentRole].length;

    const completed = tasks[currentRole].filter(t => t.done);
    completed.forEach(t => archiveTask(t, currentRole));
    saveArchive();
    tasks[currentRole] = tasks[currentRole].filter(t => !t.done);

    const removed = before - tasks[currentRole].length;
    if (removed > 0) {
      saveTasks();
      renderTasks();
      showToast(tr('cleared', { n: removed }));
    } else {
      showToast(tr('noCompleted'));
    }
  });

  // ---------- Export: PDF ----------
  $('#export-pdf').addEventListener('click', () => {
    if (window.Analytics) window.Analytics.track('export_data', { export_type: 'pdf', role: currentRole });
    const roleTasks = tasks[currentRole] || [];
    if (roleTasks.length === 0) {
      showToast(tr('noTasksExport'));
      return;
    }

    const roleName = roleLabel(currentRole);
    const now = new Date();
    const dateStr = now.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

    // Build PDF using jsPDF-like manual approach with print
    const printWin = window.open('', '_blank', 'width=800,height=600');
    if (!printWin) {
      showToast(tr('popupBlocked'));
      return;
    }

    const groupedHtml = buildGroupedHtml(roleTasks, roleName, dateStr);

    printWin.document.write(`<!DOCTYPE html>
<html lang="${(I18N.locales[currentLang] || I18N.locales.en).html}"><head><meta charset="utf-8"><title>EduPlanner - ${escHtml(tr('roleTaskReport', { role: roleName }))}</title>
<style>
  @import url('https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'General Sans', sans-serif; padding: 40px; color: #1A2E1A; font-size: 13px; line-height: 1.5; }
  .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #1B5E4B; }
  .pdf-brand { font-size: 20px; font-weight: 700; color: #1B5E4B; }
  .pdf-brand-sub { font-size: 11px; color: #5C6B5C; font-weight: 500; }
  .pdf-meta { text-align: right; font-size: 12px; color: #5C6B5C; }
  .pdf-role { font-size: 16px; font-weight: 700; color: #1A2E1A; margin-bottom: 4px; }
  h2 { font-size: 14px; font-weight: 700; color: #1B5E4B; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.06em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; padding: 6px 10px; background: #E6F2ED; color: #1B5E4B; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  td { padding: 7px 10px; border-bottom: 1px solid #DDD9D1; font-size: 13px; }
  .status-done { color: #2D8654; font-weight: 600; }
  .status-pending { color: #A07020; font-weight: 600; }
  .pdf-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #DDD9D1; font-size: 10px; color: #9EA89E; text-align: center; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="pdf-header">
    <div>
      <div class="pdf-brand">EduPlanner</div>
      <div class="pdf-brand-sub">Harmony Digital Consults Ltd</div>
    </div>
    <div class="pdf-meta">
      <div class="pdf-role">${escHtml(tr('roleTaskReport', { role: roleName }))}</div>
      <div>${escHtml(tr('generated', { date: dateStr }))}</div>
    </div>
  </div>
  ${groupedHtml}
  <div class="pdf-footer">
    EduPlanner by Harmony Digital Consults Ltd &middot; Open Source &middot; eduplanner.harmonyconsults.com
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body></html>`);
    printWin.document.close();
    showToast(tr('pdfReady'));
  });

  function buildGroupedHtml(roleTasks, roleName, dateStr) {
    let html = '';
    ['daily', 'weekly', 'monthly'].forEach(freq => {
      const items = roleTasks.filter(t => t.freq === freq);
      if (items.length === 0) return;
      html += `<h2>${escHtml(tr('freqTasks', { freq: tr(freq) }))}</h2>
      <table>
        <thead><tr><th style="width:5%">#</th><th>${escHtml(tr('colTask'))}</th><th style="width:15%">${escHtml(tr('colStatus'))}</th></tr></thead>
        <tbody>`;
      items.forEach((t, i) => {
        html += `<tr>
          <td>${i + 1}</td>
          <td>${escHtml(taskText(t.text))}</td>
          <td class="${t.done ? 'status-done' : 'status-pending'}">${escHtml(tr(t.done ? 'statusDone' : 'statusPending'))}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    });
    return html;
  }

  // ---------- Export: Excel ----------
  $('#export-excel').addEventListener('click', () => {
    if (window.Analytics) window.Analytics.track('export_data', { export_type: 'excel', role: currentRole });
    const roleTasks = tasks[currentRole] || [];
    if (roleTasks.length === 0) {
      showToast(tr('noTasksExport'));
      return;
    }

    if (typeof XLSX === 'undefined') {
      showToast(tr('excelMissing'));
      return;
    }

    const roleName = roleLabel(currentRole);
    const now = new Date();
    const dateStr = now.toLocaleDateString(dateLocale());

    // Build worksheet data
    const wsData = [
      ['EduPlanner - ' + tr('taskReport')],
      [tr('roleLabel'), roleName],
      [tr('dateLabel'), dateStr],
      [tr('generatedBy'), 'Harmony Digital Consults Ltd'],
      [],
      ['#', tr('colTask'), tr('colFrequency'), tr('colStatus')]
    ];

    roleTasks.forEach((t, i) => {
      wsData.push([
        i + 1,
        taskText(t.text),
        tr(t.freq),
        tr(t.done ? 'statusDone' : 'statusPending')
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    ws['!cols'] = [
      { wch: 5 },
      { wch: 50 },
      { wch: 12 },
      { wch: 12 }
    ];

    const wb = XLSX.utils.book_new();
    // Sheet names: max 31 chars, no : \ / ? * [ ]
    XLSX.utils.book_append_sheet(wb, ws, roleName.replace(/[:\\/?*\[\]]/g, ' ').slice(0, 31));
    XLSX.writeFile(wb, `EduPlanner_${roleName.replace(/[\s:\\/?*\[\]]/g, '_')}_${dateStr.replace(/[\/.]/g, '-')}.xlsx`);
    showToast(tr('excelDownloaded'));
  });


  // ---------- Export: JSON Backup ----------
  $('#export-backup').addEventListener('click', () => downloadBackup());

  // ---------- Import: JSON Backup ----------
  $('#import-backup-btn').addEventListener('click', () => {
    $('#import-backup-input').click();
  });

  $('#import-backup-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const raw = JSON.parse(event.target.result);
        // v2 backups wrap the data: { app: 'EduPlanner', version: 2, tasks, customRoles, notes }
        // v1 backups are just the tasks object
        const isV2 = raw && raw.app === 'EduPlanner' && raw.tasks;
        const importedTasks = sanitizeBackup(isV2 ? raw.tasks : raw);
        if (!importedTasks) throw new Error('Invalid format');
        const backupLabels = {};
        if (isV2 && raw.customRoles && typeof raw.customRoles === 'object') {
          for (const [key, label] of Object.entries(raw.customRoles)) {
            if (isSafeRoleKey(key) && typeof label === 'string' && label.trim()) {
              backupLabels[key] = label.trim().slice(0, 60);
            }
          }
        }
        const backupNotes = isV2 && typeof raw.notes === 'string' ? raw.notes.slice(0, 100000) : null;
        const backupHistory = isV2 && Array.isArray(raw.history) ? sanitizeHistory(raw.history) : null;
        const backupTerms = isV2 && Array.isArray(raw.terms) ? sanitizeTerms(raw.terms) : null;
        const lo = isV2 ? raw.lastOpened : null;
        const backupLastOpened = lo && typeof lo === 'object' && typeof lo.daily === 'string' && DATE_RE.test(lo.daily) &&
          typeof lo.weekly === 'string' && typeof lo.monthly === 'string'
          ? { daily: lo.daily, weekly: lo.weekly.slice(0, 20), monthly: lo.monthly.slice(0, 20) }
          : null;

        const count = Object.values(importedTasks).reduce((n, list) => n + list.length, 0);
        const ok = await askConfirm({
          title: tr('restoreBackup'),
          message: tr(backupNotes ? 'restoreConfirmTasksNotes' : 'restoreConfirmTasks', { n: count }),
          okLabel: tr('restore'),
          danger: true
        });
        if (ok) {
          tasks = importedTasks;
          // Make sure every restored role has a tab
          for (const role of Object.keys(tasks)) {
            if (!ROLE_LABELS[role]) {
              const label = backupLabels[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              ROLE_LABELS[role] = label;
              customRoles[role] = label;
              addRoleTab(role, label);
            }
          }
          try {
            localStorage.setItem('eduplanner_custom_roles', JSON.stringify(customRoles));
            if (backupNotes !== null) localStorage.setItem('eduplanner_notes', backupNotes);
          } catch (_) { /* saveTasks below reports storage problems */ }
          const notesBox = document.getElementById('scratchpad-textarea');
          if (notesBox && backupNotes !== null) notesBox.value = backupNotes;
          if (backupHistory) {
            historyLog = backupHistory;
            saveHistory();
          }
          if (backupTerms) saveTerms(backupTerms);
          saveTasks();
          // Ticks in the backup belong to the day/week/month it was made:
          // reset (and record history for) any period that has since ended
          if (backupLastOpened) {
            try { localStorage.setItem('eduplanner_last_opened', JSON.stringify(backupLastOpened)); } catch (_) { /* ignore */ }
            checkRecurringResets();
          }
          updateAnalytics();
          renderTasks();
          hideDataNotice();
          if (window.Analytics) window.Analytics.track('import_data', { export_type: 'backup' });
          showToast(tr('backupRestored'));
        }
      } catch (err) {
        showToast(tr('backupError'));
      }
      e.target.value = ''; // reset
    };
    reader.readAsText(file);
  });


  // ---------- Localization / i18n ----------
  // Static text is marked in index.html with data-i18n (text),
  // data-i18n-placeholder and data-i18n-aria-label.
  function applyLanguage(lang) {
    currentLang = I18N.ui[lang] ? lang : 'en';
    document.documentElement.lang = (I18N.locales[currentLang] || I18N.locales.en).html;
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = tr(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = tr(el.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', tr(el.dataset.i18nAriaLabel)); });
    if (langSelect) langSelect.value = currentLang;

    // Text built by the app
    const themeToggle = $('[data-theme-toggle]');
    if (themeToggle) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeToggle.setAttribute('aria-label', tr(isDark ? 'themeToLight' : 'themeToDark'));
    }
    updateViewToggleText();
    refreshConsentUI();
    if (currentNotice) {
      const kind = currentNotice;
      currentNotice = null;
      showDataNotice(kind);
    }
    renderTasks();
    renderTrash();
    renderTermChip();
  }

  const langSelect = $('#lang-select');
  if (langSelect) {
    if (window.Analytics) { window.Analytics.track('app_open', { app_version: APP_VERSION }); window.Analytics.page('Home'); }

    langSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* storage blocked */ }
    if (window.Analytics) window.Analytics.track('settings_change', { setting_key: 'language' });
      applyLanguage(lang);
    });
  }


  // ---------- Notifications ----------
  const notifsBtn = document.getElementById('enable-notifs-btn');
  const hasNotifications = typeof window.Notification !== "undefined";
  if (notifsBtn && !hasNotifications) notifsBtn.style.display = "none";
  if (notifsBtn && hasNotifications) {
    if (Notification.permission === 'granted') {
      notifsBtn.style.display = 'none';
    }

    notifsBtn.addEventListener('click', () => {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          notifsBtn.style.display = 'none';
          showToast(tr('notifEnabled'));
          checkDueTasks();
        } else {
          showToast(tr('notifDenied'));
        }
      });
    });
  }

  function checkDueTasks() {
    if (!hasNotifications || Notification.permission !== "granted") return;

    const today = localDateStr(new Date());
    let dueCount = 0;

    // Check all roles
    for (const r in tasks) {
      if (tasks[r]) {
        tasks[r].forEach(t => {
          if (!t.done && t.dueDate && t.dueDate <= today) {
            dueCount++;
          }
        });
      }
    }

    if (dueCount > 0) {
      new Notification(tr('notifTitle'), {
        body: tr('notifBody', { n: dueCount }),
        icon: 'icons/icon-192.png'
      });
    }
  }


  // ---------- Scratchpad ----------
  const scratchpadHeader = document.getElementById('scratchpad-header');
  const scratchpadBody = document.getElementById('scratchpad-body');
  const scratchpadTextarea = document.getElementById('scratchpad-textarea');
  const scratchpadIcon = document.getElementById('scratchpad-toggle-icon');

  if (scratchpadHeader && scratchpadTextarea) {
    // Load saved notes
    scratchpadTextarea.value = localStorage.getItem('eduplanner_notes') || '';

    // Toggle open/close
    scratchpadHeader.addEventListener('click', () => {
      const isOpen = !scratchpadBody.hidden;
      scratchpadBody.hidden = isOpen;
      scratchpadHeader.setAttribute('aria-expanded', String(!isOpen));
      document.getElementById('scratchpad-container').classList.toggle('open', !isOpen);
      scratchpadIcon.innerHTML = isOpen
        ? '<polyline points="18 15 12 9 6 15"></polyline>'
        : '<polyline points="6 9 12 15 18 9"></polyline>';
      if (!isOpen) scratchpadTextarea.focus();
    });

    // Auto-save on type
    scratchpadTextarea.addEventListener('input', (e) => {
      try {
        localStorage.setItem('eduplanner_notes', e.target.value);
      } catch (err) {
        if (!storageWarningShown) {
          storageWarningShown = true;
          showDataNotice('storage-error');
        }
      }
    });
  }


  // ---------- Pomodoro Timer ----------
  let pomoInterval = null;
  let pomoTime = 25 * 60; // 25 minutes
  let pomoRunning = false;

  const pomoDisplay = document.getElementById('pomodoro-display');
  const pomoStart = document.getElementById('pomodoro-start');
  const pomoReset = document.getElementById('pomodoro-reset');

  function updatePomoDisplay() {
    if (!pomoDisplay) return;
    const m = Math.floor(pomoTime / 60).toString().padStart(2, '0');
    const s = (pomoTime % 60).toString().padStart(2, '0');
    pomoDisplay.textContent = `${m}:${s}`;
  }

  if (pomoStart && pomoReset) {
    pomoStart.addEventListener('click', () => {
      if (pomoRunning) {
        clearInterval(pomoInterval);
        pomoRunning = false;
        pomoStart.textContent = '▶';
      } else {
        pomoRunning = true;
        pomoStart.textContent = '⏸';
        pomoInterval = setInterval(() => {
          if (pomoTime > 0) {
            pomoTime--;
            updatePomoDisplay();
          } else {
            clearInterval(pomoInterval);
            pomoRunning = false;
            pomoStart.textContent = '▶';
            showToast(tr('timeUp'));
            if (hasNotifications && Notification.permission === "granted") {
              new Notification(tr('timerTitle'), { body: tr('timerBody'), icon: 'icons/icon-192.png' });
            }
          }
        }, 1000);
      }
    });

    pomoReset.addEventListener('click', () => {
      clearInterval(pomoInterval);
      pomoRunning = false;
      pomoTime = 25 * 60;
      pomoStart.textContent = '▶';
      updatePomoDisplay();
    });

    updatePomoDisplay();
  }


  // ---------- Keyboard Shortcuts ----------
  window.addEventListener('keydown', (e) => {
    // Check if user is typing in an input
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

    // Ctrl/Cmd + F to focus search
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.focus();
    }

    // Escape to clear search or scratchpad focus
    if (e.key === 'Escape') {
      const searchInput = document.getElementById('search-input');
      if (document.activeElement === searchInput) {
        searchInput.value = '';
        searchInput.blur();
        renderTasks();
      } else {
        document.activeElement.blur();
      }
    }

    // Ctrl/Cmd + N to focus Add Task
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (taskInput) taskInput.focus();
    }
  });

  // ---------- Theme Toggle ----------
  (function initTheme() {
    const toggle = $('[data-theme-toggle]');
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('eduplanner_theme');
    let theme = savedTheme ? savedTheme : (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light');
    root.setAttribute('data-theme', theme);
    updateToggleIcon(toggle, theme);

    toggle.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', theme);
      localStorage.setItem('eduplanner_theme', theme);
    if (window.Analytics) window.Analytics.track('theme_change', { theme_name: theme });
      toggle.setAttribute('aria-label', tr(theme === 'dark' ? 'themeToLight' : 'themeToDark'));
      updateToggleIcon(toggle, theme);
    });
  })();

  function updateToggleIcon(btn, theme) {
    btn.innerHTML = theme === 'dark'
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  // ---------- Toast ----------

  function showUndoToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `${escHtml(msg)} <button class="btn-undo" style="margin-left: 10px; background:transparent; color:var(--color-primary-light); border:none; cursor:pointer; font-weight:bold; text-decoration:underline;">${escHtml(tr('undo'))}</button>`;

    toast.querySelector('.btn-undo').addEventListener('click', () => {
      if (lastDeletedTask && lastDeletedRole) {
        if (!tasks[lastDeletedRole]) tasks[lastDeletedRole] = [];
        tasks[lastDeletedRole].push(lastDeletedTask);
        // remove from archive
        archive = archive.filter(a => a.id !== lastDeletedTask.id);
        saveArchive();
        saveTasks();
        if (currentRole === lastDeletedRole) renderTasks();
        lastDeletedTask = null;
        toast.remove();
        showToast(tr('taskRestored'));
      }
    });

    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
      }
    }, 4000); // give them a bit more time to click undo
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 200);
    }, 2400);
  }

  // ---------- PWA Install ----------
  let deferredPrompt = null;
  const installBtn = $('#install-btn');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.style.display = 'inline-flex';
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
    if (outcome === 'accepted') showToast(tr('appInstalled'));
  });

  // ---------- Analytics consent (opt-in) ----------
  let refreshConsentUI = () => {};
  (function initAnalyticsConsent() {
    const A = window.Analytics;
    if (!A || !A.isAvailable || !A.isAvailable()) return; // not configured, or DNT/GPC set

    const banner = $('#consent-banner');
    const toggle = $('#analytics-toggle');
    $$('[data-analytics-only]').forEach(el => { el.hidden = false; });

    function refresh() {
      const consent = A.getConsent();
      if (toggle) toggle.textContent = tr(consent === 'granted' ? 'usageOn' : 'usageOff');
      if (banner) banner.hidden = consent !== null;
    }

    function choose(granted) {
      A.setConsent(granted);
      refresh();
      if (granted) A.track('settings_change', { setting_key: 'analytics_consent' });
      showToast(tr(granted ? 'consentOn' : 'consentOff'));
    }

    if (banner) {
      $('#consent-accept').addEventListener('click', () => choose(true));
      $('#consent-decline').addEventListener('click', () => choose(false));
    }
    if (toggle) {
      toggle.addEventListener('click', () => choose(A.getConsent() !== 'granted'));
    }
    refreshConsentUI = refresh;
    refresh();
  })();

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }


  // ---------- Share via URL ----------
  const shareBtn = document.getElementById('share-url-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      if (!tasks[currentRole] || tasks[currentRole].length === 0) {
        showToast(tr('nothingToShare'));
        return;
      }

      const roleData = JSON.stringify({ role: currentRole, data: tasks[currentRole] });
      const encoded = btoa(encodeURIComponent(roleData));

      const url = new URL(window.location.href);
      url.searchParams.set('import', encoded);

      navigator.clipboard.writeText(url.toString()).then(() => {
        showToast(tr('linkCopied'));
      }).catch(() => {
        openDialog({
          title: tr('shareRole'),
          fields: [{ name: 'url', label: tr('copyManually'), value: url.toString(), readonly: true }],
          okLabel: tr('close'),
          cancel: false
        });
      });
    });
  }

  // Check URL for import on load
  async function checkUrlImport() {
    const urlParams = new URLSearchParams(window.location.search);
    const importData = urlParams.get('import');

    if (importData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(atob(importData)));
        const importedList = decoded ? sanitizeTaskList(decoded.data) : [];
        if (decoded && isSafeRoleKey(decoded.role) && importedList.length) {
          const ok = await askConfirm({
            title: tr('importTitle'),
            message: tr('importConfirm', { n: importedList.length, role: roleLabel(decoded.role) }),
            okLabel: tr('importBtn')
          });
          if (ok) {

            if (!tasks[decoded.role]) tasks[decoded.role] = [];

            // Append imported tasks, avoiding identical duplicates by text
            let addedCount = 0;
            importedList.forEach(importedTask => {
              const exists = tasks[decoded.role].find(t => t.text === importedTask.text);
              if (!exists) {
                tasks[decoded.role].push(importedTask);
                addedCount++;
              }
            });

            saveTasks();

            // Remove parameter from URL so it doesn't ask on refresh
            window.history.replaceState({}, document.title, window.location.pathname);

            // Switch to that role tab
            let targetTab = Array.from($$('.tab[data-role]')).find(t => t.dataset.role === decoded.role);
            if (!targetTab) {
              const label = decoded.role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              ROLE_LABELS[decoded.role] = label;
              customRoles[decoded.role] = label;
              localStorage.setItem('eduplanner_custom_roles', JSON.stringify(customRoles));
              targetTab = addRoleTab(decoded.role, label);
            }
            targetTab.click();
            updateAnalytics();

            setTimeout(() => {
                showToast(tr('imported', { n: addedCount }));
            }, 500);
          } else {
             window.history.replaceState({}, document.title, window.location.pathname);
          }
        }
      } catch(e) {
        showToast(tr('importFailed'));
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }

  // ---------- Data safety: backups, reminders, notices ----------
  const BACKUP_KEY = 'eduplanner_last_backup';          // ms timestamp
  const CHANGE_KEY = 'eduplanner_last_change';          // ms timestamp
  const FIRST_USE_KEY = 'eduplanner_first_use';         // ms timestamp
  const SNOOZE_KEY = 'eduplanner_backup_snooze_until';  // ms timestamp
  const RESTORE_OFFER_KEY = 'eduplanner_restore_offer_dismissed';
  const BACKUP_REMIND_DAYS = 14;
  const SNOOZE_DAYS = 7;

  function getTime(key) {
    try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; }
  }
  function setTime(key, ms) {
    try { localStorage.setItem(key, String(ms)); } catch (e) { /* storage full or blocked */ }
  }

  let persistRequested = false;
  // Ask the browser not to clear EduPlanner's storage automatically.
  // Done after the user's first real change, so any browser prompt has context.
  function requestPersistentStorage() {
    if (persistRequested || !navigator.storage || !navigator.storage.persist) return;
    persistRequested = true;
    navigator.storage.persisted()
      .then(already => already || navigator.storage.persist())
      .catch(() => {});
  }

  function onUserDataChange() {
    setTime(CHANGE_KEY, Date.now());
    requestPersistentStorage();
  }

  function buildBackup() {
    let notes = '';
    try { notes = localStorage.getItem('eduplanner_notes') || ''; } catch (e) { /* ignore */ }
    return {
      app: 'EduPlanner',
      version: 2,
      exportedAt: new Date().toISOString(),
      tasks,
      customRoles,
      notes,
      history: historyLog,
      terms: schoolTerms,
      // When the ticks were last current, so a restore can reset them correctly
      lastOpened: readJSON('eduplanner_last_opened', null)
    };
  }

  function downloadBackup() {
    if (window.Analytics) window.Analytics.track('export_data', { export_type: 'backup', role: currentRole });
    const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'eduplanner_backup_' + localDateStr(new Date()) + '.json';
    document.body.appendChild(a); // required for Firefox
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setTime(BACKUP_KEY, Date.now());
    if (currentNotice === 'backup-reminder' || currentNotice === 'storage-error') hideDataNotice();
    showToast(tr('backupDownloaded'));
  }

  // Inline notice above the planner (one at a time, most important wins)
  const NOTICES = {
    'storage-error': {
      rank: 3,
      text: 'noticeStorageError',
      primary: ['downloadBackup', () => downloadBackup()],
      secondary: ['dismiss', () => hideDataNotice()]
    },
    'unreadable': {
      rank: 2,
      text: 'noticeUnreadable',
      primary: ['restoreBackup', () => $('#import-backup-input').click()],
      secondary: ['dismiss', () => hideDataNotice()]
    },
    'backup-reminder': {
      rank: 1,
      text: 'noticeBackupReminder',
      primary: ['downloadBackup', () => downloadBackup()],
      secondary: ['remindLater', () => {
        setTime(SNOOZE_KEY, Date.now() + SNOOZE_DAYS * DAY_MS);
        hideDataNotice();
      }]
    },
    'restore-offer': {
      rank: 0,
      text: 'noticeRestoreOffer',
      primary: ['restoreBackup', () => $('#import-backup-input').click()],
      secondary: ['noThanks', () => {
        try { localStorage.setItem(RESTORE_OFFER_KEY, '1'); } catch (e) { /* ignore */ }
        hideDataNotice();
      }]
    }
  };
  let currentNotice = null;

  function showDataNotice(kind) {
    const n = NOTICES[kind];
    const box = document.getElementById('data-notice');
    if (!n || !box) return;
    if (currentNotice && NOTICES[currentNotice].rank > n.rank) return;
    currentNotice = kind;
    box.dataset.kind = kind;
    $('#data-notice-text').textContent = tr(n.text);
    $('#data-notice-primary').textContent = tr(n.primary[0]);
    $('#data-notice-secondary').textContent = tr(n.secondary[0]);
    box.hidden = false;
  }

  function hideDataNotice() {
    const box = document.getElementById('data-notice');
    if (box) box.hidden = true;
    currentNotice = null;
  }

  if (document.getElementById('data-notice')) {
    $('#data-notice-primary').addEventListener('click', () => currentNotice && NOTICES[currentNotice].primary[1]());
    $('#data-notice-secondary').addEventListener('click', () => currentNotice && NOTICES[currentNotice].secondary[1]());
  }

  function checkDataNotices() {
    const now = Date.now();
    let firstUse = getTime(FIRST_USE_KEY);
    if (!firstUse) {
      firstUse = now;
      setTime(FIRST_USE_KEY, now);
    }

    if (loadFailed) {
      showDataNotice('unreadable');
      return;
    }

    if (isFirstRun) {
      let dismissed = false;
      try { dismissed = localStorage.getItem(RESTORE_OFFER_KEY) === '1'; } catch (e) { /* ignore */ }
      if (!dismissed) showDataNotice('restore-offer');
      return;
    }

    const lastBackup = getTime(BACKUP_KEY);
    const lastChange = getTime(CHANGE_KEY);
    const due = now - Math.max(lastBackup, firstUse) >= BACKUP_REMIND_DAYS * DAY_MS;
    if (lastChange > lastBackup && due && now >= getTime(SNOOZE_KEY)) {
      showDataNotice('backup-reminder');
    }
  }

  // ---------- Recently deleted panel ----------
  const trashBtn = document.getElementById('trash-btn');
  const trashPanel = document.getElementById('trash-panel');

  function renderTrash() {
    if (!trashBtn || !trashPanel) return;
    trashBtn.querySelector('.trash-count').textContent = archive.length ? ` (${archive.length})` : '';
    if (trashPanel.hidden) return;

    const list = $('#trash-list');
    list.innerHTML = '';
    $('#trash-none').hidden = archive.length > 0;
    $('#trash-empty').hidden = archive.length === 0;

    // Newest first; keep the archive index so Restore targets the right entry
    archive
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => Date.parse(b.entry.deletedAt) - Date.parse(a.entry.deletedAt))
      .forEach(({ entry, index }) => {
      const li = document.createElement('li');
      li.className = 'trash-item';

      const info = document.createElement('div');
      info.className = 'trash-info';
      const text = document.createElement('span');
      text.className = 'trash-text';
      text.textContent = taskText(entry.text);
      const meta = document.createElement('span');
      meta.className = 'trash-meta';
      const when = new Date(entry.deletedAt).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' });
      meta.textContent = tr('trashMeta', { role: roleLabel(entry.role), freq: tr(entry.freq || 'daily'), date: when });
      info.append(text, meta);

      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'btn btn-outline btn-sm';
      restore.textContent = tr('restore');
      restore.addEventListener('click', () => restoreFromTrash(index));

      li.append(info, restore);
      list.appendChild(li);
    });
  }

  function restoreFromTrash(index) {
    const entry = archive[index];
    if (!entry) return;
    const role = isSafeRoleKey(entry.role) ? entry.role : currentRole;
    const { deletedAt, role: _role, ...task } = entry;
    if (!tasks[role]) tasks[role] = [];
    if (tasks[role].some(t => t.id === task.id)) task.id = uid();
    tasks[role].push(task);
    archive.splice(index, 1);
    saveTasks();
    saveArchive();
    updateAnalytics();
    renderTasks();
    showToast(tr('restoredTo', { role: roleLabel(role) }));
  }

  if (trashBtn && trashPanel) {
    trashBtn.addEventListener('click', () => {
      trashPanel.hidden = !trashPanel.hidden;
      trashBtn.setAttribute('aria-expanded', String(!trashPanel.hidden));
      renderTrash();
    });
    $('#trash-empty').addEventListener('click', async () => {
      if (!archive.length) return;
      const ok = await askConfirm({
        title: tr('trashEmptyTitle'),
        message: tr('emptyConfirm', { n: archive.length }),
        okLabel: tr('deleteForever'),
        danger: true
      });
      if (ok) {
        archive = [];
        saveArchive();
        showToast(tr('trashEmptied'));
      }
    });
  }

  // ---------- School terms: chip and settings ----------
  function saveTerms(list) {
    schoolTerms = sanitizeTerms(list);
    try {
      localStorage.setItem(TERMS_KEY, JSON.stringify(schoolTerms));
    } catch (e) { /* storage full or blocked */ }
    renderTermChip();
  }

  // The term containing today, else the most recent one that has started
  function currentOrLastTerm(today) {
    const i = termIndexFor(today);
    if (i > -1) return schoolTerms[i];
    return schoolTerms.filter(t => t && t.start <= today).sort((a, b) => b.start.localeCompare(a.start))[0] || null;
  }

  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY_MS);
  }

  function renderTermChip() {
    const chip = document.getElementById('term-chip');
    if (!chip) return;
    const label = document.getElementById('term-chip-text');
    const today = localDateStr(new Date());
    chip.classList.remove('holiday');
    if (!termsSet()) {
      label.textContent = tr('setTerms');
      chip.title = tr('schoolTerms');
      return;
    }
    chip.title = tr('historyPaused');
    const i = termIndexFor(today);
    if (i > -1) {
      const t = schoolTerms[i];
      const name = tr(TERM_NAMES[i]);
      if (inBreak(t, today)) {
        label.textContent = tr('midTermBreak', { term: name });
        chip.classList.add('holiday');
      } else {
        const week = Math.floor(daysBetween(t.start, today) / 7) + 1;
        const total = Math.ceil((daysBetween(t.start, t.end) + 1) / 7);
        label.textContent = tr('termWeek', { term: name, week, total });
      }
      return;
    }
    chip.classList.add('holiday');
    const nextIdx = schoolTerms
      .map((t, idx) => (t && t.start > today ? idx : -1))
      .filter(idx => idx > -1)
      .sort((a, b) => schoolTerms[a].start.localeCompare(schoolTerms[b].start))[0];
    label.textContent = nextIdx !== undefined
      ? tr('holidayNext', { term: tr(TERM_NAMES[nextIdx]), date: formatDate(schoolTerms[nextIdx].start) })
      : tr('holiday');
  }

  async function openTermsDialog() {
    const fields = [];
    TERM_NAMES.forEach((key, i) => {
      const t = schoolTerms[i] || {};
      fields.push(
        { type: 'heading', label: tr(key) },
        { name: `start${i}`, label: tr('termStarts'), type: 'date', value: t.start || '', row: `a${i}` },
        { name: `end${i}`, label: tr('termEnds'), type: 'date', value: t.end || '', row: `a${i}` },
        { name: `bstart${i}`, label: tr('breakStarts'), type: 'date', value: t.breakStart || '', row: `b${i}` },
        { name: `bend${i}`, label: tr('breakEnds'), type: 'date', value: t.breakEnd || '', row: `b${i}` }
      );
    });
    const r = await openDialog({ title: tr('schoolTerms'), message: tr('schoolTermsHint'), okLabel: tr('save'), fields });
    if (!r) return;
    saveTerms(TERM_NAMES.map((_, i) => ({
      start: r[`start${i}`], end: r[`end${i}`], breakStart: r[`bstart${i}`], breakEnd: r[`bend${i}`]
    })));
    showToast(tr('termsSaved'));
  }

  const termChip = document.getElementById('term-chip');
  if (termChip) termChip.addEventListener('click', () => openTermsDialog());

  // ---------- Term report ----------
  const REPORT_INFO_KEY = 'eduplanner_report_info';

  function allRoleKeys() {
    const keys = [...BUILT_IN_ROLES];
    Object.keys(tasks).concat(Object.keys(customRoles)).forEach(k => { if (!keys.includes(k)) keys.push(k); });
    return keys;
  }

  // Monday of the ISO week containing "YYYY-MM-DD"
  function weekStart(isoDate) {
    const d = new Date(isoDate + 'T00:00:00');
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return localDateStr(d);
  }

  // Gather the recorded history for one role and date range.
  // Periods still in progress (today, this week, this month) are left out:
  // counting them would mark tasks not yet due as missed.
  function collectReport(role, from, to) {
    const records = historyLog.filter(r => r.role === role && r.date >= from && r.date <= to && isSchoolDay(r.date));

    const summary = {};
    FREQS.forEach(f => { summary[f] = { periods: 0, done: 0, total: 0 }; });
    const byTask = new Map(); // key freq|text -> { text, freq, done, total }
    const byWeek = new Map(); // monday -> { days, done, total } (daily tasks)

    records.forEach(r => {
      const sm = summary[r.freq];
      sm.periods++;
      sm.done += r.d.length;
      sm.total += r.d.length + r.p.length;
      [[r.d, 1], [r.p, 0]].forEach(([list, isDone]) => list.forEach(text => {
        const key = r.freq + '|' + text;
        if (!byTask.has(key)) byTask.set(key, { text, freq: r.freq, done: 0, total: 0 });
        const t = byTask.get(key);
        t.total++;
        t.done += isDone;
      }));
      if (r.freq === 'daily') {
        const wk = weekStart(r.date);
        if (!byWeek.has(wk)) byWeek.set(wk, { days: 0, done: 0, total: 0 });
        const w = byWeek.get(wk);
        w.days++;
        w.done += r.d.length;
        w.total += r.d.length + r.p.length;
      }
    });

    const tasksList = [...byTask.values()].sort((a, b) =>
      FREQS.indexOf(a.freq) - FREQS.indexOf(b.freq) || (a.done / a.total) - (b.done / b.total));
    const weeks = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    return { count: records.length, summary, tasksList, weeks };
  }

  async function openTermReport() {
    const saved = readJSON(REPORT_INFO_KEY, {}) || {};
    const today = localDateStr(new Date());
    // Default to the current term, or the most recent one; otherwise about one term back
    let from = localDateStr(new Date(Date.now() - 91 * DAY_MS));
    let to = today;
    const term = currentOrLastTerm(today);
    if (term) {
      from = term.start;
      to = term.end;
    }
    const r = await openDialog({
      title: tr('termReportTitle'),
      message: tr('termReportHint'),
      okLabel: tr('createReport'),
      fields: [
        { name: 'staff', label: tr('staffName'), value: typeof saved.staff === 'string' ? saved.staff : '', maxlength: 80 },
        { name: 'school', label: tr('schoolName'), value: typeof saved.school === 'string' ? saved.school : '', maxlength: 100 },
        { name: 'role', label: tr('roleLabel').replace(/\s*:\s*$/, ''), type: 'select', value: currentRole,
          options: allRoleKeys().map(k => ({ value: k, label: roleLabel(k) })) },
        { name: 'from', label: tr('fromDate'), type: 'date', value: from, required: true, row: 1 },
        { name: 'to', label: tr('toDate'), type: 'date', value: to, required: true, row: 1 }
      ]
    });
    if (!r) return;

    const info = { staff: r.staff.trim(), school: r.school.trim(), role: r.role, from: r.from, to: r.to };
    // Name the term when the dates match one exactly
    const match = schoolTerms.findIndex(t => t && t.start === info.from && t.end === info.to);
    info.termName = match > -1 ? tr(TERM_NAMES[match]) : '';
    if (!DATE_RE.test(info.from) || !DATE_RE.test(info.to)) return;
    if (info.from > info.to) [info.from, info.to] = [info.to, info.from];
    try {
      localStorage.setItem(REPORT_INFO_KEY, JSON.stringify({ staff: info.staff, school: info.school }));
    } catch (e) { /* not important */ }

    const data = collectReport(info.role, info.from, info.to);
    if (!data.count) {
      showToast(tr('reportEmpty'));
      return;
    }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      showToast(tr('popupBlocked'));
      return;
    }
    win.document.write(window.EduReport.html(info, data, {
      tr, escHtml, taskText, formatDate, roleLabel, dateLocale, FREQS,
      htmlLang: (I18N.locales[currentLang] || I18N.locales.en).html
    }));
    win.document.close();
    if (window.Analytics) window.Analytics.track('export_data', { export_type: 'term_report', role: info.role });
  }

  const reportBtn = document.getElementById('term-report-btn');
  if (reportBtn) reportBtn.addEventListener('click', () => openTermReport());

  // ---------- Init ----------
  const versionEl = document.getElementById('app-version');
  if (versionEl) versionEl.textContent = 'v' + APP_VERSION;
  loadTasks();
  schoolTerms = sanitizeTerms(readJSON(TERMS_KEY, []));
  historyLog = sanitizeHistory(readJSON(HISTORY_KEY, []));
  checkRecurringResets();
  saveArchive(); // writes back the pruned archive
  updateAnalytics();
  checkDueTasks();
  checkDataNotices();
  applyLanguage(currentLang); // translates the page and renders tasks
  setTimeout(checkUrlImport, 300);

})();
