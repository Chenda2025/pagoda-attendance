'use strict';

const BHIKKHU_RANK = {
    'ព្រះគ្រូសូត្រស្តាំ':         1,  // Senior Reciter (Right)
    'ព្រះគ្រូសូត្រឆ្វេង':         2,  // Senior Reciter (Left)
    'ព្រះគ្រូវិន័យធរ':           3,  // Discipline Keeper
    'ព្រះគ្រូលេខា':               4,  // Secretary Monk
    'ព្រះគ្រូប្រធានការក':        5,  // Committee Chairperson
    'ព្រះគ្រូអនុប្រធានការកទី១':  6,  // First Vice-Chairperson
    'ព្រះគ្រូអនុប្រធានការកទី២':  7,  // Second Vice-Chairperson
    'មេកុដិ':                     8,  // Kuti Head
    'អនុកុដិ':                    9,  // Deputy Kuti Head
    'ព្រះសង្ឃធម្មតា':            10, // Regular monk
};

const SAMANERA_ADMIN_RANK = {
    'មេកុដិ':  1,
    'អនុកុដិ': 2,
};

let allMonks = [];
let attendanceMap = new Map(); // monk_id → 'absent' | 'permission'
let currentBhikkhu    = [];
let currentSamanera   = [];
let bhikkhuOrder      = null;  // array of monk IDs from DB, or null
let samaneraOrder     = null;
let seatOrderUpdatedAt = null; // last known DB timestamp

const moveState = {
    bhikkhu:  { active: false, selectedPos: null },
    samanera: { active: false, selectedPos: null },
};

function applyStoredOrder(type, defaultSorted) {
    const stored = type === 'bhikkhu' ? bhikkhuOrder : samaneraOrder;
    if (!stored) return defaultSorted;
    const byId = new Map(defaultSorted.map(m => [m.id, m]));
    const ordered = [], seen = new Set();
    for (const id of stored) {
        const m = byId.get(id);
        if (m) { ordered.push(m); seen.add(id); }
    }
    defaultSorted.forEach(m => { if (!seen.has(m.id)) ordered.push(m); });
    return ordered;
}

async function swapMonks(type, posA, posB) {
    const current = type === 'bhikkhu' ? currentBhikkhu : currentSamanera;
    const ids = current.map(m => m.id);
    [ids[posA], ids[posB]] = [ids[posB], ids[posA]];
    if (type === 'bhikkhu') bhikkhuOrder = ids;
    else samaneraOrder = ids;

    try {
        const res  = await fetch('/api/seat-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ids })
        });
        const json = await res.json();
        if (json.success) {
            seatOrderUpdatedAt = json.updated_at; // so our own poll won't re-render unnecessarily
            showToast('បានរក្សាទុកប្លង់ ✓', 'success');
        } else {
            showToast('រក្សាទុកមិនបាន: ' + (json.message || 'error'), 'error');
        }
    } catch (err) {
        showToast('រក្សាទុកមិនបាន: ' + err.message, 'error');
    }

    if (type === 'bhikkhu') generateBhikkhu();
    else generateSamanera();
}

async function handleMoveClick(type, cell) {
    const pos   = parseInt(cell.dataset.pos);
    const state = moveState[type];
    if (state.selectedPos === null) {
        state.selectedPos = pos;
        cell.classList.add('seat-move-selected');
    } else if (state.selectedPos === pos) {
        state.selectedPos = null;
        cell.classList.remove('seat-move-selected');
    } else {
        await swapMonks(type, state.selectedPos, pos);
        state.selectedPos = null;
    }
}

function getActiveDate() {
    const v = document.getElementById('test-date')?.value;
    return v || new Date().toISOString().slice(0, 10);
}

// ============ DATA ============

async function loadData() {
    try {
        const today = getActiveDate();
        const [monkRes, attRes, orderRes] = await Promise.all([
            fetch('/api/monks'),
            fetch(`/api/attendance?date=${today}`),
            fetch('/api/seat-order')
        ]);

        const monkJson = await monkRes.json();
        if (!monkJson.success) throw new Error(monkJson.message);
        allMonks = monkJson.monks;

        const attJson = await attRes.json();
        if (attJson.success) {
            attJson.records.forEach(r => attendanceMap.set(r.monk_id, r.status));
        }

        const orderJson = await orderRes.json();
        if (orderJson.success) {
            bhikkhuOrder       = orderJson.bhikkhu;
            samaneraOrder      = orderJson.samanera;
            seatOrderUpdatedAt = orderJson.updated_at;
            _applyGridConfig(orderJson.grid_config);
        }

        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('layout-content').style.display = 'block';

        generateBhikkhu();
        generateSamanera();
    } catch (err) {
        document.getElementById('loading-state').innerHTML =
            `<p style="color:#e74c3c">មានបញ្ហា: ${escapeHtml(err.message)}</p>`;
    }
}

