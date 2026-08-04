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
    'សមណសិស្ស':                 10, // Disciple / student monk
};

const SAMANERA_ADMIN_RANK = {
    'មេកុដិ':  1,
    'អនុកុដិ': 2,
};

let allMonks = [];
let attendanceMap = new Map(); // monk_id → 'absent' | 'permission'
let permissionsMap = new Map(); // monk_id → { end_date, days_left }
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
        if (id === null) {
            ordered.push(null);
            continue;
        }
        const m = byId.get(id);
        if (m) { 
            ordered.push(m); 
            seen.add(id); 
        } else {
            ordered.push(null);
        }

    }
    defaultSorted.forEach(m => { if (!seen.has(m.id)) ordered.push(m); });
    return ordered;
}

async function swapMonks(type, posA, posB) {
    const current = type === 'bhikkhu' ? currentBhikkhu : currentSamanera;
    const ids = current.map(m => m ? m.id : null);
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
            fetch('/api/monks?residing=1'),
            fetch(`/api/attendance?date=${today}`),
            fetch('/api/seat-order')
        ]);

        const monkJson = await monkRes.json();
        if (!monkJson.success) throw new Error(monkJson.message);
        allMonks = monkJson.monks;

        const attJson = await attRes.json();
        if (attJson.success) {
            attJson.records.forEach(r => attendanceMap.set(r.monk_id, r.status));
            if (attJson.permissions_info) {
                for (const [mid, info] of Object.entries(attJson.permissions_info)) {
                    permissionsMap.set(parseInt(mid), info);
                }
            }
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

function renderTotals() {
    const all    = [...currentBhikkhu, ...currentSamanera].filter(Boolean);
    const absent = all.filter(m => attendanceMap.get(m.id) === 'absent').length;
    const perm   = all.filter(m => attendanceMap.get(m.id) === 'permission').length;
    const listBtn = document.getElementById('btn-show-att-list');
    if (listBtn) listBtn.style.display = 'inline-flex';
}

async function showAttList() {
    const modal = document.getElementById('att-list-modal');
    const date  = getActiveDate();

    _renderAttModal({ date, loading: true });
    modal.style.display = 'flex';

    const sections = [
        { label: 'ភិក្ខុ',  dotClass: 'dot-bhikkhu',  monks: currentBhikkhu  },
        { label: 'សាមណេរ', dotClass: 'dot-samanera', monks: currentSamanera },
    ];

    const markedMonks = [];
    for (const { monks } of sections)
        monks.filter(m => m && attendanceMap.has(m.id)).forEach(m => markedMonks.push(m));

    const histMap = new Map();
    await Promise.all(markedMonks.map(async m => {
        try {
            const res  = await fetch(`/api/attendance/history/${m.id}?date=${date}`);
            const json = await res.json();
            if (json.success) histMap.set(m.id, json);
        } catch { /* show without totals */ }
    }));

    let grandAbsent = 0, grandPerm = 0, bodyHtml = '';

    for (const { label, dotClass, monks } of sections) {
        const absentList = monks.filter(m => m && attendanceMap.get(m.id) === 'absent');
        const permList   = monks.filter(m => m && attendanceMap.get(m.id) === 'permission');
        if (!absentList.length && !permList.length) continue;

        grandAbsent += absentList.length;
        grandPerm   += permList.length;

        bodyHtml += `<div class="att-list-section">
            <div class="att-list-section-header">
                <span class="att-list-section-dot ${dotClass}"></span>
                <span class="att-list-section-name">${label}</span>
                <span class="att-list-section-count">${absentList.length + permList.length} នាក់</span>
            </div>`;

        const renderGroup = (list, type) => {
            if (!list.length) return '';
            const isAbsent = type === 'absent';
            let g = `<div class="att-list-group">
                <div class="att-list-group-header">
                    <span class="att-list-group-stripe ${isAbsent ? 'stripe-absent' : 'stripe-perm'}"></span>
                    <span class="att-list-group-name ${isAbsent ? 'gname-absent' : 'gname-perm'}">${isAbsent ? 'អវត្តមាន' : 'ច្បាប់'}</span>
                    <span class="att-list-group-cnt">${list.length}</span>
                </div>
                <ol class="att-list-ol">`;
            list.forEach((m, i) => {
                const hist = histMap.get(m.id);
                const av   = hist?.absent_count     ?? '—';
                const cp   = hist?.permission_count ?? '—';
                let sub = escapeHtml(m.position);
                if (!isAbsent) {
                    const info = permissionsMap.get(m.id);
                    if (info && info.days_left >= 0)
                        sub += info.days_left === 0 ? ' · ល្ងាចនេះ' : ` · សល់ ${info.days_left} ថ្ងៃ`;
                    if (info?.reason) sub += ` · ${escapeHtml(info.reason)}`;
                }
                g += `<li class="att-list-row ${isAbsent ? 'att-row-absent' : 'att-row-perm'}" data-monk-id="${m.id}">
                    <span class="att-list-num">${i + 1}</span>
                    <span class="att-list-info">
                        <button class="att-list-name att-name-btn" data-monk-id="${m.id}" data-monk-name="${escapeHtml(m.fullname)}">${escapeHtml(m.fullname)}</button>
                        <div class="att-list-pos">${sub}</div>
                    </span>
                    <span class="att-list-hist">
                        <span class="hist-chip hist-chip-absent">
                            <span class="hist-chip-val">${av}</span>
                            <span class="hist-chip-lbl">អវត្តមាន</span>
                        </span>
                        <span class="hist-chip hist-chip-perm">
                            <span class="hist-chip-val">${cp}</span>
                            <span class="hist-chip-lbl">ច្បាប់</span>
                        </span>
                    </span>
                    ${!isAbsent ? `<button class="att-list-edit-btn" data-monk-id="${m.id}" data-monk-name="${escapeHtml(m.fullname)}" title="កែប្រែ">
                        <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>` : ''}
                </li>`;
            });
            return g + `</ol></div>`;
        };

        bodyHtml += renderGroup(absentList, 'absent');
        bodyHtml += renderGroup(permList,   'permission');
        bodyHtml += `</div>`;
    }

    _renderAttModal({ date, loading: false, bodyHtml, grandAbsent, grandPerm });
}

async function showMonkHistory(monkId, monkName) {
    const modal = document.getElementById('monk-history-modal');
    const body  = document.getElementById('mh-body');

    document.getElementById('mh-monk-name').textContent = monkName;
    document.getElementById('mh-monk-sub').textContent  = '';
    document.getElementById('mh-absent-count').textContent = '—';
    document.getElementById('mh-perm-count').textContent   = '—';
    body.innerHTML = `<div class="mh-loading">កំពុងផ្ទុក…</div>`;
    modal.style.display = 'flex';

    try {
        const date = getActiveDate();
        const res  = await fetch(`/api/attendance/full-history/${monkId}?date=${date}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Error');

        document.getElementById('mh-absent-count').textContent = data.absent_count;
        document.getElementById('mh-perm-count').textContent   = data.permission_count;

        const today = new Date().toISOString().slice(0, 10);
        const isDone = d => d <= today;

        const tickSvg = `<span class="mh-spacer"></span><svg class="mh-tick" xmlns="http://www.w3.org/2000/svg" width="12" height="12"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
            stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">
            <polyline points="20 6 9 17 4 12"/>
        </svg>`;

        let html = '';

        if (data.absent_dates.length > 0) {
            html += `<div class="mh-section">
                <div class="mh-section-title mh-sec-absent">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    អវត្តមាន
                </div>
                <ul class="mh-date-list">`;
            data.absent_dates.forEach((entry, i) => {
                const done = isDone(entry.date);
                html += `<li class="mh-date-row mh-date-absent${done ? ' mh-done' : ''}">
                    <span class="mh-date-num">${i + 1}</span>
                    <span class="mh-date-val">${entry.date}</span>
                    ${done ? tickSvg : ''}
                </li>`;
            });
            html += `</ul></div>`;
        }

        if (data.perm_dates.length > 0) {
            html += `<div class="mh-section">
                <div class="mh-section-title mh-sec-perm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    ច្បាប់
                </div>
                <ul class="mh-date-list">`;
            data.perm_dates.forEach((entry, i) => {
                const done = isDone(entry.date);
                html += `<li class="mh-date-row mh-date-perm${done ? ' mh-done' : ''}">
                    <span class="mh-date-num">${i + 1}</span>
                    <span class="mh-date-val">${entry.date}</span>
                    ${entry.reason ? `<span class="mh-date-reason">${escapeHtml(entry.reason)}</span>` : ''}
                    ${done ? tickSvg : ''}
                </li>`;
            });
            html += `</ul></div>`;
        }

        if (!html) html = `<div class="mh-empty">គ្មានទិន្នន័យ</div>`;
        body.innerHTML = html;

    } catch (err) {
        body.innerHTML = `<div class="mh-empty" style="color:#e74c3c">មានបញ្ហា: ${escapeHtml(err.message)}</div>`;
    }
}

function _renderAttModal({ date, loading, bodyHtml = '', grandAbsent = 0, grandPerm = 0 }) {
    const modal   = document.getElementById('att-list-modal');
    const all     = [...currentBhikkhu, ...currentSamanera].filter(Boolean);
    const total   = all.length;
    const present = total - grandAbsent - grandPerm;

    modal.querySelector('.att-list-header-date').textContent = date;

    modal.querySelector('.att-list-summary').innerHTML = `
        <div class="att-list-summary-card als-total">
            <span class="als-num">${total}</span><span class="als-lbl">ព្រះសង្ឃ</span>
        </div>
        <div class="att-list-summary-card als-present">
            <span class="als-num">${present}</span><span class="als-lbl">វត្តមាន</span>
        </div>
        <div class="att-list-summary-card als-absent">
            <span class="als-num">${grandAbsent}</span><span class="als-lbl">អវត្តមាន</span>
        </div>
        <div class="att-list-summary-card als-perm">
            <span class="als-num">${grandPerm}</span><span class="als-lbl">ច្បាប់</span>
        </div>`;

    modal.querySelector('.att-list-body').innerHTML = loading
        ? `<div class="att-list-loading">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="#a0aec0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
                style="animation:spin 1s linear infinite">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            កំពុងផ្ទុក...</div>`
        : bodyHtml ||
          `<div class="att-list-empty">
              <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none"
                  stroke="#cbd5e0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <p style="margin-top:10px">ព្រះសង្ឃទាំងអស់ចូលរួម</p>
          </div>`;

    modal.querySelector('.att-list-footer').innerHTML = loading ? '' : `
        <div class="att-list-footer-item">
            <span class="att-list-footer-dot footer-dot-absent"></span>
            អវត្តមាន: <strong>${grandAbsent}</strong>
        </div>
        <div class="att-list-footer-item">
            <span class="att-list-footer-dot footer-dot-perm"></span>
            ច្បាប់: <strong>${grandPerm}</strong>
        </div>`;
}

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
    renderTotals();

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
    renderTotals();

}

// ============ GRID RENDERER ============

function renderGrid(containerId, monks, rows, cols, type) {
    const container = document.getElementById(containerId);
    const total = rows * cols;
    const actualCount = monks.filter(m => m !== null).length;
    const overflow = actualCount > total ? actualCount - total : 0;
    const typeLabel = type === 'bhikkhu' ? 'ភិក្ខុ' : 'សាមណេរ';

    let html = `
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
                
                let badgeText = '';
                let permIcon = '';
                if (att === 'absent') badgeText = 'អវត្តមាន';
                else if (att === 'permission') {
                    const permInfo = permissionsMap.get(monk.id);
                    badgeText = 'ច្បាប់';
                    if (permInfo && permInfo.days_left >= 0) {
                        if (permInfo.days_left === 0) {
                            badgeText += ` (ល្ងាចនេះ)`;
                        } else {
                            badgeText += ` (សល់${permInfo.days_left} ថ្ងៃ)`;
                        }
                    }
                    if (permInfo) {
                        permIcon = `<span class="perm-icon"
                            data-start="${escapeHtml(permInfo.start_date || '')}"
                            data-end="${escapeHtml(permInfo.end_date || '')}"
                            data-days="${permInfo.days_left ?? ''}"
                            data-reason="${escapeHtml(permInfo.reason || '')}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </span>`;
                    }
                }
                const attBadge = badgeText ? `<span class="seat-status">${badgeText}</span>` : '';
                
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
                        ${permIcon}
                    </td>`;
            } else {
                html += `<td class="seat-cell seat-empty" data-pos="${idx}" data-type="${type}"><span class="seat-num">${idx + 1}</span></td>`;
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
        
        if (status === 'absent') {
            span.textContent = 'អវត្តមាន';
        } else {
            let text = 'ច្បាប់';
            const permInfo = permissionsMap.get(monkId);
            if (permInfo && permInfo.days_left >= 0) {
                if (permInfo.days_left === 0) {
                    text += ` (ល្ងាចនេះ)`;
                } else {
                    text += ` (សល់${permInfo.days_left} ថ្ងៃ)`;
                }
            }
            span.textContent = text;
        }
        
        cell.appendChild(span);
    }
    renderTotals();
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
    // Auto-clear absent/permission seat marks every 3 hours (UI map).
    const CLEAR_EVERY_MS = 3 * 60 * 60 * 1000;

    setTimeout(() => {
        attendanceMap.clear();
        generateBhikkhu();
        generateSamanera();
        showToast('បានសម្អាតអវត្តមាន/ច្បាប់ (រៀងរាល់ ៣ ម៉ោង)', 'success');
        scheduleNewDayReset();
    }, CLEAR_EVERY_MS);
}

let activeMonkId = null;

function openPermModal(monkId, monkName) {
    activeMonkId = monkId;
    document.getElementById('perm-monk-name').textContent = monkName;
    const info = permissionsMap.get(monkId);
    const today = getActiveDate();
    document.getElementById('perm-start-date').value = info?.start_date || today;
    document.getElementById('perm-end-date').value   = info?.end_date   || today;
    document.getElementById('perm-reason').value     = info?.reason     || '';
    document.getElementById('permission-modal').style.display = 'flex';
}

function initPopover() {
    const popover   = document.getElementById('att-popover');
    const nameEl    = popover.querySelector('.att-popover-name');
    const absentBtn = popover.querySelector('.att-btn-absent');
    const permBtn   = popover.querySelector('.att-btn-permission');
    const clearBtn  = popover.querySelector('.att-btn-clear');

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
        const cell = e.target.closest('.seat-cell');
        if (cell) {
            const cellType = cell.dataset.type;
            if (!cellType) return;
            
            // Move-mode: select/swap
            if (moveState[cellType]?.active) {
                e.stopPropagation();
                await handleMoveClick(cellType, cell);
                return;
            }

            // Popover mode (only on filled seats)
            if (!cell.classList.contains('seat-filled') || !cell.dataset.monkId) return;

            e.stopPropagation();

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

    // Permission Modal Logic
    const permModal       = document.getElementById('permission-modal');
    const permStartInput  = document.getElementById('perm-start-date');
    const permEndInput    = document.getElementById('perm-end-date');
    const permReasonInput = document.getElementById('perm-reason');

    permBtn.addEventListener('click', () => {
        popover.style.display = 'none';
        openPermModal(activeMonkId, nameEl.textContent);
    });
    
    document.getElementById('btn-cancel-perm').addEventListener('click', () => {
        permModal.style.display = 'none';
    });
    permModal.addEventListener('click', e => {
        if (e.target === permModal) permModal.style.display = 'none';
    });
    
    document.getElementById('btn-save-perm').addEventListener('click', async () => {
        const start = permStartInput.value;
        const end = permEndInput.value;
        const reason = permReasonInput.value.trim();
        
        if (!start || !end) {
            showToast('សូមបញ្ចូលថ្ងៃចាប់ផ្តើម និងថ្ងៃបញ្ចប់', 'error');
            return;
        }
        if (new Date(end) < new Date(start)) {
            showToast('ថ្ងៃបញ្ចប់មិនអាចមុនថ្ងៃចាប់ផ្តើមទេ', 'error');
            return;
        }
        
        const btn = document.getElementById('btn-save-perm');
        btn.disabled = true;
        btn.textContent = 'កំពុងរក្សាទុក...';
        
        try {
            const res = await fetch('/api/permissions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    monk_id: activeMonkId,
                    start_date: start,
                    end_date: end,
                    reason: reason
                })
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            
            showToast('បានរក្សាទុកការសុំច្បាប់ជោគជ័យ', 'success');
            permModal.style.display = 'none';
            await loadData();
            if (document.getElementById('att-list-modal').style.display !== 'none')
                await showAttList();
        } catch (err) {
            const msg = String(err.message || '');
            const friendly = /duplicate key|unique constraint/i.test(msg)
                ? 'មិនអាចរក្សាទុកការសុំច្បាប់បាន។ សូមព្យាយាមម្តងទៀត។'
                : msg;
            showToast('មានបញ្ហា: ' + friendly, 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'រក្សាទុក';
        }
    });

    clearBtn.addEventListener('click', async () => {
        popover.style.display = 'none';
        await clearAttendance(activeMonkId);
        // Also clear from permissionsMap locally for UI update
        permissionsMap.delete(activeMonkId);
        updateCellDisplay(activeMonkId);
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
        const date = getActiveDate();
        const res  = await fetch('/api/attendance/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date }),
        });
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
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'កំពុងរៀបចំ...';
    setTimeout(() => {
        window.open(`/api/export-layout-pdf?date=${document.getElementById('att-date').value}`, '_blank');
        btn.disabled = false;
        btn.innerHTML = origHTML;
    }, 300);
}

// ============ PERMISSION PREVIEW TOOLTIP ============

function initPermTooltip() {
    const tooltip = document.getElementById('perm-tooltip');

    document.addEventListener('mouseover', e => {
        const icon = e.target.closest('.perm-icon');
        if (!icon) return;

        const start  = icon.dataset.start;
        const end    = icon.dataset.end;
        const days   = icon.dataset.days;
        const reason = icon.dataset.reason;

        let html = `<div class="perm-tip-title">ព័ត៌មានច្បាប់</div>`;
        if (start)       html += `<div class="perm-tip-row"><span class="perm-tip-lbl">ចាប់ពី</span><span>${escapeHtml(start)}</span></div>`;
        if (end)         html += `<div class="perm-tip-row"><span class="perm-tip-lbl">ដល់</span><span>${escapeHtml(end)}</span></div>`;
        if (days !== '') html += `<div class="perm-tip-row"><span class="perm-tip-lbl">សល់</span><span>${escapeHtml(String(days))} ថ្ងៃ</span></div>`;
        if (reason)      html += `<div class="perm-tip-row"><span class="perm-tip-lbl">មូលហេតុ</span><span>${escapeHtml(reason)}</span></div>`;

        tooltip.innerHTML = html;

        const rect = icon.getBoundingClientRect();
        const tw = 210;
        let left = rect.right + 8;
        if (left + tw > window.innerWidth - 8) left = rect.left - tw - 8;
        let top = rect.top - 4;
        if (top + 120 > window.innerHeight) top = window.innerHeight - 128;

        tooltip.style.left = left + 'px';
        tooltip.style.top  = top  + 'px';
        tooltip.style.display = 'block';
    });

    document.addEventListener('mouseout', e => {
        if (e.target.closest('.perm-icon')) tooltip.style.display = 'none';
    });

    document.addEventListener('click', e => {
        const icon = e.target.closest('.perm-icon');
        if (icon) e.stopPropagation();
    }, true);
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

    // Attendance list modal
    const _attListModal = document.getElementById('att-list-modal');
    document.getElementById('btn-show-att-list').addEventListener('click', showAttList);
    document.getElementById('btn-close-att-list').addEventListener('click', () => {
        _attListModal.style.display = 'none';
    });
    _attListModal.addEventListener('click', e => {
        const editBtn = e.target.closest('.att-list-edit-btn');
        if (editBtn) {
            e.stopPropagation();
            openPermModal(parseInt(editBtn.dataset.monkId), editBtn.dataset.monkName);
            return;
        }
        const nameBtn = e.target.closest('.att-name-btn');
        if (nameBtn) {
            e.stopPropagation();
            showMonkHistory(parseInt(nameBtn.dataset.monkId), nameBtn.dataset.monkName);
            return;
        }
        if (e.target === _attListModal) _attListModal.style.display = 'none';
    });

    // Monk history modal close
    const _mhModal = document.getElementById('monk-history-modal');
    document.getElementById('btn-close-mh').addEventListener('click', () => {
        _mhModal.style.display = 'none';
    });
    _mhModal.addEventListener('click', e => {
        if (e.target === _mhModal) _mhModal.style.display = 'none';
    });
    document.getElementById('btn-tg-att-list').addEventListener('click', async () => {
        const btn = document.getElementById('btn-tg-att-list');
        btn.disabled = true;
        btn.style.opacity = '0.5';
        try {
            // Clone the modal content so we can expand it to full height off-screen
            const source = document.querySelector('.att-list-modal-content');
            const clone  = source.cloneNode(true);

            // Remove all height / overflow constraints so full content renders
            Object.assign(clone.style, {
                position:  'fixed',
                top:       '-99999px',
                left:      '0',
                width:     source.offsetWidth + 'px',
                maxHeight: 'none',
                height:    'auto',
                overflow:  'visible',
                borderRadius: '0',
                boxShadow: 'none',
            });
            // Expand the body section inside the clone
            const cloneBody = clone.querySelector('.att-list-body');
            if (cloneBody) Object.assign(cloneBody.style, {
                overflow:  'visible',
                maxHeight: 'none',
                height:    'auto',
                flex:      'none',
            });

            // Hide UI-only elements that should not appear in the exported image
            clone.querySelectorAll('.att-list-edit-btn, .att-name-btn').forEach(el => {
                el.style.display = 'none';
            });

            document.body.appendChild(clone);

            const canvas = await html2canvas(clone, {
                scale:           2,
                useCORS:         true,
                backgroundColor: '#ffffff',
                logging:         false,
                width:           clone.offsetWidth,
                height:          clone.scrollHeight,
                windowWidth:     clone.offsetWidth,
            });

            document.body.removeChild(clone);

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const form = new FormData();
            form.append('image', blob, 'attendance.png');
            form.append('date', getActiveDate());
            const res  = await fetch('/api/attendance/submit-image', { method: 'POST', body: form });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            showToast('បានបញ្ជូនរូបភាព ទៅ Telegram ជោគជ័យ!', 'success');
        } catch (err) {
            showToast('មានបញ្ហា: ' + err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.style.opacity = '';
        }
    });

    initSearch();
    initPopover();
    initPermTooltip();
    scheduleNewDayReset();
    loadData();
    setInterval(pollSeatOrder, 5000); // sync seat order from DB every 5 s

    document.getElementById('btn-gen-bhikkhu')?.addEventListener('click', () => { generateBhikkhu(); saveGridConfig(); });
    document.getElementById('btn-gen-samanera')?.addEventListener('click', () => { generateSamanera(); saveGridConfig(); });
    document.getElementById('btn-submit-att').addEventListener('click', () => {
        const dd = document.getElementById('lay-export-dd');
        if (dd) dd.classList.remove('open');
        submitAttendance();
    });
    // Export dropdown
    const _layDd = document.getElementById('lay-export-dd');
    document.getElementById('btn-lay-export-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        _layDd.classList.toggle('open');
    });
    document.addEventListener('click', () => _layDd.classList.remove('open'));

    document.getElementById('btn-export-word').addEventListener('click', () => { _layDd.classList.remove('open'); exportWord(); });
    document.getElementById('btn-export-pdf').addEventListener('click',  () => { _layDd.classList.remove('open'); exportPdf(); });

    // Regenerate on Enter key
    document.getElementById('bhikkhu-rows')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('bhikkhu-cols')?.addEventListener('keydown',  e => { if (e.key === 'Enter') { generateBhikkhu();  saveGridConfig(); } });
    document.getElementById('samanera-rows')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });
    document.getElementById('samanera-cols')?.addEventListener('keydown', e => { if (e.key === 'Enter') { generateSamanera(); saveGridConfig(); } });
});