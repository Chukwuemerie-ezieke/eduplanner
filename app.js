/* ========================================
   EduPlanner — App Logic
   Harmony Digital Consults Ltd
   Open Source | MIT License
   ======================================== */

(function () {
  'use strict';

  // ---------- Pre-populated tasks by role and frequency ----------
  const DEFAULT_TASKS = {
    teacher: {
      daily: [
        'Review lesson plan for today',
        'Take class attendance',
        'Update student progress notes',
        'Mark and return assignments',
        'Prepare materials for tomorrow\'s lessons',
        'Supervise student behavior during break',
        'Communicate updates to parents (if needed)'
      ],
      weekly: [
        'Submit weekly lesson notes to HOD',
        'Prepare and grade quizzes/tests',
        'Review scheme of work progress',
        'Attend staff meeting',
        'Update class register and records',
        'Plan differentiated activities for struggling students',
        'Organize classroom and resources'
      ],
      monthly: [
        'Submit monthly progress report',
        'Review and adjust lesson plans for next month',
        'Conduct parent-teacher communication',
        'Participate in professional development session',
        'Analyze student performance data',
        'Update cumulative records'
      ]
    },
    administrator: {
      daily: [
        'Review and respond to correspondence',
        'Monitor staff attendance and punctuality',
        'Handle student disciplinary issues',
        'Coordinate daily school operations',
        'Review financial transactions and petty cash',
        'Update school calendar if needed'
      ],
      weekly: [
        'Hold management team briefing',
        'Review budget expenditure report',
        'Monitor cleanliness and facility maintenance',
        'Review admission and enrollment status',
        'Coordinate extracurricular activities schedule',
        'Approve purchase orders and requisitions'
      ],
      monthly: [
        'Prepare monthly financial summary',
        'Conduct staff performance review meeting',
        'Submit regulatory compliance documents',
        'Organize school assembly or special event',
        'Review and update school policies',
        'Generate enrollment and attendance reports'
      ]
    },
    hod: {
      daily: [
        'Monitor teaching quality in department',
        'Review lesson delivery and classroom visits',
        'Address departmental issues promptly',
        'Ensure teaching aids are available'
      ],
      weekly: [
        'Hold departmental meeting',
        'Review and sign off on lesson notes',
        'Coordinate inter-class assessments',
        'Mentor and support new teachers',
        'Verify scheme of work compliance',
        'Plan department resource needs'
      ],
      monthly: [
        'Submit departmental performance report',
        'Analyze subject-wide student results',
        'Organize department training session',
        'Review and update department curriculum',
        'Evaluate resource utilization',
        'Set targets for the next month'
      ]
    },
    ict: {
      daily: [
        'Check all computer systems and devices',
        'Resolve IT support tickets',
        'Monitor internet connectivity',
        'Ensure projectors and displays are working',
        'Back up critical school data'
      ],
      weekly: [
        'Run system and software updates',
        'Conduct ICT training/support for staff',
        'Audit device inventory',
        'Test backup and recovery procedures',
        'Review network security logs',
        'Update school website or portal'
      ],
      monthly: [
        'Submit IT infrastructure status report',
        'Plan and procure technology supplies',
        'Conduct cybersecurity awareness session',
        'Review and update IT policies',
        'Evaluate software license renewals',
        'Prepare ICT integration plan for curriculum'
      ]
    },
    librarian: {
      daily: [
        'Open and organize library for the day',
        'Process book checkouts and returns',
        'Assist students with research and reading',
        'Shelve returned books properly',
        'Monitor library behavior and rules'
      ],
      weekly: [
        'Update library catalog and records',
        'Conduct reading promotion activity',
        'Check for overdue books and send reminders',
        'Organize reading corner and displays',
        'Coordinate with teachers on reference materials',
        'Inventory new book arrivals'
      ],
      monthly: [
        'Submit library usage statistics report',
        'Recommend new book purchases',
        'Organize book club or reading challenge',
        'Conduct library orientation for new students',
        'Review and repair damaged materials',
        'Plan library events and theme months'
      ]
    },
    counselor: {
      daily: [
        'Review student referral cases',
        'Conduct individual counseling sessions',
        'Follow up on at-risk students',
        'Document session notes and progress',
        'Coordinate with class teachers on concerns'
      ],
      weekly: [
        'Facilitate group counseling session',
        'Meet with parents of referred students',
        'Conduct classroom guidance lesson',
        'Review and update student case files',
        'Coordinate with external support agencies',
        'Attend student welfare meeting'
      ],
      monthly: [
        'Submit counseling activity report',
        'Organize wellness or life skills workshop',
        'Analyze referral patterns and trends',
        'Update counseling resources and materials',
        'Conduct peer mediation training',
        'Plan career guidance or orientation session'
      ]
    }
  };

  const ROLE_LABELS = {
    teacher: 'Teacher',
    administrator: 'Administrator',
    hod: 'Head of Department',
    ict: 'ICT Coordinator',
    librarian: 'Librarian',
    counselor: 'School Counselor'
  };

  // ---------- State ----------
  let currentRole = 'teacher';

  let lastDeletedTask = null;
  let lastDeletedRole = null;

  let archive = JSON.parse(localStorage.getItem('eduplanner_archive')) || [];

  function saveArchive() {
    localStorage.setItem('eduplanner_archive', JSON.stringify(archive));
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
  function loadTasks() {
    try {
      const saved = localStorage.getItem('eduplanner_tasks');
      if (saved) {
        tasks = JSON.parse(saved);
        return;
      }
    } catch (e) { /* ignore */ }
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
    saveTasks();
  }

  function saveTasks() {
    try {
      localStorage.setItem('eduplanner_tasks', JSON.stringify(tasks));
    } catch (e) { /* ignore — storage might be full or blocked */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- Render ----------
  function getFilteredTasks() {
    const roleTasks = tasks[currentRole] || [];
    if (currentFreq === 'all') return roleTasks;
    return roleTasks.filter(t => t.freq === currentFreq);
  }

  function renderTasks() {
    const printDate = document.getElementById('print-date');
    if (printDate) printDate.textContent = "Role: " + (ROLE_LABELS[currentRole] || currentRole) + " | Date: " + new Date().toLocaleDateString();
    taskList.innerHTML = '';
    const roleTasks = tasks[currentRole] || [];
    let toShow = currentFreq === 'all' ? roleTasks : roleTasks.filter(t => t.freq === currentFreq);

    // Apply search filter
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
      toShow = toShow.filter(t => t.text.toLowerCase().includes(searchTerm));
    }


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
          <input type="checkbox" id="${checkId}" class="task-checkbox" ${t.done ? 'checked' : ''} aria-label="Mark task complete">
          <div class="task-content">
            <label for="${checkId}" class="task-text">${parseMarkdown(t.text)}</label>

            ${currentFreq === 'all' ? `<div class="task-freq-badge ${t.freq}">${t.freq}</div>` : ''}
            ${t.dueDate ? `<div class="task-due-date" style="font-size:11px;color:var(--color-text-faint);margin-top:2px;display:inline-block;">Due: ${t.dueDate}</div>` : ''}
            ${t.tag ? `<span class="task-tag" style="font-size:10px; background:var(--color-surface-2); border: 1px solid var(--color-border); padding:2px 6px; border-radius:4px; margin-left: 6px; display:inline-block;">${escHtml(t.tag)}</span>` : ''}
          </div>

          <div class="task-actions">
            <button class="task-delete" aria-label="Delete task">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `;

        // Checkbox event
        item.querySelector('.task-checkbox').addEventListener('change', (e) => {
          t.done = e.target.checked;
          if (t.done) {
            item.classList.add('done');
          } else {
            item.classList.remove('done');
          }
          saveTasks();
          updateStats();
        });

        // Delete event
        item.querySelector('.task-delete').addEventListener('click', () => {

          lastDeletedTask = t;
          lastDeletedRole = currentRole;
          archive.push({ ...t, deletedAt: new Date().toISOString() });
          saveArchive();

          tasks[currentRole] = tasks[currentRole].filter(x => x.id !== t.id);
          item.style.opacity = '0';
          setTimeout(() => {
            saveTasks();
            renderTasks();
            showUndoToast('Task deleted');
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

  function createTaskEl(task) {
    const div = document.createElement('div');
    div.className = 'task-item' + (task.done ? ' done' : '');
    div.setAttribute('role', 'listitem');
    div.dataset.id = task.id;

    div.innerHTML = `
      <input type="checkbox" class="task-checkbox" ${task.done ? 'checked' : ''} aria-label="Mark task as ${task.done ? 'incomplete' : 'complete'}">
      <div class="task-content">
        <div class="task-text">${escHtml(task.text)}</div>
        ${currentFreq === 'all' ? `<span class="task-freq-badge ${task.freq}">${task.freq}</span>` : ''}
      </div>
      <div class="task-actions">
        <button class="task-delete" aria-label="Delete task" title="Delete task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    // Checkbox
    const cb = div.querySelector('.task-checkbox');
    cb.addEventListener('change', () => {
      task.done = cb.checked;
      saveTasks();
      renderTasks();
    });

    // Delete
    const delBtn = div.querySelector('.task-delete');
    delBtn.addEventListener('click', () => {
      const roleTasks = tasks[currentRole];
      const idx = roleTasks.findIndex(t => t.id === task.id);
      if (idx > -1) {
        roleTasks.splice(idx, 1);
        saveTasks();
        renderTasks();
        showToast('Task removed');
      }
    });

    return div;
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
  for (const [key, label] of Object.entries(customRoles)) {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.role = key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> ${label}`;
    tabsScroll.insertBefore(btn, addRoleBtn);
  }


  // Search event
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderTasks();
    });
  }

  // ---------- Event Handlers ----------

  // Add Role Button
  if ($('#add-role-btn')) {
    $('#add-role-btn').addEventListener('click', () => {
      const roleName = prompt("Enter the name of the new role (e.g., 'Sports Coordinator'):");
      if (roleName && roleName.trim() !== '') {
        const roleKey = roleName.trim().toLowerCase().replace(/\s+/g, '_');
        if (ROLE_LABELS[roleKey]) {
           showToast('Role already exists');
           return;
        }
        ROLE_LABELS[roleKey] = roleName.trim();
        customRoles[roleKey] = roleName.trim();
        localStorage.setItem('eduplanner_custom_roles', JSON.stringify(customRoles));

        // Add default empty tasks array for this role
        tasks[roleKey] = [];
        saveTasks();

        // Reload page to re-bind events to new tabs easily
        location.reload();
      }
    });
  }

  // Role tabs event delegation (since new tabs might be added dynamically, but reload handles it)

  // Role tabs
  $$('.tab[data-role]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab[data-role]').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentRole = tab.dataset.role;
      renderTasks();
    });
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
      taskFreqSelect.value = currentFreq === 'all' ? 'daily' : currentFreq;
      renderTasks();
    });
  });

  // Add task
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = taskInput.value.trim();
    const dueDate = $('#new-task-date').value;
    const tag = $('#new-task-tag') ? $('#new-task-tag').value.trim() : '';
    if (!text) return;

    const freq = taskFreqSelect.value;
    if (!tasks[currentRole]) tasks[currentRole] = [];
    tasks[currentRole].push({
      id: uid(),
      text,
      freq,
      dueDate: dueDate || null,
      tag: tag || null,
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
    showToast('Task added');
  });

  // Clear completed
  $('#clear-done').addEventListener('click', () => {
    if (!tasks[currentRole]) return;
    const before = tasks[currentRole].length;

    const completed = tasks[currentRole].filter(t => t.done);
    completed.forEach(t => archive.push({ ...t, deletedAt: new Date().toISOString() }));
    saveArchive();
    tasks[currentRole] = tasks[currentRole].filter(t => !t.done);

    const removed = before - tasks[currentRole].length;
    if (removed > 0) {
      saveTasks();
      renderTasks();
      showToast(`Cleared ${removed} completed task${removed > 1 ? 's' : ''}`);
    } else {
      showToast('No completed tasks to clear');
    }
  });

  // ---------- Export: PDF ----------
  $('#export-pdf').addEventListener('click', () => {
    const roleTasks = tasks[currentRole] || [];
    if (roleTasks.length === 0) {
      showToast('No tasks to export');
      return;
    }

    const roleName = ROLE_LABELS[currentRole] || currentRole;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    // Build PDF using jsPDF-like manual approach with print
    const printWin = window.open('', '_blank', 'width=800,height=600');
    if (!printWin) {
      showToast('Pop-up blocked. Please allow pop-ups.');
      return;
    }

    const groupedHtml = buildGroupedHtml(roleTasks, roleName, dateStr);

    printWin.document.write(`<!DOCTYPE html>
<html><head><title>EduPlanner - ${roleName} Tasks</title>
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
      <div class="pdf-role">${roleName} Task Report</div>
      <div>Generated: ${dateStr}</div>
    </div>
  </div>
  ${groupedHtml}
  <div class="pdf-footer">
    EduPlanner by Harmony Digital Consults Ltd &middot; Open Source &middot; eduplanner.harmonyconsults.com
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body></html>`);
    printWin.document.close();
    showToast('PDF ready — use Print dialog to save');
  });

  function buildGroupedHtml(roleTasks, roleName, dateStr) {
    let html = '';
    ['daily', 'weekly', 'monthly'].forEach(freq => {
      const items = roleTasks.filter(t => t.freq === freq);
      if (items.length === 0) return;
      html += `<h2>${freq} Tasks</h2>
      <table>
        <thead><tr><th style="width:5%">#</th><th>Task</th><th style="width:15%">Status</th></tr></thead>
        <tbody>`;
      items.forEach((t, i) => {
        html += `<tr>
          <td>${i + 1}</td>
          <td>${escHtml(t.text)}</td>
          <td class="${t.done ? 'status-done' : 'status-pending'}">${t.done ? 'Completed' : 'Pending'}</td>
        </tr>`;
      });
      html += '</tbody></table>';
    });
    return html;
  }

  // ---------- Export: Excel ----------
  $('#export-excel').addEventListener('click', () => {
    const roleTasks = tasks[currentRole] || [];
    if (roleTasks.length === 0) {
      showToast('No tasks to export');
      return;
    }

    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Check your connection.');
      return;
    }

    const roleName = ROLE_LABELS[currentRole] || currentRole;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');

    // Build worksheet data
    const wsData = [
      ['EduPlanner - Task Report'],
      ['Role:', roleName],
      ['Date:', dateStr],
      ['Generated by:', 'Harmony Digital Consults Ltd'],
      [],
      ['#', 'Task', 'Frequency', 'Status']
    ];

    roleTasks.forEach((t, i) => {
      wsData.push([
        i + 1,
        t.text,
        t.freq.charAt(0).toUpperCase() + t.freq.slice(1),
        t.done ? 'Completed' : 'Pending'
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
    XLSX.utils.book_append_sheet(wb, ws, roleName);
    XLSX.writeFile(wb, `EduPlanner_${roleName.replace(/\s/g, '_')}_${dateStr.replace(/\//g, '-')}.xlsx`);
    showToast('Excel file downloaded');
  });


  // ---------- Export: JSON Backup ----------
  $('#export-backup').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "eduplanner_backup_" + new Date().toISOString().split('T')[0] + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast('Backup downloaded');
  });

  // ---------- Import: JSON Backup ----------
  $('#import-backup-btn').addEventListener('click', () => {
    $('#import-backup-input').click();
  });

  $('#import-backup-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedTasks = JSON.parse(event.target.result);
        if (typeof importedTasks === 'object' && importedTasks !== null) {
          tasks = importedTasks;
          saveTasks();
          renderTasks();
          showToast('Backup restored successfully');
        } else {
          throw new Error('Invalid format');
        }
      } catch (err) {
        showToast('Error restoring backup. Invalid file.');
      }
      e.target.value = ''; // reset
    };
    reader.readAsText(file);
  });


  // ---------- Localization / i18n ----------
  const translations = {
    en: {
      welcomeTitle: "Your Education Task Planner",
      welcomeDesc: "Select your role, manage tasks by frequency, and export your progress as PDF or Excel.",
      clearCompleted: "Clear completed"
    },
    fr: {
      welcomeTitle: "Votre planificateur de tâches éducatives",
      welcomeDesc: "Sélectionnez votre rôle, gérez les tâches par fréquence et exportez vos progrès au format PDF ou Excel.",
      clearCompleted: "Effacer les terminées"
    },
    pidgin: {
      welcomeTitle: "Your School Work Planner",
      welcomeDesc: "Choose your work, arrange your task dem, and download everything as PDF or Excel.",
      clearCompleted: "Clear the ones wey finish"
    }
  };

  function applyLanguage(lang) {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translations[lang] && translations[lang][key]) {
        el.textContent = translations[lang][key];
      }
    });
  }

  const langSelect = $('#lang-select');
  if (langSelect) {
    const savedLang = localStorage.getItem('eduplanner_lang') || 'en';
    langSelect.value = savedLang;
    applyLanguage(savedLang);

    langSelect.addEventListener('change', (e) => {
      const lang = e.target.value;
      localStorage.setItem('eduplanner_lang', lang);
      applyLanguage(lang);
    });
  }


  // ---------- Notifications ----------
  const notifsBtn = document.getElementById('enable-notifs-btn');
  if (notifsBtn) {
    if (Notification.permission === 'granted') {
      notifsBtn.style.display = 'none';
      checkDueTasks();
    }

    notifsBtn.addEventListener('click', () => {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') {
          notifsBtn.style.display = 'none';
          showToast('Notifications enabled!');
          checkDueTasks();
        } else {
          showToast('Notifications denied.');
        }
      });
    });
  }

  function checkDueTasks() {
    if (Notification.permission !== 'granted') return;

    const today = new Date().toISOString().split('T')[0];
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
      new Notification('EduPlanner Reminders', {
        body: `You have ${dueCount} task(s) due today or overdue.`,
        icon: 'icons/icon-192.png'
      });
    }
  }

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
      toggle.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
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
    toast.innerHTML = `${msg} <button class="btn-undo" style="margin-left: 10px; background:transparent; color:var(--color-primary-light); border:none; cursor:pointer; font-weight:bold; text-decoration:underline;">Undo</button>`;

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
        showToast('Task restored');
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
    if (outcome === 'accepted') showToast('App installed');
  });

  // ---------- Service Worker ----------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- Init ----------
  loadTasks();
  updateAnalytics();
  renderTasks();

})();