// ============ GENERATORS ============

function generateBhikkhu() {
    const rows = clamp(parseInt(document.getElementById('bhikkhu-rows').value) || 3, 1, 30);
    const cols = clamp(parseInt(document.getElementById('bhikkhu-cols').value) || 5, 1, 30);
    localStorage.setItem('bhikkhu-rows', rows);
    localStorage.setItem('bhikkhu-cols', cols);

    const defaultSorted = allMonks
        .filter(m => m.monk_type === 'ភិក្ខុ')
        .sort((a, b) => {
            const ra = BHIKKHU_RANK[a.position] ?? 99;
            const rb = BHIKKHU_RANK[b.position] ?? 99;
            if (ra !== rb) return ra - rb;
            return b.vassa_years - a.vassa_years; // tiebreak: more vassa first
        });

    currentBhikkhu = applyStoredOrder('bhikkhu', defaultSorted);
    renderGrid('bhikkhu-grid', currentBhikkhu, rows, cols, 'bhikkhu');
}

function generateSamanera() {
    const rows = clamp(parseInt(document.getElementById('samanera-rows').value) || 12, 1, 50);
    const cols = clamp(parseInt(document.getElementById('samanera-cols').value) || 10, 1, 30);
    localStorage.setItem('samanera-rows', rows);
    localStorage.setItem('samanera-cols', cols);

    const defaultSorted = allMonks
        .filter(m => m.monk_type === 'សាមណេរ')
        .sort((a, b) => {
            const ra = SAMANERA_ADMIN_RANK[a.position] ?? 99;
            const rb = SAMANERA_ADMIN_RANK[b.position] ?? 99;
            if (ra !== rb) return ra - rb;
            if (b.vassa_years !== a.vassa_years) return b.vassa_years - a.vassa_years;
            return a.fullname.localeCompare(b.fullname);
        });

    currentSamanera = applyStoredOrder('samanera', defaultSorted);
    renderGrid('samanera-grid', currentSamanera, rows, cols, 'samanera');
}

// ============ GRID RENDERER ============

