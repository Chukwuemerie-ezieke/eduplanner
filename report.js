/* ========================================
   EduPlanner — Term report layout
   Harmony Digital Consults Ltd · MIT License
   Builds the printable term report page. Pure function: all text and data are passed in.
   ======================================== */

(function () {
  'use strict';

  function pct(done, total) {
    return total ? Math.round((done / total) * 100) : 0;
  }

  // h: helpers from the app (tr, escHtml, taskText, formatDate, roleLabel, dateLocale, htmlLang, FREQS)
  function reportHtml(info, data, h) {
    const { tr, taskText, formatDate, roleLabel, dateLocale, FREQS } = h;
    const e = h.escHtml;
    const longDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
    const bar = (p) => `<div class="bar"><span style="width:${p}%"></span></div>`;
    const summaryRows = FREQS.filter(f => data.summary[f].periods).map(f => {
      const sm = data.summary[f];
      const p = pct(sm.done, sm.total);
      return `<tr><td>${e(tr(f))}</td><td>${sm.periods}</td><td>${e(tr('timesOf', { done: sm.done, total: sm.total }))}</td><td>${bar(p)}<b>${p}%</b></td></tr>`;
    }).join('');
    const taskRows = data.tasksList.map(t => {
      const p = pct(t.done, t.total);
      return `<tr><td>${e(taskText(t.text))}</td><td>${e(tr(t.freq))}</td><td>${e(tr('timesOf', { done: t.done, total: t.total }))}</td><td class="${p < 50 ? 'low' : ''}">${p}%</td></tr>`;
    }).join('');
    const weekRows = data.weeks.map(([wk, w]) => {
      const p = pct(w.done, w.total);
      return `<tr><td>${e(tr('weekOf', { date: formatDate(wk) }))}</td><td>${e(tr('daysRecorded', { n: w.days }))}</td><td>${bar(p)}<b>${p}%</b></td></tr>`;
    }).join('');
    const sig = (who) => `<div class="sig"><div class="sig-who">${e(who)}</div>
      <div class="sig-line"><span>${e(tr('sigName'))}</span></div>
      <div class="sig-line"><span>${e(tr('sigSignature'))}</span></div>
      <div class="sig-line"><span>${e(tr('sigDate'))}</span></div></div>`;
    const lang = h.htmlLang;
    const generated = new Date().toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });

    return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="utf-8"><title>EduPlanner - ${e(tr('reportTitle'))}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'General Sans', system-ui, sans-serif; padding: 36px; color: #1A2E1A; font-size: 12.5px; line-height: 1.45; }
  header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 14px; border-bottom: 2px solid #1B5E4B; margin-bottom: 18px; }
  .brand { font-size: 20px; font-weight: 700; color: #1B5E4B; }
  .brand-sub { font-size: 11px; color: #5C6B5C; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .meta { text-align: right; font-size: 12px; color: #3a4a3a; }
  .meta div { margin-bottom: 2px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #1B5E4B; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 6px 8px; background: #E6F2ED; color: #1B5E4B; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 6px 8px; border-bottom: 1px solid #DDD9D1; vertical-align: middle; }
  td.low { color: #A04020; font-weight: 600; }
  .bar { display: inline-block; width: 90px; height: 8px; background: #E8E5DE; border-radius: 4px; margin-right: 8px; vertical-align: middle; overflow: hidden; }
  .bar span { display: block; height: 100%; background: #1B5E4B; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .note { font-size: 11px; color: #5C6B5C; margin-top: 8px; }
  .comments { border: 1px solid #DDD9D1; border-radius: 6px; height: 90px; margin-top: 4px; }
  .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 8px; }
  .sig-who { font-weight: 600; margin-bottom: 14px; }
  .sig-line { border-bottom: 1px solid #1A2E1A; height: 30px; position: relative; margin-bottom: 6px; }
  .sig-line span { position: absolute; bottom: -16px; left: 0; font-size: 10px; color: #5C6B5C; }
  .sig-line + .sig-line { margin-top: 18px; }
  section { break-inside: avoid; }
  footer { margin-top: 36px; padding-top: 10px; border-top: 1px solid #DDD9D1; font-size: 10px; color: #9EA89E; text-align: center; }
  @media print { body { padding: 16px; } }
</style></head><body>
  <header>
    <div>
      <div class="brand">EduPlanner</div>
      <div class="brand-sub">${info.school ? e(info.school) : 'Harmony Digital Consults Ltd'}</div>
    </div>
    <div class="meta">
      <h1>${e(tr('reportTitle'))}${info.termName ? ' · ' + e(info.termName) : ''}</h1>
      ${info.staff ? `<div>${e(tr('reportStaff'))} <b>${e(info.staff)}</b></div>` : ''}
      <div>${e(tr('roleLabel'))} <b>${e(roleLabel(info.role))}</b></div>
      <div>${e(tr('reportPeriod'))} ${e(longDate(info.from))} – ${e(longDate(info.to))}</div>
    </div>
  </header>

  <section>
    <h2>${e(tr('reportSummary'))}</h2>
    <table><thead><tr><th>${e(tr('colFrequency'))}</th><th>${e(tr('colPeriods'))}</th><th>${e(tr('colDone'))}</th><th>${e(tr('colRate'))}</th></tr></thead>
    <tbody>${summaryRows}</tbody></table>
    <p class="note">${e(tr('reportNote'))}</p>
  </section>

  ${weekRows ? `<section>
    <h2>${e(tr('reportByWeek'))}</h2>
    <table><thead><tr><th>${e(tr('reportWeek'))}</th><th>${e(tr('reportDays'))}</th><th>${e(tr('colRate'))}</th></tr></thead>
    <tbody>${weekRows}</tbody></table>
  </section>` : ''}

  <section>
    <h2>${e(tr('reportByTask'))}</h2>
    <table><thead><tr><th>${e(tr('colTask'))}</th><th>${e(tr('colFrequency'))}</th><th>${e(tr('colDone'))}</th><th>${e(tr('colRate'))}</th></tr></thead>
    <tbody>${taskRows}</tbody></table>
  </section>

  <section>
    <h2>${e(tr('reportComments'))}</h2>
    <div class="comments"></div>
  </section>

  <section>
    <h2>${e(tr('reportSignatures'))}</h2>
    <div class="sigs">${sig(tr('sigStaff'))}${sig(tr('role.hod'))}${sig(tr('sigPrincipal'))}</div>
  </section>

  <footer>${e(tr('generated', { date: generated }))} · EduPlanner by Harmony Digital Consults Ltd</footer>
  <script>window.onload = function () { window.print(); };<\/script>
</body></html>`;
  }

  window.EduReport = { html: reportHtml };
})();
