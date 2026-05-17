'use strict';

const ABSENT_LIMIT = 2;
const PERM_LIMIT   = 3;

let allData     = [];
let _reportType = 'daily';

const PAGE_SIZE   = 20;
let _pages        = { bhikkhu: 1, samanera: 1 };
let _filteredData = { bhikkhus: [], samaneras: [] };

// ============ SEARCHABLE DROPDOWNS ============

const _rddState = {};

const _rddConfig = {
    'f-report-type': {
        allText: 'ប្រចាំថ្ងៃ',
        opts: [
            ['daily',     'ប្រចាំថ្ងៃ'],
            ['biweekly',  'ប្រចាំ ១៥ ថ្ងៃ'],
            ['monthly',   'ប្រចាំខែ'],
            ['annual',    'ប្រចាំឆ្នាំ'],
            ['triennial', 'ប្រចាំ ៣ ឆ្នាំ'],
        ]
    },
    'f-monk-type': {
        allText: 'ទាំងអស់',
        opts: [
            ['ភិក្ខុ',    'ភិក្ខុ'],
            ['សាមណេរ',   'សាមណេរ'],
        ]
    },
    'f-kuti': {
        allText: 'ទាំងអស់',
        opts: [
            ['កុដិលេខ១',            'កុដិលេខ១'],
            ['កុដិលេខ២_ជាន់ក្រោម', 'កុដិលេខ២ ជាន់ក្រោម'],
            ['កុដិលេខ២_ជាន់លើ',    'កុដិលេខ២ ជាន់លើ'],
            ['កុដិលេខ៤',            'កុដិលេខ៤'],
            ['កុដិធំ_ជាន់ទី១',      'កុដិធំ ជាន់ទី១'],
            ['កុដិធំ_ជាន់ទី២',      'កុដិធំ ជាន់ទី២'],
            ['កុដិធំ_ជាន់ទី៣',      'កុដិធំ ជាន់ទី៣'],
            ['កុដិហោត្រៃ',          'កុដិហោត្រៃ'],
            ['សាលាបាលីចាស់',       'កុដិសាលាបាលីចាស់'],
            ['សាលាពុទ្ធិក',         'សាលាពុទ្ធិក'],
        ]
    },
    'f-edu': {
        allText: 'ទាំងអស់',
        opts: [
            ['បឋមសិក្សា',    'បឋមសិក្សា'],
            ['អនុវិទ្យាល័យ', 'អនុវិទ្យាល័យ'],
            ['វិទ្យាល័យ',    'វិទ្យាល័យ'],
            ['មហាវិទ្យា',    'មហាវិទ្យាល័យ'],
        ]
    },
    'f-acad': {
        allText: 'ទាំងអស់',
        opts: [
            ['ឆ្នាំទី១', 'ឆ្នាំទី ១'],
            ['ឆ្នាំទី២', 'ឆ្នាំទី ២'],
            ['ឆ្នាំទី៣', 'ឆ្នាំទី ៣'],
            ['ឆ្នាំទី៤', 'ឆ្នាំទី ៤'],
        ]
    },
    'f-violation': {
        allText: 'ទាំងអស់',
        opts: [
            ['violations', 'លើសដែនតែប៉ុណ្ណោះ'],
            ['absent',     'លើសអវត្តមាន'],
            ['permission', 'លើសច្បាប់'],
        ]
    },
};

