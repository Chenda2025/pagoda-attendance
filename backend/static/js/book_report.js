/* ================================================================
   3D Flipping Book — Report JS
   ================================================================ */
'use strict';

// ---- State -------------------------------------------------------
let currentSpread = 0;          // 0 = cover, 1 = daily+biweekly, 2 = monthly+annual, 3 = 3yr+back
const TOTAL_SPREADS = 4;
let isFlipping = false;
let flatMode = false;

// ---- DOM refs after DOMContentLoaded ----------------------------
let elBookWrap, elLeftPage, elRightPage, elCoverSpread;
let elTurningPage, elTpFront, elTpBack;
let elBtnPrev, elBtnNext, elPageCounter;
let elLeftEdge, elRightEdge;
let elFlatView, elBookStage;
let elBtnFlatToggle;
let elToast;

// ---- Khmer month names ------------------------------------------
const KM_MONTHS = ['','មករា','កុម្ភៈ','មីនា','មេសា','ឧសភា','មិថុនា',
                    'កក្កដា','សីហា','កញ្ញា','តុលា','វិច្ឆិកា','ធ្នូ'];

// ================================================================
// UTILITIES
// ================================================================

function toast(msg, dur = 2800) {
  elToast.textContent = msg;
  elToast.classList.add('show');
  setTimeout(() => elToast.classList.remove('show'), dur);
}

