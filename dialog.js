/* ========================================
   EduPlanner — In-app dialog
   Harmony Digital Consults Ltd · MIT License
   Replaces the browser's prompt()/confirm(). Created with the app's translate function:
   const { openDialog, askText, askConfirm } = EduDialog.create(tr);
   ======================================== */

(function () {
  'use strict';

  function create(tr) {
    // ---------- In-app dialog (replaces the browser's prompt/confirm) ----------
    // openDialog({ title, message, fields, okLabel, cancel, danger })
    //   fields: [{ name, label, type: 'text'|'date'|'select'|'heading', value, options, placeholder,
    //              required, readonly, maxlength, row }]
    //   (row: fields sharing a row value sit side by side; 'heading' is a section title with no value)
    // Resolves to { name: value, ... } on OK, or null on cancel / Escape / backdrop click.
    function openDialog({ title, message = '', fields = [], okLabel, cancel = true, danger = false }) {
      const dlg = document.getElementById('app-dialog');

      // Very old browsers without <dialog>: fall back to the native boxes
      if (!dlg || typeof dlg.showModal !== 'function') {
        if (!fields.length) return Promise.resolve(confirm([title, message].filter(Boolean).join('\n\n')) ? {} : null);
        const values = {};
        for (const f of fields) {
          if (f.type === 'select' || f.type === 'date') { values[f.name] = f.value || ''; continue; }
          const v = prompt(f.label, f.value || '');
          if (v === null) return Promise.resolve(null);
          values[f.name] = v;
        }
        return Promise.resolve(values);
      }

      document.querySelector('#app-dialog-title').textContent = title;
      document.querySelector('#app-dialog-message').textContent = message;
      const fieldsBox = document.querySelector('#app-dialog-fields');
      fieldsBox.innerHTML = '';
      const inputs = {};
      const rows = {};

      fields.forEach(f => {
        if (f.type === 'heading') {
          const h = document.createElement('h3');
          h.className = 'app-dialog-heading';
          h.textContent = f.label;
          fieldsBox.appendChild(h);
          return;
        }
        const label = document.createElement('label');
        label.className = 'app-dialog-field';
        const caption = document.createElement('span');
        caption.textContent = f.label;
        let input;
        if (f.type === 'select') {
          input = document.createElement('select');
          (f.options || []).forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            input.appendChild(opt);
          });
        } else {
          input = document.createElement('input');
          input.type = f.type || 'text';
          if (f.placeholder) input.placeholder = f.placeholder;
          if (f.maxlength) input.maxLength = f.maxlength;
          if (f.readonly) {
            input.readOnly = true;
            input.addEventListener('focus', () => input.select());
          }
          input.autocomplete = 'off';
        }
        input.name = f.name;
        input.value = f.value || '';
        if (f.required) input.setAttribute('aria-required', 'true');
        inputs[f.name] = input;
        label.append(caption, input);

        if (f.row) {
          if (!rows[f.row]) {
            rows[f.row] = document.createElement('div');
            rows[f.row].className = 'app-dialog-row';
            fieldsBox.appendChild(rows[f.row]);
          }
          rows[f.row].appendChild(label);
        } else {
          fieldsBox.appendChild(label);
        }
      });

      const okBtn = document.querySelector('#app-dialog-ok');
      const cancelBtn = document.querySelector('#app-dialog-cancel');
      okBtn.textContent = okLabel || tr('ok');
      okBtn.classList.toggle('btn-danger', danger);
      cancelBtn.textContent = tr('cancel');
      cancelBtn.hidden = !cancel;

      return new Promise(resolve => {
        const ac = new AbortController();
        const opts = { signal: ac.signal };
        // Resolve right away (not on the later 'close' event) so the caller's
        // follow-up runs before the user can do anything else
        const finish = (result) => {
          ac.abort();
          if (dlg.open) dlg.close();
          resolve(result);
        };

        dlg.querySelector('form').addEventListener('submit', (e) => {
          e.preventDefault();
          for (const f of fields) {
            const input = inputs[f.name];
            if (!input) continue;
            if (f.required && !input.value.trim()) {
              input.setAttribute('aria-invalid', 'true');
              input.focus();
              return;
            }
            input.removeAttribute('aria-invalid');
          }
          const values = {};
          for (const name in inputs) values[name] = inputs[name].value;
          finish(values);
        }, opts);
        cancelBtn.addEventListener('click', () => finish(null), opts);
        // Click on the dimmed backdrop (outside the box) cancels
        dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(null); }, opts);
        // Escape key
        dlg.addEventListener('close', () => finish(null), opts);

        dlg.showModal();
        // Focus the first field; for destructive confirmations focus Cancel
        const firstField = fields.find(f => inputs[f.name]);
        const first = firstField ? inputs[firstField.name] : (danger && cancel ? cancelBtn : okBtn);
        first.focus();
        if (firstField && first.select && !firstField.readonly && first.type === 'text') first.select();
      });
    }

    async function askText(opts) {
      const r = await openDialog({ ...opts, fields: [{ name: 'value', required: true, maxlength: 200, ...opts.field }] });
      return r ? r.value.trim() : null;
    }

    async function askConfirm(opts) {
      return (await openDialog(opts)) !== null;
    }

    return { openDialog, askText, askConfirm };
  }

  window.EduDialog = { create };
})();