function initRptDropdowns() {
    Object.entries(_rddConfig).forEach(([id, cfg]) => {
        const el = document.getElementById(id);
        if (!el) return;

        _rddState[id] = '';

        el.innerHTML = `
            <div class="rpt-trigger">
                <span class="rpt-current">${escHtml(cfg.allText)}</span>
                <svg class="rpt-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </div>
            <div class="rpt-panel">
                <input class="rpt-search" type="text" placeholder="ស្វែងរក...">
                <ul class="rpt-list">
                    <li class="rpt-item rpt-all selected" data-value="">${escHtml(cfg.allText)}</li>
                    ${cfg.opts.map(([v, l]) =>
                        `<li class="rpt-item" data-value="${escHtml(v)}">${escHtml(l)}</li>`
                    ).join('')}
                </ul>
            </div>
        `;

        const trigger     = el.querySelector('.rpt-trigger');
        const panel       = el.querySelector('.rpt-panel');
        const searchInput = el.querySelector('.rpt-search');
        const list        = el.querySelector('.rpt-list');

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = el.classList.contains('open');
            closeAllRptDropdowns();
            if (!isOpen) {
                el.classList.add('open');
                searchInput.focus();
            }
        });

        searchInput.addEventListener('input', () => {
            const q = searchInput.value.toLowerCase();
            list.querySelectorAll('.rpt-item:not(.rpt-all)').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(q) ? '' : 'none';
            });
        });
        searchInput.addEventListener('click', (e) => e.stopPropagation());

        list.addEventListener('click', (e) => {
            const item = e.target.closest('.rpt-item');
            if (!item) return;

            const value = item.dataset.value;
            const label = value
                ? (cfg.opts.find(o => o[0] === value)?.[1] || value)
                : cfg.allText;

            list.querySelectorAll('.rpt-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');

            const current = el.querySelector('.rpt-current');
            current.textContent = label;
            current.classList.toggle('rpt-has-value', !!value);

            searchInput.value = '';
            list.querySelectorAll('.rpt-item:not(.rpt-all)').forEach(i => { i.style.display = ''; });
            el.classList.remove('open');

            _rddState[id] = value;

            if (id === 'f-violation') {
                if (allData.length) renderReport(allData, value || 'all');
            } else {
                loadReport();
            }
        });
    });
}

function getRdd(id) {
    return _rddState[id] || '';
}

function resetAllRdd() {
    Object.entries(_rddConfig).forEach(([id, cfg]) => {
        const el = document.getElementById(id);
        if (!el) return;
        _rddState[id] = '';
        el.querySelectorAll('.rpt-item').forEach(i => i.classList.remove('selected'));
        const allItem = el.querySelector('.rpt-all');
        if (allItem) allItem.classList.add('selected');
        const current = el.querySelector('.rpt-current');
        if (current) {
            current.textContent = cfg.allText;
            current.classList.remove('rpt-has-value');
        }
        const search = el.querySelector('.rpt-search');
        if (search) {
            search.value = '';
            el.querySelectorAll('.rpt-item:not(.rpt-all)').forEach(i => { i.style.display = ''; });
        }
        el.classList.remove('open');
    });
}

function closeAllRptDropdowns() {
    document.querySelectorAll('.rpt-dropdown.open').forEach(d => d.classList.remove('open'));
}

// ============ FILTER HELPERS ============

function getFilters() {
    return {
        date:            document.getElementById('f-date').value      || todayISO(),
        monk_type:       getRdd('f-monk-type'),
        kuti:            getRdd('f-kuti'),
        education_level: getRdd('f-edu'),
        academic_year:   getRdd('f-acad'),
        name:            document.getElementById('f-name').value.trim() || '',
        violation:       getRdd('f-violation') || 'all',
    };
}

function buildQueryString(filters) {
    const p = new URLSearchParams();
    if (filters.date)            p.set('date',            filters.date);
    if (filters.monk_type)       p.set('monk_type',       filters.monk_type);
    if (filters.kuti)            p.set('kuti',            filters.kuti);
    if (filters.education_level) p.set('education_level', filters.education_level);
    if (filters.academic_year)   p.set('academic_year',   filters.academic_year);
    if (filters.name)            p.set('name',            filters.name);
    return p.toString();
}

// ============ LOAD ============

function _updateBanner(start, end, label) {
    const banner = document.getElementById('date-range-banner');
    banner.innerHTML = `📅 ចន្លោះ: <strong>${fmtDate(start)}</strong> — <strong>${fmtDate(end)}</strong> &nbsp;|&nbsp; ${label}`;
    banner.style.display = 'flex';
}