function fmt(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtDate(iso) { return iso ? fmt(iso) : '—'; }

function monkTypeBadge(t) {
  return t === 'ភិក្ខុ'
    ? '<span style="font-size:9px;color:#8a6100">📿 ភិក្ខុ</span>'
    : '<span style="font-size:9px;color:#1b5e20">🔰 សាមណេរ</span>';
}

function statusBadge(status) {
  return status === 'absent'
    ? '<span class="badge badge-absent">❌ អវត្តមាន</span>'
    : '<span class="badge badge-permission">📋 ច្បាប់</span>';
}

function violBadge(abs, perm) {
  if (abs >= 2 && perm >= 3) return '<span class="badge badge-both">⚠ ទាំងពីរ</span>';
  if (abs >= 2)              return '<span class="badge badge-absent">⚠ អវត្តមាន</span>';
  if (perm >= 3)             return '<span class="badge badge-permission">⚠ ច្បាប់</span>';
  return '<span class="badge badge-ok">✓ ប្រក្រតី</span>';
}

function rowClass(abs, perm) {
  if (abs >= 2 && perm >= 3) return 'row-danger';
  if (abs >= 2)              return 'row-absent';
  if (perm >= 3)             return 'row-perm';
  return '';
}

function loadingHTML() {
  return `<div class="page-loading"><div class="spinner-sm"></div><span>កំពុងផ្ទុក...</span></div>`;
}

function emptyHTML(msg = 'មិនមានទិន្នន័យ') {
  return `<div class="page-empty">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="1.5">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg><br>${msg}</div>`;
}

function errorHTML(msg) {
  return `<div class="page-empty" style="color:#c62828">⚠ ${msg}</div>`;
}

// ================================================================
// TABLE BUILDERS
// ================================================================

function buildDailyTable(records, dateStr) {
  if (!records.length) return emptyHTML('គ្មានអវត្តមានឬច្បាប់ថ្ងៃនេះ');
  const rows = records.map((r, i) => {
    const cls = r.status === 'absent' ? 'row-absent' : 'row-perm';
    const edu = [r.education_level, r.academic_year].filter(Boolean).join(' ');
    return `<tr class="${cls}">
      <td class="num-cell">${i + 1}</td>
      <td><strong>${r.fullname}</strong></td>
      <td>${monkTypeBadge(r.monk_type)}</td>
      <td>${r.position}</td>
      <td class="num-cell">${r.vassa_years}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`;
  }).join('');
  return `<table class="ledger-table">
    <thead><tr>
      <th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th><th>វស្សា</th><th>ស្ថានភាព</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildSummaryTable(monks) {
  if (!monks.length) return emptyHTML('គ្មានព្រះសង្ឃដែលលើសដែន (អវត្តមាន > ១ ឬ ច្បាប់ > ២)');
  const rows = monks.map((m, i) => {
    const cls = rowClass(m.total_absences, m.total_permissions);
    const edu = [m.education_level, m.academic_year].filter(Boolean).join(' ');
    return `<tr class="${cls}">
      <td class="num-cell">${i + 1}</td>
      <td><strong>${m.fullname}</strong></td>
      <td>${monkTypeBadge(m.monk_type)}</td>
      <td>${m.position}</td>
      <td class="num-cell" style="color:#c62828;font-weight:700">${m.total_absences}</td>
      <td class="num-cell" style="color:#e65100;font-weight:700">${m.total_permissions}</td>
      <td>${violBadge(m.total_absences, m.total_permissions)}</td>
    </tr>`;
  }).join('');
  return `<table class="ledger-table">
    <thead><tr>
      <th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th>
      <th>❌ អវត្តមាន</th><th>📋 ច្បាប់</th><th>ស្ថានភាព</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

// ================================================================
// PAGE CONTENT GENERATORS
// ================================================================

function coverContent() {
  return '';  // rendered statically in HTML
}

// ---- Spread 1: Daily (left) + Bi-Weekly (right) ----------------

async function buildDailyPage(container) {
  const date = document.getElementById('ctx-date').value || new Date().toISOString().slice(0, 10);
  container.innerHTML = `
    <div class="page-header">
      
      <div class="page-heading">របាយការណ៍ប្រចាំថ្ងៃ</div>
      <div class="page-subheading">ថ្ងៃទី ${fmt(date)}</div>
    </div>
    <div class="page-ctrl">
      <label>ថ្ងៃ:</label>
      <input type="date" id="daily-date" value="${date}" onchange="reloadDaily()">
    </div>
    <div id="daily-body">${loadingHTML()}</div>`;
  await fetchDailyData(date);
}

async function fetchDailyData(dateStr) {
  const body = document.getElementById('daily-body');
  if (!body) return;
  body.innerHTML = loadingHTML();
  try {
    const res  = await fetch(`/api/attendance/daily-report?date=${dateStr}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    body.innerHTML = buildDailyTable(data.records, dateStr);
  } catch (e) {
    body.innerHTML = errorHTML(e.message);
  }
}

window.reloadDaily = function () {
  const d = document.getElementById('daily-date');
  if (d) fetchDailyData(d.value);
};

async function buildBiweeklyPage(container) {
  const dateStr = document.getElementById('ctx-date').value || new Date().toISOString().slice(0, 10);
  // Try to find the nearest compiled period
  container.innerHTML = `
    <div class="page-header">
      <div class="page-heading">របាយការណ៍ ១៥ ថ្ងៃ</div>
      <div class="page-subheading" id="bw-range">ថ្ងៃ ១–១៥ ឬ ១៦–ចុងខែ (auto)</div>
    </div>
    <div class="page-ctrl">
      <label>ដំណាក់ (ជ្រើសថ្ងៃ):</label>
      <input type="date" id="bw-period" value="${dateStr}" onchange="reloadBiweekly()">
    </div>
    <div id="bw-body">${loadingHTML()}</div>`;
  await fetchBiweeklyData(dateStr);
}

async function fetchBiweeklyData(periodStart) {
  const body = document.getElementById('bw-body');
  if (!body) return;
  body.innerHTML = loadingHTML();
  try {
    const res  = await fetch(`/api/reports/biweekly?period_start=${periodStart}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const hdr = document.getElementById('bw-range');
    if (hdr) hdr.textContent = `${fmt(data.period_start)} → ${fmt(data.period_end)}`;
    body.innerHTML = buildSummaryTable(data.monks);
  } catch (e) {
    body.innerHTML = errorHTML(e.message);
  }
}

window.reloadBiweekly = function () {
  const d = document.getElementById('bw-period');
  if (d) fetchBiweeklyData(d.value);
};

// ---- Spread 2: Monthly (left) + Annual (right) -----------------

async function buildMonthlyPage(container) {
  const now = new Date();
  const yr  = now.getFullYear(), mo = now.getMonth() + 1;
  container.innerHTML = `
    <div class="page-header">
      
      <div class="page-heading">របាយការណ៍ប្រចាំខែ</div>
      <div class="page-subheading" id="monthly-range">—</div>
    </div>
    <div class="page-ctrl">
      <label>ខែ:</label>
      <select id="monthly-mo">${Array.from({length:12},(_,i)=>
        `<option value="${i+1}"${i+1===mo?' selected':''}>${KM_MONTHS[i+1]}</option>`
      ).join('')}</select>
      <label>ឆ្នាំ:</label>
      <input type="number" id="monthly-yr" value="${yr}" min="2020" max="2099" style="width:68px">
      <button class="btn-load" onclick="reloadMonthly()">ផ្ទុក</button>
    </div>
    <div id="monthly-body">${loadingHTML()}</div>`;
  await fetchMonthlyData(yr, mo);
}

async function fetchMonthlyData(year, month) {
  const body = document.getElementById('monthly-body');
  if (!body) return;
  body.innerHTML = loadingHTML();
  try {
    const res  = await fetch(`/api/reports/monthly?year=${year}&month=${month}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const rng = document.getElementById('monthly-range');
    if (rng) rng.textContent = `${fmt(data.period_start)} → ${fmt(data.period_end)}`;
    body.innerHTML = buildSummaryTable(data.monks);
  } catch (e) {
    body.innerHTML = errorHTML(e.message);
  }
}

window.reloadMonthly = function () {
  const yr = parseInt(document.getElementById('monthly-yr')?.value);
  const mo = parseInt(document.getElementById('monthly-mo')?.value);
  if (yr && mo) fetchMonthlyData(yr, mo);
};

async function buildAnnualPage(container) {
  const yr = new Date().getFullYear();
  container.innerHTML = `
    <div class="page-header">
      <div class="page-heading">របាយការណ៍ប្រចាំឆ្នាំ</div>
      <div class="page-subheading" id="annual-range">—</div>
    </div>
    <div class="page-ctrl">
      <label>ឆ្នាំ:</label>
      <input type="number" id="annual-yr" value="${yr}" min="2020" max="2099" style="width:72px">
      <button class="btn-load" onclick="reloadAnnual()">ផ្ទុក</button>
    </div>
    <div id="annual-body">${loadingHTML()}</div>`;
  await fetchAnnualData(yr);
}

async function fetchAnnualData(year) {
  const body = document.getElementById('annual-body');
  if (!body) return;
  body.innerHTML = loadingHTML();
  try {
    const res  = await fetch(`/api/reports/annual?year=${year}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const rng = document.getElementById('annual-range');
    if (rng) rng.textContent = `${fmt(data.period_start)} → ${fmt(data.period_end)}`;
    body.innerHTML = buildSummaryTable(data.monks);
  } catch (e) {
    body.innerHTML = errorHTML(e.message);
  }
}

window.reloadAnnual = function () {
  const yr = parseInt(document.getElementById('annual-yr')?.value);
  if (yr) fetchAnnualData(yr);
};

// ---- Spread 3: 3-Year (left) + Back cover (right) ---------------

async function buildTriennialPage(container) {
  const startYr = new Date().getFullYear() - 2;
  container.innerHTML = `
    <div class="page-header">

      <div class="page-heading">របាយការណ៍ប្រចាំ ៣ ឆ្នាំ</div>
      <div class="page-subheading" id="tri-range">—</div>
    </div>
    <div class="page-ctrl">
      <label>ឆ្នាំចាប់ផ្ដើម:</label>
      <input type="number" id="tri-yr" value="${startYr}" min="2020" max="2090" style="width:72px">
      <button class="btn-load" onclick="reloadTriennial()">ផ្ទុក</button>
    </div>
    <div id="tri-body">${loadingHTML()}</div>`;
  await fetchTriennialData(startYr);
}

async function fetchTriennialData(startYear) {
  const body = document.getElementById('tri-body');
  if (!body) return;
  body.innerHTML = loadingHTML();
  try {
    const res  = await fetch(`/api/reports/triennial?start_year=${startYear}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const rng = document.getElementById('tri-range');
    if (rng) rng.textContent = `${fmt(data.period_start)} → ${fmt(data.period_end)}`;
    body.innerHTML = buildSummaryTable(data.monks);
  } catch (e) {
    body.innerHTML = errorHTML(e.message);
  }
}

window.reloadTriennial = function () {
  const yr = parseInt(document.getElementById('tri-yr')?.value);
  if (yr) fetchTriennialData(yr);
};

// ================================================================
// SPREAD CONTENT MAP
// ================================================================

const SPREADS = [
  { type: 'cover' },
  { left: buildDailyPage,     right: buildBiweeklyPage },
  { left: buildMonthlyPage,   right: buildAnnualPage   },
  { left: buildTriennialPage, right: null /* back cover */ },
];

// ================================================================
// PAGE FLIP ENGINE
// ================================================================

function updateCounter() {
  if (!elPageCounter) return;
  const labels = ['ពេលបើក','ថ្ងៃ / ១៥ ថ្ងៃ','ខែ / ឆ្នាំ','៣ ឆ្នាំ'];
  elPageCounter.textContent = `${labels[currentSpread] ?? currentSpread + 1}`;
  if (elBtnPrev) elBtnPrev.disabled = currentSpread === 0;
  if (elBtnNext) elBtnNext.disabled = currentSpread === TOTAL_SPREADS - 1;
}

async function renderSpread(spread) {
  if (spread === 0) {
    // Show cover, hide book pages
    if (elCoverSpread) elCoverSpread.style.display = 'flex';
    elLeftPage.innerHTML = '';
    elRightPage.innerHTML = '';
    updatePeriodInfo();
    return;
  }

  if (elCoverSpread) elCoverSpread.style.display = 'none';
  const spec = SPREADS[spread];

  elLeftPage.innerHTML  = loadingHTML();
  elRightPage.innerHTML = spec.right ? loadingHTML() : '';

  if (spec.right === null) {
    // Back cover
    elRightPage.innerHTML = `<div class="back-cover-content">
      <div class="back-cover-seal">☸</div>
      <div class="back-cover-text">
        វត្តនិរោធរង្សី<br>
        <span style="font-size:9px;opacity:0.5">Wat Niroth Rangsay</span><br><br>
        <span style="font-size:9px">© ${new Date().getFullYear()}</span>
      </div>
    </div>`;
    await spec.left(elLeftPage);
  } else {
    await Promise.all([
      spec.left(elLeftPage),
      spec.right(elRightPage),
    ]);
  }
}

function cloneContent(source) {
  const d = document.createElement('div');
  d.style.cssText = 'width:100%;height:100%;overflow:hidden;padding:24px 22px;';
  d.innerHTML = source.innerHTML;
  return d;
}

async function flipTo(targetSpread) {
  if (isFlipping || targetSpread === currentSpread) return;
  if (targetSpread < 0 || targetSpread >= TOTAL_SPREADS) return;
  isFlipping = true;

  const direction = targetSpread > currentSpread ? 'forward' : 'backward';

  if (currentSpread === 0 && direction === 'forward') {
    // Opening the book (cover → first spread)
    elCoverSpread.style.display = 'none';
    currentSpread = targetSpread;
    await renderSpread(currentSpread);
    updateCounter();
    isFlipping = false;
    return;
  }

  if (targetSpread === 0 && direction === 'backward') {
    // Closing to cover
    currentSpread = 0;
    renderSpread(0);
    updateCounter();
    isFlipping = false;
    return;
  }

  // Prepare turning page
  if (direction === 'forward') {
    elTurningPage.style.left  = '';
    elTurningPage.style.right = '0';
    elTurningPage.style.transformOrigin = '0% 50%';
    elTpFront.innerHTML = elRightPage.innerHTML;
    // Pre-load next left page into tp-back
    elTpBack.innerHTML = loadingHTML();
  } else {
    elTurningPage.style.right = '';
    elTurningPage.style.left  = '0';
    elTurningPage.style.transformOrigin = '100% 50%';
    elTpFront.innerHTML = elLeftPage.innerHTML;
    elTpBack.innerHTML  = loadingHTML();
  }

  elTurningPage.style.display = 'block';
  elTurningPage.style.transform = 'rotateY(0deg)';

  // Trigger flip
  await new Promise(r => setTimeout(r, 30));
  elTurningPage.style.transition = 'transform 0.68s cubic-bezier(0.645,0.045,0.355,1.000)';
  elTurningPage.style.transform  = direction === 'forward'
    ? 'rotateY(-180deg)'
    : 'rotateY(180deg)';

  // Midway: render new content in background
  setTimeout(async () => {
    currentSpread = targetSpread;
    await renderSpread(currentSpread);
    updateCounter();
  }, 340);

  // After full flip
  setTimeout(() => {
    elTurningPage.style.display = 'none';
    elTurningPage.style.transform = 'rotateY(0deg)';
    isFlipping = false;
  }, 700);
}

// ================================================================
// FLAT VIEW
// ================================================================

async function loadFlatSection(containerId, fetcher) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = loadingHTML();
  try { el.innerHTML = await fetcher(); }
  catch (e) { el.innerHTML = errorHTML(e.message); }
}

async function buildFlatDaily() {
  const date = document.getElementById('flat-daily-date')?.value
            || new Date().toISOString().slice(0, 10);
  const res  = await fetch(`/api/attendance/daily-report?date=${date}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return buildDailyTable(data.records, date);
}

async function buildFlatBiweekly() {
  const ps  = document.getElementById('flat-bw-period')?.value
           || new Date().toISOString().slice(0, 10);
  const res  = await fetch(`/api/reports/biweekly?period_start=${ps}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return `<p style="font-size:11px;color:rgba(200,180,100,0.7);margin-bottom:8px">
    ${fmt(data.period_start)} → ${fmt(data.period_end)}</p>` + buildSummaryTable(data.monks);
}

async function buildFlatMonthly() {
  const yr = document.getElementById('flat-mo-yr')?.value || new Date().getFullYear();
  const mo = document.getElementById('flat-mo-mo')?.value || (new Date().getMonth()+1);
  const res  = await fetch(`/api/reports/monthly?year=${yr}&month=${mo}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return `<p style="font-size:11px;color:rgba(200,180,100,0.7);margin-bottom:8px">
    ${fmt(data.period_start)} → ${fmt(data.period_end)}</p>` + buildSummaryTable(data.monks);
}

async function buildFlatAnnual() {
  const yr = document.getElementById('flat-an-yr')?.value || new Date().getFullYear();
  const res  = await fetch(`/api/reports/annual?year=${yr}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return `<p style="font-size:11px;color:rgba(200,180,100,0.7);margin-bottom:8px">
    ${fmt(data.period_start)} → ${fmt(data.period_end)}</p>` + buildSummaryTable(data.monks);
}

async function buildFlatTriennial() {
  const yr = document.getElementById('flat-tri-yr')?.value || (new Date().getFullYear()-2);
  const res  = await fetch(`/api/reports/triennial?start_year=${yr}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message);
  return `<p style="font-size:11px;color:rgba(200,180,100,0.7);margin-bottom:8px">
    ${fmt(data.period_start)} → ${fmt(data.period_end)}</p>` + buildSummaryTable(data.monks);
}

// Flat reload helpers (called from inline onclick)
window.flatReloadDaily      = () => loadFlatSection('flat-daily-body',     buildFlatDaily);
window.flatReloadBiweekly   = () => loadFlatSection('flat-bw-body',        buildFlatBiweekly);
window.flatReloadMonthly    = () => loadFlatSection('flat-monthly-body',   buildFlatMonthly);
window.flatReloadAnnual     = () => loadFlatSection('flat-annual-body',    buildFlatAnnual);
window.flatReloadTriennial  = () => loadFlatSection('flat-tri-body',       buildFlatTriennial);

function toggleFlatMode() {
  flatMode = !flatMode;
  elFlatView.classList.toggle('visible', flatMode);
  elBookStage.classList.toggle('hidden', flatMode);
  document.querySelector('.book-nav')?.classList.toggle('hidden', flatMode);
  elBtnFlatToggle.textContent = flatMode ? '📖 ទិដ្ឋភាពសៀវភៅ' : '☰ ទិដ្ឋភាពតារាង';

  if (flatMode) {
    // Load all flat sections on first show
    loadFlatSection('flat-daily-body',    buildFlatDaily);
    loadFlatSection('flat-bw-body',       buildFlatBiweekly);
    loadFlatSection('flat-monthly-body',  buildFlatMonthly);
    loadFlatSection('flat-annual-body',   buildFlatAnnual);
    loadFlatSection('flat-tri-body',      buildFlatTriennial);
  }
}

// ================================================================
// PERIOD INFO + COMPILE
// ================================================================

async function updatePeriodInfo() {
  try {
    const res  = await fetch('/api/reports/periods');
    const data = await res.json();
    if (!data.success) return;
    const el = document.getElementById('ctx-period-info');
    if (el && data.current_period_start) {
      el.textContent = `រយៈពេលបច្ចុប្បន្ន: ${fmt(data.current_period_start)} (ថ្ងៃ ១)`;
    }
    const el2 = document.getElementById('cover-period-info');
    if (el2 && data.current_period_start) {
      const compiled = data.compiled_periods[0];
      el2.innerHTML = `
        <div>រយៈពេលបច្ចុប្បន្ន: <strong>${fmt(data.current_period_start)}</strong></div>
        <div>ប្រមូលចុងក្រោយ: <strong>${compiled ? fmt(compiled.start)+' → '+fmt(compiled.end) : 'មិនទាន់'}</strong></div>
        <div>ចំនួនប្លុក: <strong>${data.compiled_periods.length}</strong></div>`;
    }
  } catch (_) {}
}

async function compilePeriod() {
  const btn = document.getElementById('btn-compile');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = 'កំពុងប្រមូល...';
  try {
    const res  = await fetch('/api/attendance/compile-period', { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    toast(`✓ ប្រមូល ${data.compiled} ​ចំនួន | ${fmt(data.period_start)} → ${fmt(data.period_end)}`);
    updatePeriodInfo();
  } catch (e) {
    toast(`⚠ ${e.message}`, 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = '⚙ ប្រមូលកំណត់ ១៥ ថ្ងៃ';
  }
}

// ================================================================
// INIT
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  elBookWrap      = document.getElementById('book-wrap');
  elLeftPage      = document.getElementById('page-left');
  elRightPage     = document.getElementById('page-right');
  elCoverSpread   = document.getElementById('cover-spread');
  elTurningPage   = document.getElementById('turning-page');
  elTpFront       = document.getElementById('tp-front');
  elTpBack        = document.getElementById('tp-back');
  elBtnPrev       = document.getElementById('btn-prev');
  elBtnNext       = document.getElementById('btn-next');
  elPageCounter   = document.getElementById('page-counter');
  elLeftEdge      = document.getElementById('left-edge');
  elRightEdge     = document.getElementById('right-edge');
  elFlatView      = document.getElementById('flat-view');
  elBookStage     = document.getElementById('book-stage');
  elBtnFlatToggle = document.getElementById('btn-flat-toggle');
  elToast         = document.getElementById('book-toast');

  // Wire navigation
  elBtnPrev?.addEventListener('click',  () => flipTo(currentSpread - 1));
  elBtnNext?.addEventListener('click',  () => flipTo(currentSpread + 1));
  elLeftEdge?.addEventListener('click', () => flipTo(currentSpread - 1));
  elRightEdge?.addEventListener('click',() => flipTo(currentSpread + 1));
  elBtnFlatToggle?.addEventListener('click', toggleFlatMode);
  document.getElementById('btn-compile')?.addEventListener('click', compilePeriod);

  // Set default context date
  const ctxDate = document.getElementById('ctx-date');
  if (ctxDate && !ctxDate.value) {
    ctxDate.value = new Date().toISOString().slice(0, 10);
  }

  // Mobile auto-switch to flat view
  if (window.innerWidth <= 640) {
    flatMode = true;
    elFlatView?.classList.add('visible');
    elBookStage?.classList.add('hidden');
    document.querySelector('.book-nav')?.classList.add('hidden');
    if (elBtnFlatToggle) elBtnFlatToggle.textContent = '📖 ទិដ្ឋភាពសៀវភៅ';
    loadFlatSection('flat-daily-body',    buildFlatDaily);
    loadFlatSection('flat-bw-body',       buildFlatBiweekly);
    loadFlatSection('flat-monthly-body',  buildFlatMonthly);
    loadFlatSection('flat-annual-body',   buildFlatAnnual);
    loadFlatSection('flat-tri-body',      buildFlatTriennial);
  } else {
    renderSpread(0);   // show cover
  }

  updateCounter();
  updatePeriodInfo();
});