function renderGrid(containerId, monks, rows, cols, type) {
    const container = document.getElementById(containerId);
    const total = rows * cols;
    const overflow = monks.length > total ? monks.length - total : 0;
    const typeLabel = type === 'bhikkhu' ? 'ភិក្ខុ' : 'សាមណេរ';

    let html = `
        <div class="grid-stats no-print">
            <span class="stat-item">ចំនួនក្រឡា: <strong>${total}</strong></span>
            <span class="stat-item">ចំនួន${typeLabel}: <strong>${monks.length} នាក់</strong></span>
            ${overflow > 0
                ? `<span class="stat-item stat-overflow">⚠ ${typeLabel} ${overflow} នាក់ លើសក្រឡា</span>`
                : monks.length <= total
                    ? `<span class="stat-item stat-ok">✓ ក្រឡាទំនេរ: ${total - monks.length}</span>`
                    : ''}
        </div>
        <div class="grid-scroll">
        <table class="seat-grid">
            <tbody>`;

    for (let r = 0; r < rows; r++) {
        html += '<tr>';
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const monk = monks[idx];
            if (monk) {
                const sub = (type === 'bhikkhu' || SAMANERA_ADMIN_RANK[monk.position])
                    ? escapeHtml(monk.position)
                    : `វស្សា ${monk.vassa_years}`;
                const att = attendanceMap.get(monk.id);
                const attClass = att === 'absent' ? ' seat-absent' : att === 'permission' ? ' seat-permission' : '';
                const attBadge = att ? `<span class="seat-status">${att === 'absent' ? 'អវត្តមាន' : 'ច្បាប់'}</span>` : '';
                html += `
                    <td class="seat-cell seat-filled${attClass}"
                        data-monk-id="${monk.id}"
                        data-monk-name="${escapeHtml(monk.fullname)}"
                        data-pos="${idx}"
                        data-type="${type}"
                        title="${escapeHtml(monk.fullname)}">
                        <span class="seat-num">${idx + 1}</span>
                        <span class="seat-name">${escapeHtml(monk.fullname)}</span>
                        <span class="seat-sub">${sub}</span>
                        ${attBadge}
                    </td>`;
            } else {
                html += `<td class="seat-cell seat-empty"><span class="seat-num">${idx + 1}</span></td>`;
            }
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    reapplySearch();
}

// ============ ATTENDANCE ============

async function setAttendance(monkId, status) {
    const today = getActiveDate();
    try {
        const res = await fetch('/api/attendance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monk_id: monkId, status, date: today })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        attendanceMap.set(monkId, status);
        updateCellDisplay(monkId);
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

async function clearAttendance(monkId) {
    const today = getActiveDate();
    try {
        const res = await fetch(`/api/attendance/${monkId}?date=${today}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        attendanceMap.delete(monkId);
        updateCellDisplay(monkId);
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

function updateCellDisplay(monkId) {
    const cell = document.querySelector(`[data-monk-id="${monkId}"]`);
    if (!cell) return;
    const status = attendanceMap.get(monkId);
    cell.classList.remove('seat-absent', 'seat-permission');
    const badge = cell.querySelector('.seat-status');
    if (badge) badge.remove();
    if (status) {
        cell.classList.add(status === 'absent' ? 'seat-absent' : 'seat-permission');
        const span = document.createElement('span');
        span.className = 'seat-status';
        span.textContent = status === 'absent' ? 'អវត្តមាន' : 'ច្បាប់';
        cell.appendChild(span);
    }
}

// ============ SEARCH ============

function initSearch() {
    const input    = document.getElementById('search-name');
    const clearBtn = document.getElementById('btn-clear-search');

    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearBtn.style.display = q ? 'inline-flex' : 'none';
        highlightSearch(q);
    });

    clearBtn.addEventListener('click', () => {
        input.value = '';
        clearBtn.style.display = 'none';
        highlightSearch('');
        input.focus();
    });
}

function highlightSearch(query) {
    document.querySelectorAll('.seat-filled[data-monk-id]').forEach(cell => {
        const match = query && (cell.dataset.monkName || '').includes(query);
        cell.classList.toggle('seat-highlight', !!match);
    });
}

function reapplySearch() {
    const input = document.getElementById('search-name');
    if (input) highlightSearch(input.value.trim());
}

// ============ GRID CONFIG ============

function _applyGridConfig(cfg) {
    if (!cfg) return;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
    };
    set('bhikkhu-rows',  cfg.br);
    set('bhikkhu-cols',  cfg.bc);
    set('samanera-rows', cfg.sr);
    set('samanera-cols', cfg.sc);
}

async function saveGridConfig() {
    if (typeof PAGE_ROLE === 'undefined' || PAGE_ROLE !== 'admin') return;
    const cfg = {
        br: parseInt(document.getElementById('bhikkhu-rows')?.value  || 3),
        bc: parseInt(document.getElementById('bhikkhu-cols')?.value  || 5),
        sr: parseInt(document.getElementById('samanera-rows')?.value || 12),
        sc: parseInt(document.getElementById('samanera-cols')?.value || 10),
    };
    try {
        const res  = await fetch('/api/seat-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'grid_config', ids: cfg })
        });
        const json = await res.json();
        if (json.success) seatOrderUpdatedAt = json.updated_at;
    } catch { /* non-fatal */ }
}

// ============ LIVE SEAT-ORDER POLL ============

async function pollSeatOrder() {
    // Skip while admin is mid-swap (avoids clearing the selected-cell highlight)
    if (moveState.bhikkhu.active || moveState.samanera.active) return;
    try {
        const res  = await fetch('/api/seat-order');
        const json = await res.json();
        if (!json.success) return;

        // Nothing changed — skip re-render
        if (json.updated_at === seatOrderUpdatedAt) return;

        seatOrderUpdatedAt = json.updated_at;
        bhikkhuOrder  = json.bhikkhu;
        samaneraOrder = json.samanera;
        _applyGridConfig(json.grid_config);
        generateBhikkhu();
        generateSamanera();
    } catch { /* ignore network errors */ }
}

function scheduleNewDayReset() {
    const now = new Date();
    const reset = new Date(now);
    reset.setHours(23, 59, 0, 0);

    let msUntil = reset - now;
    if (msUntil <= 0) msUntil += 24 * 60 * 60 * 1000; // already past — aim for tomorrow

    setTimeout(() => {
        attendanceMap.clear();
        generateBhikkhu();
        generateSamanera();
        showToast('ថ្ងៃថ្មី — ការចុះឈ្មោះត្រូវបានសម្អាតរួចរាល់', 'success');
        scheduleNewDayReset(); // reschedule for next night
    }, msUntil);
}

function initPopover() {
    const popover   = document.getElementById('att-popover');
    const nameEl    = popover.querySelector('.att-popover-name');
    const absentBtn = popover.querySelector('.att-btn-absent');
    const permBtn   = popover.querySelector('.att-btn-permission');
    const clearBtn  = popover.querySelector('.att-btn-clear');
    let activeMonkId = null;

    const MAX_ABSENT = 2;
    const MAX_PERM   = 2;

    function positionPopover(cell) {
        const rect = cell.getBoundingClientRect();
        const pw = 200;
        let left = rect.right + 6;
        if (left + pw > window.innerWidth) left = rect.left - pw - 6;
        let top = rect.top;
        if (top + 140 > window.innerHeight) top = window.innerHeight - 150;
        popover.style.left = left + 'px';
        popover.style.top  = top  + 'px';
    }

    function resetButtons() {
        absentBtn.disabled = false;
        absentBtn.style.opacity = '';
        absentBtn.title = '';
        permBtn.disabled = false;
        permBtn.style.opacity = '';
        permBtn.title = '';
    }

    document.addEventListener('click', async e => {
        const cell = e.target.closest('.seat-filled[data-monk-id]');
        if (cell) {
            e.stopPropagation();
            // Move-mode: select/swap instead of opening popover
            const cellType = cell.dataset.type;
            if (moveState[cellType]?.active) {
                await handleMoveClick(cellType, cell);
                return;
            }
            activeMonkId = parseInt(cell.dataset.monkId);
            const monkName = cell.dataset.monkName;

            nameEl.textContent = monkName;
            clearBtn.style.display = attendanceMap.has(activeMonkId) ? 'block' : 'none';
            resetButtons();
            positionPopover(cell);
            popover.style.display = 'block';

            try {
                const res  = await fetch(`/api/attendance/history/${activeMonkId}?date=${getActiveDate()}`);
                const hist = await res.json();
                if (!hist.success) return;

                const absentMaxed = hist.absent_count >= MAX_ABSENT;
                const permMaxed   = hist.permission_count >= MAX_PERM;

                if (permMaxed) {
                    // Permission ceiling hit — lock Permission button completely
                    permBtn.disabled = true;
                    permBtn.style.opacity = '0.35';
                    permBtn.title = 'ច្បាប់គ្រប់ចំនួន';
                    alert(
                        `⚠️ ${monkName}\n\n` +
                        `ច្បាប់ ${MAX_PERM}\n`
                    );
                } else if (absentMaxed) {
                    // Absence ceiling hit but Permission still available — warn only, keep Permission enabled
                    alert(
                        `⚠️ ${monkName}\n\n` +
                        `អវត្តមាន ${MAX_ABSENT}\n` 
                    );
                }
            } catch { /* network error — allow normal interaction */ }
            return;
        }
        if (!popover.contains(e.target)) popover.style.display = 'none';
    });

    absentBtn.addEventListener('click', async () => {
        popover.style.display = 'none';
        await setAttendance(activeMonkId, 'absent');
    });

    permBtn.addEventListener('click', async () => {
        popover.style.display = 'none';
        await setAttendance(activeMonkId, 'permission');
    });

    clearBtn.addEventListener('click', async () => {
        popover.style.display = 'none';
        await clearAttendance(activeMonkId);
    });
}

// ============ TELEGRAM SUBMIT ============

async function submitAttendance() {
    if (attendanceMap.size === 0) {
        showToast('មិនមានការចុះឈ្មោះត្រូវបញ្ជូនទេ', 'error');
        return;
    }
    const btn = document.getElementById('btn-submit-att');
    btn.disabled = true;
    btn.textContent = 'កំពុងបញ្ជូន...';
    try {
        const res  = await fetch('/api/attendance/submit', { method: 'POST' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        showToast(`បានបញ្ជូន ${json.total} នាក់ ទៅ Telegram ជោគជ័យ!`, 'success');
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg> បញ្ជូន Telegram`;
    }
}

// ============ EXPORT ============

function _getGridParams() {
    return {
        br: clamp(parseInt(document.getElementById('bhikkhu-rows').value)  || 3,  1, 30),
        bc: clamp(parseInt(document.getElementById('bhikkhu-cols').value)  || 5,  1, 30),
        sr: clamp(parseInt(document.getElementById('samanera-rows').value) || 12, 1, 50),
        sc: clamp(parseInt(document.getElementById('samanera-cols').value) || 10, 1, 30),
    };
}

async function _doExport(endpoint, ext, btn, busyLabel, doneLabel) {
    const { br, bc, sr, sc } = _getGridParams();
    const origHTML = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = busyLabel;

    try {
        const res = await fetch(`${endpoint}?br=${br}&bc=${bc}&sr=${sr}&sc=${sc}`);
        if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.message || `HTTP ${res.status}`);
        }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `layout_${new Date().toISOString().slice(0, 10)}.${ext}`;
        a.click();
        URL.revokeObjectURL(a.href);
        showToast(doneLabel, 'success');
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled   = false;
        btn.innerHTML  = origHTML;
    }
}

function exportWord() {
    const btn = document.getElementById('btn-export-word');
    _doExport('/api/export-layout', 'docx', btn, 'កំពុងបង្កើត...', 'ឯកសារ Word បានដំណើរការជោគជ័យ!');
}

function exportPdf() {
    const btn = document.getElementById('btn-export-pdf');
    _doExport('/api/export-layout-pdf', 'pdf', btn, 'កំពុងបង្កើត...', 'ឯកសារ PDF បានដំណើរការជោគជ័យ!');
}

// ============ UTILITIES ============

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

let toastTimer = null;
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} visible`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
    const restore = (id, key) => {
        const saved = localStorage.getItem(key);
        if (saved) document.getElementById(id).value = saved;
    };
    restore('bhikkhu-rows',  'bhikkhu-rows');
    restore('bhikkhu-cols',  'bhikkhu-cols');
    restore('samanera-rows', 'samanera-rows');
    restore('samanera-cols', 'samanera-cols');

    // Test date picker — admin only
    const testDateEl = document.getElementById('test-date');
    if (testDateEl) {
        testDateEl.value = new Date().toISOString().slice(0, 10);
        testDateEl.addEventListener('change', () => { attendanceMap.clear(); loadData(); });
        document.getElementById('btn-reset-date').addEventListener('click', () => {
            testDateEl.value = new Date().toISOString().slice(0, 10);
            attendanceMap.clear();
            loadData();
        });
    }

    // Move-mode checkbox toggles (admin only — elements may not exist for user1)
    ['bhikkhu', 'samanera'].forEach(type => {
        document.getElementById(`move-toggle-${type}`)?.addEventListener('change', function () {
            moveState[type].active = this.checked;
            moveState[type].selectedPos = null;
            document.querySelectorAll(`#${type}-grid .seat-move-selected`)
                .forEach(el => el.classList.remove('seat-move-selected'));
            document.getElementById(`${type}-grid`).classList.toggle('move-mode-active', this.checked);
        });
    });

    initSearch();
    initPopover();
    scheduleNewDayReset();
    loadData();
    setInterval(pollSeatOrder, 5000); // sync seat order from DB every 5 s

    document.getElementById('btn-gen-bhikkhu')?.addEventListener('click', () => { generateBhikkhu();  saveGridConfig(); });
    document.getElementById('btn-gen-samanera')?.addEventListener('click', () => { generateSamanera(); saveGridConfig(); });
    document.getElementById('btn-submit-att').addEventListener('click', submitAttendance);
    // Export dropdown
    const _layDd = document.getElementById('lay-export-dd');
    document.getElementById('btn-lay-export-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        _layDd.classList.toggle('open');
    });
    document.addEventListener('click', () => _layDd.classList.remove('open'));

    document.getElementById('btn-export-word').addEventListener('click', () => { _layDd.classList.remove('open'); exportWord(); });
    document.getElementById('btn-export-pdf').addEventListener('click',  () => { _layDd.classList.remove('open'); exportPdf(); });

    document.getElementById('bhikkhu-rows')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('bhikkhu-cols')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('samanera-rows')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });
    document.getElementById('samanera-cols')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });
});