function _normalizeMonks(monks, type, json) {
    if (type === 'daily') {
        return monks.map(m => ({
            ...m,
            absent_count:     m.status === 'absent'     ? 1 : 0,
            permission_count: m.status === 'permission' ? 1 : 0,
            absent_dates:     m.status === 'absent'     ? fmtDate(json.date) : '',
            perm_dates:       m.status === 'permission' ? fmtDate(json.date) : '',
        }));
    }
    return monks.map(m => ({
        ...m,
        absent_count:     m.total_absences,
        permission_count: m.total_permissions,
        absent_dates:     '',
        perm_dates:       m.range_start ? `${fmtDate(m.range_start)} → ${fmtDate(m.range_end)}` : '',
    }));
}

const _THEAD = {
    biweekly:
        '<th>#</th><th>ឈ្មោះ</th><th>តួនាទី</th><th>វស្សា</th>' +
        '<th>ស្នាក់នៅ</th><th>ការសិក្សា</th>' +
        '<th>❌ អវត្តមាន</th><th>📋 ច្បាប់</th><th>ថ្ងៃ</th><th>ស្ថានភាព</th><th class="col-actions-r">សកម្មភាព</th>',
    daily:
        '<th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th><th>វស្សា</th>' +
        '<th>ស្នាក់នៅ</th><th>ស្ថានភាព</th>',
    summary:
        '<th>#</th><th>ឈ្មោះ</th><th>ប្រភេទ</th><th>តួនាទី</th><th>វស្សា</th>' +
        '<th>❌ អវត្តមាន</th><th>📋 ច្បាប់</th><th>ចន្លោះ</th><th>ស្ថានភាព</th>',
};

function _updateThead(type) {
    const cols = type === 'biweekly' ? _THEAD.biweekly
               : type === 'daily'   ? _THEAD.daily
               : _THEAD.summary;
    ['thead-bhikkhu', 'thead-samanera'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<tr>${cols}</tr>`;
    });
}

async function loadReport() {
    const filters = getFilters();
    _reportType   = getRdd('f-report-type') || 'daily';

    showLoading(true);
    document.getElementById('report-content').style.display = 'none';
    document.getElementById('empty-state').style.display    = 'none';

    try {
        let json;
        const d = new Date(filters.date || todayISO());

        if (_reportType === 'daily') {
            const res = await fetch(`/api/attendance/daily-report?date=${filters.date || todayISO()}`);
            json = await res.json();
            if (!json.success) throw new Error(json.message);
            allData = _normalizeMonks(json.records, 'daily', json);
            _updateBanner(json.date, json.date, 'ប្រចាំថ្ងៃ');

        } else if (_reportType === 'monthly') {
            const res = await fetch(`/api/reports/monthly?year=${d.getFullYear()}&month=${d.getMonth() + 1}`);
            json = await res.json();
            if (!json.success) throw new Error(json.message);
            allData = _normalizeMonks(json.monks, 'monthly', json);
            _updateBanner(json.period_start, json.period_end, 'ប្រចាំខែ');

        } else if (_reportType === 'annual') {
            const res = await fetch(`/api/reports/annual?year=${d.getFullYear()}`);
            json = await res.json();
            if (!json.success) throw new Error(json.message);
            allData = _normalizeMonks(json.monks, 'annual', json);
            _updateBanner(json.period_start, json.period_end, 'ប្រចាំឆ្នាំ');

        } else if (_reportType === 'triennial') {
            const res = await fetch(`/api/reports/triennial?start_year=${d.getFullYear() - 2}`);
            json = await res.json();
            if (!json.success) throw new Error(json.message);
            allData = _normalizeMonks(json.monks, 'triennial', json);
            _updateBanner(json.period_start, json.period_end, 'ប្រចាំ ៣ ឆ្នាំ');

        } else {
            const res = await fetch(`/api/attendance/report?${buildQueryString(filters)}`);
            json = await res.json();
            if (!json.success) throw new Error(json.message);
            allData = json.monks;
            _updateBanner(json.start_date, json.end_date, '១៥ ថ្ងៃ');
        }

        if (!allData.length) {
            document.getElementById('empty-state').style.display = 'block';
            return;
        }

        renderReport(allData, filters.violation);
    } catch (err) {
        document.getElementById('empty-state').style.display = 'block';
        document.getElementById('empty-msg').textContent = 'មានបញ្ហា: ' + err.message;
    } finally {
        showLoading(false);
    }
}

// ============ RENDER ============

function renderReport(monks, violationFilter) {
    const filtered  = applyViolationFilter(monks, violationFilter);
    const bhikkhus  = filtered.filter(m => m.monk_type === 'ភិក្ខុ');
    const samaneras = filtered.filter(m => m.monk_type === 'សាមណេរ');

    _pages.bhikkhu  = 1;
    _pages.samanera = 1;
    _filteredData   = { bhikkhus, samaneras };

    _drawSections(bhikkhus, samaneras, monks);
}

function _drawSections(bhikkhus, samaneras, summaryMonks) {
    _updateThead(_reportType);
    renderSection('tbody-bhikkhu',  'count-bhikkhu',  'pagin-bhikkhu',  bhikkhus,  'bhikkhu');
    renderSection('tbody-samanera', 'count-samanera', 'pagin-samanera', samaneras, 'samanera');
    if (summaryMonks) renderSummary(summaryMonks);

    document.getElementById('section-bhikkhu').style.display  = bhikkhus.length  ? '' : 'none';
    document.getElementById('section-samanera').style.display = samaneras.length ? '' : 'none';
    document.getElementById('report-content').style.display   = 'block';
    document.getElementById('empty-state').style.display      =
        (bhikkhus.length + samaneras.length) ? 'none' : 'block';
}

function goPage(section, page) {
    _pages[section] = page;
    const monks = section === 'bhikkhu' ? _filteredData.bhikkhus : _filteredData.samaneras;
    renderSection(`tbody-${section}`, `count-${section}`, `pagin-${section}`, monks, section);
    document.getElementById(`section-${section}`)
            .scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function applyViolationFilter(monks, filter) {
    if (filter === 'violations') return monks.filter(m => isAbsViol(m) || isPrmViol(m));
    if (filter === 'absent')     return monks.filter(m => isAbsViol(m));
    if (filter === 'permission') return monks.filter(m => isPrmViol(m));
    return monks;
}

function renderSection(tbodyId, countId, paginId, monks, section) {
    document.getElementById(countId).textContent = monks.length ? `(${monks.length} នាក់)` : '';

    const totalPages    = Math.max(1, Math.ceil(monks.length / PAGE_SIZE));
    const page          = Math.min(_pages[section], totalPages);
    _pages[section]     = page;
    const start         = (page - 1) * PAGE_SIZE;
    const pageMonks     = monks.slice(start, start + PAGE_SIZE);

    const tbody = document.getElementById(tbodyId);
    if (!monks.length) {
        tbody.innerHTML = `<tr><td colspan="11" class="empty-row">មិនមានទិន្នន័យ</td></tr>`;
        document.getElementById(paginId).innerHTML = '';
        return;
    }

    tbody.innerHTML = pageMonks.map((m, i) => {
        const abViol = isAbsViol(m);
        const prViol = isPrmViol(m);
        const rowCls = abViol ? 'row-absent-viol' : (prViol ? 'row-perm-viol' : '');
        const badge  = abViol
            ? `<span class="badge badge-danger">⚠ លើសអវត្តមាន</span>`
            : prViol
                ? `<span class="badge badge-warning">⚠ លើសច្បាប់</span>`
                : `<span class="badge badge-ok">✓ ប្រក្រតី</span>`;
        const edu = [m.education_level, m.academic_year].filter(Boolean).join(' — ');
        const num = `<td class="col-num">${start + i + 1}</td>`;
        const name = `<td><div class="monk-name">${escHtml(m.fullname)}</div></td>`;

        if (_reportType === 'daily') {
            const statusBadge = m.absent_count
                ? `<span class="badge badge-danger">❌ អវត្តមាន</span>`
                : `<span class="badge badge-warning">📋 ច្បាប់</span>`;
            return `<tr class="${rowCls}">
                ${num}${name}
                <td class="col-center">${escHtml(m.monk_type)}</td>
                <td class="col-pos">${escHtml(m.position)}</td>
                <td class="col-center">${m.vassa_years} ឆ្នាំ</td>
                <td class="col-kuti">${escHtml(m.residence)}</td>
                <td>${statusBadge}</td>
            </tr>`;
        }

        if (_reportType === 'monthly' || _reportType === 'annual' || _reportType === 'triennial') {
            const rangeHtml = m.perm_dates
                ? `<span class="date-perm" style="font-size:10px">${escHtml(m.perm_dates)}</span>`
                : '—';
            return `<tr class="${rowCls}">
                ${num}${name}
                <td class="col-center">${escHtml(m.monk_type)}</td>
                <td class="col-pos">${escHtml(m.position)}</td>
                <td class="col-center">${m.vassa_years} ឆ្នាំ</td>
                <td class="col-center col-absent" style="${abViol?'color:#c53030;font-weight:700':''}">${m.absent_count     || '—'}</td>
                <td class="col-center col-perm"   style="${prViol?'color:#c05621;font-weight:700':''}">${m.permission_count || '—'}</td>
                <td class="col-dates">${rangeHtml}</td>
                <td>${badge}</td>
            </tr>`;
        }

        // biweekly (default)
        const dateParts = [];
        if (m.absent_dates) dateParts.push(`<span class="date-absent">❌ ${escHtml(m.absent_dates)}</span>`);
        if (m.perm_dates)   dateParts.push(`<span class="date-perm">📋 ${escHtml(m.perm_dates)}</span>`);
        const datesHtml = dateParts.length ? dateParts.join('<br>') : '—';

        return `
            <tr class="${rowCls}">
                ${num}${name}
                <td class="col-pos">${escHtml(m.position)}</td>
                <td class="col-center">${m.vassa_years} ឆ្នាំ</td>
                <td class="col-kuti">${escHtml(m.residence)}</td>
                <td class="col-edu">${escHtml(edu)}</td>
                <td class="col-center col-absent">${m.absent_count     || '—'}</td>
                <td class="col-center col-perm"  >${m.permission_count || '—'}</td>
                <td class="col-dates">${datesHtml}</td>
                <td>${badge}</td>
                <td class="col-actions-r">
                    <div class="r-row-actions">
                        <button class="btn-r-edit" data-id="${m.id}" data-name="${escHtml(m.fullname)}" title="កែប្រែវត្តមាន">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            វត្តមាន
                        </button>
                        <button class="btn-r-del" data-id="${m.id}" data-name="${escHtml(m.fullname)}" title="លុប">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                                stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            </svg>
                            លុប
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');

    renderPagination(paginId, monks.length, page, section);
}

function renderPagination(containerId, total, current, section) {
    const el         = document.getElementById(containerId);
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    const from = (current - 1) * PAGE_SIZE + 1;
    const to   = Math.min(current * PAGE_SIZE, total);

    const prev = `<button class="page-btn" onclick="goPage('${section}',${current - 1})"
        ${current === 1 ? 'disabled' : ''}>‹</button>`;
    const next = `<button class="page-btn" onclick="goPage('${section}',${current + 1})"
        ${current === totalPages ? 'disabled' : ''}>›</button>`;
    const nums = Array.from({ length: totalPages }, (_, p) =>
        `<button class="page-btn${p + 1 === current ? ' page-active' : ''}"
            onclick="goPage('${section}',${p + 1})">${p + 1}</button>`
    ).join('');

    el.innerHTML = `
        <div class="pagination">
            ${prev}${nums}${next}
            <span class="page-info">${from}–${to} / ${total} នាក់ · ទំព័រ ${current}/${totalPages}</span>
        </div>`;
}

function renderSummary(monks) {
    const abViol = monks.filter(m => isAbsViol(m)).length;
    const prViol = monks.filter(m => isPrmViol(m)).length;
    const clean  = monks.filter(m => !isAbsViol(m) && !isPrmViol(m)).length;
    document.getElementById('sum-total').textContent       = monks.length;
    document.getElementById('sum-absent-viol').textContent = abViol;
    document.getElementById('sum-perm-viol').textContent   = prViol;
    document.getElementById('sum-clean').textContent       = clean;
}

// ============ EXPORT ============

async function exportReport(action, fmt = 'docx') {
    const type    = _reportType;
    const filters = getFilters();
    const isPdf   = fmt === 'pdf';
    const isTg    = action === 'telegram' || action === 'telegram-both';

    let btn;
    if (isTg)       btn = document.getElementById('btn-send-tg');
    else if (isPdf) btn = document.getElementById('btn-export-pdf');
    else            btn = document.getElementById('btn-export-docx');

    const origHTML = btn.innerHTML;
    btn.disabled    = true;
    btn.textContent = isTg ? 'កំពុងបញ្ជូន...' : 'កំពុងបង្កើត...';

    const date = filters.date || todayISO();
    const d    = new Date(date);
    const p    = new URLSearchParams({ type, fmt, action, date });

    if (type === 'biweekly') {
        p.set('monk_type',       filters.monk_type);
        p.set('kuti',            filters.kuti);
        p.set('education_level', filters.education_level);
        p.set('academic_year',   filters.academic_year);
        p.set('name',            filters.name);
    } else if (type === 'annual') {
        p.set('year', d.getFullYear());
    } else if (type === 'monthly') {
        p.set('year',  d.getFullYear());
        p.set('month', d.getMonth() + 1);
    } else if (type === 'triennial') {
        p.set('start_year', d.getFullYear() - 2);
    }

    try {
        const res = await fetch(`/api/reports/export?${p}`);
        if (!isTg) {
            if (!res.ok) { const j = await res.json(); throw new Error(j.message); }
            const blob = await res.blob();
            const ext  = isPdf ? 'pdf' : 'docx';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `report_${type}_${date}.${ext}`;
            a.click();
            URL.revokeObjectURL(a.href);
            showToast(isPdf ? 'ឯកសារ PDF បានដំណើរការ!' : 'ឯកសារ Word បានដំណើរការ!', 'success');
        } else {
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            showToast(`បានបញ្ជូន ${json.total} នាក់ ទៅ Telegram!`, 'success');
        }
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled  = false;
        btn.innerHTML = origHTML;
    }
}

// ============ ATTENDANCE MODAL ============

let _attendMonkId = null;
let _attendRange  = { start: '', end: '' };

function _computeStart(endISO) {
    const d = new Date(endISO);
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
}

function openAttendModal(id, name) {
    _attendMonkId = id;
    const endDate   = document.getElementById('f-date').value || todayISO();
    const startDate = _computeStart(endDate);
    _attendRange    = { start: startDate, end: endDate };

    document.getElementById('r-attend-title').textContent = `វត្តមាន — ${name}`;
    const addDate = document.getElementById('r-add-date');
    addDate.value = endDate;
    addDate.max   = endDate;
    addDate.min   = startDate;

    document.getElementById('r-attend-modal').classList.add('active');
    loadAttendRecords();
}

function closeAttendModal() {
    _attendMonkId = null;
    document.getElementById('r-attend-modal').classList.remove('active');
}

async function loadAttendRecords() {
    const list    = document.getElementById('r-attend-list');
    const loading = document.getElementById('r-attend-loading');
    loading.style.display = 'flex';
    list.innerHTML = '';

    try {
        const res  = await fetch(
            `/api/attendance/monk/${_attendMonkId}?start=${_attendRange.start}&end=${_attendRange.end}`
        );
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        renderAttendList(json.records);
    } catch (err) {
        list.innerHTML = `<div class="r-attend-empty r-attend-error">មានបញ្ហា: ${escHtml(err.message)}</div>`;
    } finally {
        loading.style.display = 'none';
    }
}

function renderAttendList(records) {
    const list = document.getElementById('r-attend-list');
    if (!records.length) {
        list.innerHTML = `<div class="r-attend-empty">មិនមានកំណត់ត្រាអវត្តមានក្នុងចន្លោះ ១៥ ថ្ងៃនេះទេ</div>`;
        return;
    }
    list.innerHTML = records.map(r => {
        const [y, mo, d] = r.date.split('-');
        const fmtD    = `${d}/${mo}/${y}`;
        const isAbs   = r.status === 'absent';
        const badge   = isAbs
            ? `<span class="r-attend-badge r-badge-absent">❌ អវត្តមាន</span>`
            : `<span class="r-attend-badge r-badge-perm">📋 ច្បាប់</span>`;
        const toggleSt  = isAbs ? 'permission' : 'absent';
        const toggleLbl = isAbs ? '📋 ប្ដូរជាច្បាប់' : '❌ ប្ដូរជាអវត្តមាន';
        return `
            <div class="r-attend-row">
                <span class="r-attend-date">${fmtD}</span>
                ${badge}
                <div class="r-attend-btns">
                    <button class="btn-at-toggle" data-date="${r.date}" data-status="${toggleSt}">${toggleLbl}</button>
                    <button class="btn-at-remove" data-date="${r.date}">🗑 លុប</button>
                </div>
            </div>`;
    }).join('');
}

async function _refreshReport() {
    try {
        const res  = await fetch(`/api/attendance/report?${buildQueryString(getFilters())}`);
        const json = await res.json();
        if (json.success) {
            allData = json.monks;
            renderReport(allData, getFilters().violation);
        }
    } catch (_) {}
}

async function addAttendRecord() {
    const date   = document.getElementById('r-add-date').value;
    const status = document.getElementById('r-add-status').value;
    if (!date) { showToast('សូមជ្រើសរើសកាលបរិច្ឆេទ!', 'error'); return; }

    const btn = document.getElementById('r-attend-add-btn');
    btn.disabled    = true;
    btn.textContent = 'កំពុងបន្ថែម...';

    try {
        const res  = await fetch('/api/attendance', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ monk_id: _attendMonkId, status, date })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        await loadAttendRecords();
        _refreshReport();
        showToast('បានបន្ថែមជោគជ័យ!', 'success');
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled    = false;
        btn.textContent = '+ បន្ថែម';
    }
}

async function toggleAttendRecord(date, newStatus) {
    try {
        const res  = await fetch('/api/attendance', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ monk_id: _attendMonkId, status: newStatus, date })
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        await loadAttendRecords();
        _refreshReport();
        showToast('បានផ្លាស់ប្ដូរជោគជ័យ!', 'success');
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

async function removeAttendRecord(date) {
    try {
        const res  = await fetch(`/api/attendance/${_attendMonkId}?date=${date}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        await loadAttendRecords();
        _refreshReport();
        showToast('បានលុបជោគជ័យ!', 'success');
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

// ============ DELETE MODAL ============

let _pendingDeleteId = null;

function openDeleteModal(id, name) {
    _pendingDeleteId = id;
    document.getElementById('r-delete-msg').textContent =
        `តើអ្នកពិតជាចង់លុបទិន្នន័យ "${name}" មែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`;
    document.getElementById('r-delete-modal').classList.add('active');
}

function closeDeleteModal() {
    _pendingDeleteId = null;
    document.getElementById('r-delete-modal').classList.remove('active');
    document.getElementById('r-delete-confirm').disabled = false;
    document.getElementById('r-delete-text').textContent = 'លុបចេញ';
}

async function executeDelete() {
    if (!_pendingDeleteId) return;
    const id  = _pendingDeleteId;
    const btn = document.getElementById('r-delete-confirm');
    btn.disabled = true;
    document.getElementById('r-delete-text').textContent = 'កំពុងលុប...';

    try {
        const res  = await fetch(`/api/monks/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        allData = allData.filter(m => m.id !== id);
        closeDeleteModal();
        renderReport(allData, getFilters().violation);
        showToast('ទិន្នន័យត្រូវបានលុបចោលជោគជ័យ!', 'success');

    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
        btn.disabled = false;
        document.getElementById('r-delete-text').textContent = 'លុបចេញ';
    }
}

// ============ UTILITIES ============

function isAbsViol(m) { return m.absent_count     >= ABSENT_LIMIT; }
function isPrmViol(m) { return m.permission_count >= PERM_LIMIT;   }

function fmtDate(iso) {
    const [y, mo, d] = iso.split('-');
    return `${d}/${mo}/${y}`;
}

function escHtml(s) {
    return String(s || '')
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function todayISO() { return new Date().toISOString().slice(0, 10); }

function showLoading(on) {
    document.getElementById('loading-state').style.display = on ? 'flex' : 'none';
}

let _toastTimer;
function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `report-toast report-toast-${type} visible`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('visible'), 3200);
}

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('f-date');
    datePicker.value = todayISO();
    datePicker.max   = todayISO();

    initRptDropdowns();
    loadReport();

    document.getElementById('btn-generate').addEventListener('click', loadReport);

    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        resetAllRdd();
        document.getElementById('f-name').value = '';
        datePicker.value = todayISO();
        loadReport();
    });

    // Date auto-submit
    datePicker.addEventListener('change', loadReport);

    // Name search: debounce 380 ms
    let _nameTimer;
    document.getElementById('f-name').addEventListener('input', () => {
        clearTimeout(_nameTimer);
        _nameTimer = setTimeout(loadReport, 380);
    });

    // Export dropdown toggle
    const _expDd  = document.getElementById('rpt-export-dropdown');
    const _expBtn = document.getElementById('btn-rpt-export-trigger');
    _expBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        _expDd.classList.toggle('open');
    });

    document.getElementById('btn-export-pdf').addEventListener('click',  () => { _expDd.classList.remove('open'); exportReport('download', 'pdf'); });
    document.getElementById('btn-export-docx').addEventListener('click', () => { _expDd.classList.remove('open'); exportReport('download', 'docx'); });
    document.getElementById('btn-send-tg').addEventListener('click',     () => exportReport('telegram-both', 'docx'));

    // Attend modal wiring
    document.getElementById('r-attend-close').addEventListener('click', closeAttendModal);
    document.getElementById('r-attend-add-btn').addEventListener('click', addAttendRecord);

    // Delete modal wiring
    document.getElementById('r-delete-cancel').addEventListener('click',  closeDeleteModal);
    document.getElementById('r-delete-confirm').addEventListener('click', executeDelete);

    // Table row buttons — event delegation on document (tbodies are re-rendered)
    document.addEventListener('click', (e) => {
        const editBtn   = e.target.closest('.btn-r-edit');
        const delBtn    = e.target.closest('.btn-r-del');
        const toggleBtn = e.target.closest('.btn-at-toggle');
        const removeBtn = e.target.closest('.btn-at-remove');

        if (editBtn)   { openAttendModal(parseInt(editBtn.dataset.id), editBtn.dataset.name); return; }
        if (delBtn)    { openDeleteModal(parseInt(delBtn.dataset.id), delBtn.dataset.name); return; }
        if (toggleBtn) { toggleAttendRecord(toggleBtn.dataset.date, toggleBtn.dataset.status); return; }
        if (removeBtn) { removeAttendRecord(removeBtn.dataset.date); return; }

        // Close modals on backdrop click
        if (e.target === document.getElementById('r-attend-modal')) closeAttendModal();
        if (e.target === document.getElementById('r-delete-modal')) closeDeleteModal();

        // Close dropdowns when clicking outside
        if (!e.target.closest('.rpt-dropdown')) closeAllRptDropdowns();
        if (!e.target.closest('.rpt-export-dropdown')) document.getElementById('rpt-export-dropdown').classList.remove('open');
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeAttendModal(); closeDeleteModal(); }
    });
});
