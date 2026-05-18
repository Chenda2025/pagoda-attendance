'use strict';

let allMonks      = [];
let _viewFiltered = [];
let _viewPage     = 1;
const VIEW_PAGE_SIZE = 20;

const _selectedIds = new Set();

const filters = {
    name: '',
    vassa_years: '',
    monk_type: '',
    residence: '',
    position: '',
    education_level: '',
    academic_year: '',
    sort_vassa: ''
};

const dropdownDefs = [
    { id: 'dd-vassa',     field: 'vassa_years',    allText: 'វស្សាទាំងអស់' },
    { id: 'dd-type',      field: 'monk_type',       allText: 'ប្រភេទទាំងអស់' },
    { id: 'dd-residence', field: 'residence',       allText: 'កុដិទាំងអស់' },
    { id: 'dd-position',  field: 'position',        allText: 'តួនាទីទាំងអស់' },
    { id: 'dd-education', field: 'education_level', allText: 'កម្រិតទាំងអស់' },
    { id: 'dd-year',      field: 'academic_year',   allText: 'ថ្នាក់ទាំងអស់' },
];

// ============ DATA LOADING ============

async function loadData() {
    try {
        const res = await fetch('/api/monks');
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        allMonks = json.monks;
        buildDropdownOptions();
        applyFilters();

        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('table-wrapper').style.display = 'block';
    } catch (err) {
        document.getElementById('loading-state').innerHTML =
            `<p style="color:#e74c3c">មានបញ្ហា: ${escapeHtml(err.message)}</p>`;
    }
}

// ============ SEARCHABLE DROPDOWNS ============

function buildDropdownOptions() {
    dropdownDefs.forEach(def => {
        const vals = [...new Set(allMonks.map(m => String(m[def.field])))].filter(Boolean);
        if (def.field === 'vassa_years') {
            vals.sort((a, b) => Number(a) - Number(b));
        } else {
            vals.sort((a, b) => a.localeCompare(b));
        }
        initDropdown(def.id, def.field, def.allText, vals);
    });
}

function initDropdown(containerId, field, allText, options) {
    const container = document.getElementById(containerId);

    const sortItemsHtml = field === 'vassa_years' ? `
        <li class="sd-item sd-sort-label">── តម្រៀបតាមវស្សា ──</li>
        <li class="sd-item sd-sort-item" data-sort="asc">↑ តូចទៅធំ</li>
        <li class="sd-item sd-sort-item" data-sort="desc">↓ ធំទៅតូច</li>
        <li class="sd-sort-sep"></li>
    ` : '';

    container.innerHTML = `
        <div class="sd-trigger">
            <span class="sd-current">${escapeHtml(allText)}</span>
            <svg class="sd-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
            </svg>
        </div>
        <div class="sd-panel">
            <input class="sd-search" type="text" placeholder="ស្វែងរក...">
            <ul class="sd-list">
                <li class="sd-item sd-all selected" data-value="">${escapeHtml(allText)}</li>
                ${sortItemsHtml}
                ${options.map(v => `<li class="sd-item" data-value="${escapeHtml(v)}">${escapeHtml(v)}</li>`).join('')}
            </ul>
        </div>
    `;

    container.dataset.field = field;
    container.dataset.allText = allText;

    container.querySelector('.sd-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(containerId);
    });

    const searchInput = container.querySelector('.sd-search');
    searchInput.addEventListener('input', () => filterDropdown(containerId));
    searchInput.addEventListener('click', (e) => e.stopPropagation());

    container.querySelector('.sd-list').addEventListener('click', (e) => {
        const item = e.target.closest('.sd-item');
        if (!item || item.classList.contains('sd-sort-label')) return;

        const sortDir = item.dataset.sort;
        const value   = item.dataset.value;

        container.querySelectorAll('.sd-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        container.classList.remove('open');
        searchInput.value = '';
        filterDropdown(containerId);

        if (sortDir !== undefined) {
            container.querySelector('.sd-current').textContent = item.textContent.trim();
            container.querySelector('.sd-current').classList.add('has-value');
            filters.sort_vassa = sortDir;
            filters[field] = '';
        } else {
            const label = value || allText;
            container.querySelector('.sd-current').textContent = label;
            container.querySelector('.sd-current').classList.toggle('has-value', !!value);
            if (field === 'vassa_years') filters.sort_vassa = '';
            filters[field] = value;
        }

        applyFilters();
    });
}

function toggleDropdown(id) {
    const container = document.getElementById(id);
    const isOpen = container.classList.contains('open');
    closeAllDropdowns();
    if (!isOpen) {
        container.classList.add('open');
        container.querySelector('.sd-search').focus();
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.searchable-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.querySelector('.sd-search').value = '';
        filterDropdown(d.id);
    });
}

function filterDropdown(id) {
    const container = document.getElementById(id);
    const query = container.querySelector('.sd-search').value.toLowerCase();
    container.querySelectorAll('.sd-item:not(.sd-all):not(.sd-sort-item):not(.sd-sort-label)').forEach(item => {
        item.style.display = item.textContent.toLowerCase().includes(query) ? '' : 'none';
    });
}

// ============ AUTOCOMPLETE ============

let autocompleteTimer = null;

function setupAutocomplete() {
    const input = document.getElementById('name-search');
    const list = document.getElementById('autocomplete-list');

    input.addEventListener('input', () => {
        clearTimeout(autocompleteTimer);
        const q = input.value.trim();
        filters.name = q;

        if (!q) { list.style.display = 'none'; applyFilters(); return; }

        autocompleteTimer = setTimeout(() => {
            const ql = q.toLowerCase();
            const matches = [...new Set(
                allMonks.filter(m => m.fullname.toLowerCase().includes(ql)).map(m => m.fullname)
            )].slice(0, 8);

            if (!matches.length) {
                list.style.display = 'none';
            } else {
                list.innerHTML = matches
                    .map(name => `<div class="autocomplete-item" data-name="${escapeHtml(name)}">${highlightMatch(name, q)}</div>`)
                    .join('');
                list.style.display = 'block';
            }
            applyFilters();
        }, 180);
    });

    list.addEventListener('click', (e) => {
        const item = e.target.closest('.autocomplete-item');
        if (!item) return;
        input.value = item.dataset.name;
        list.style.display = 'none';
        filters.name = item.dataset.name;
        applyFilters();
    });

    input.addEventListener('blur', () => setTimeout(() => { list.style.display = 'none'; }, 200));
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') list.style.display = 'none'; });
}

function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    try {
        const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escapeHtml(text).replace(re, '<mark>$1</mark>');
    } catch { return escapeHtml(text); }
}

// ============ FILTERING ============

function applyFilters() {
    let result = allMonks;
    if (filters.name) {
        const q = filters.name.toLowerCase();
        result = result.filter(m => m.fullname.toLowerCase().includes(q));
    }
    if (filters.vassa_years) result = result.filter(m => String(m.vassa_years) === filters.vassa_years);
    if (filters.monk_type)   result = result.filter(m => m.monk_type === filters.monk_type);
    if (filters.residence)   result = result.filter(m => m.residence === filters.residence);
    if (filters.position)    result = result.filter(m => m.position === filters.position);
    if (filters.education_level) result = result.filter(m => m.education_level === filters.education_level);
    if (filters.academic_year)   result = result.filter(m => m.academic_year === filters.academic_year);

    if (filters.sort_vassa === 'asc') {
        result = [...result].sort((a, b) => a.vassa_years - b.vassa_years);
    } else if (filters.sort_vassa === 'desc') {
        result = [...result].sort((a, b) => b.vassa_years - a.vassa_years);
    }

    _viewFiltered = result;
    _viewPage     = 1;
    renderTable();

    const total = allMonks.length;
    const shown = result.length;
    document.getElementById('result-count').textContent =
        shown === total
            ? `ចំនួនសរុប: ${total} នាក់`
            : `បង្ហាញ ${shown} នាក់ ក្នុងចំណោម ${total} នាក់`;
}

// ============ TABLE RENDER ============

function renderTable() {
    const monks  = _viewFiltered;
    const tbody  = document.getElementById('table-body');
    const noData = document.getElementById('no-data-state');

    if (!monks.length) {
        tbody.innerHTML = '';
        noData.style.display = 'flex';
        document.getElementById('view-pagination').innerHTML = '';
        return;
    }

    noData.style.display = 'none';

    const totalPages = Math.max(1, Math.ceil(monks.length / VIEW_PAGE_SIZE));
    _viewPage        = Math.min(_viewPage, totalPages);
    const start      = (_viewPage - 1) * VIEW_PAGE_SIZE;
    const pageMonks  = monks.slice(start, start + VIEW_PAGE_SIZE);

    tbody.innerHTML = pageMonks.map((m, i) => `
        <tr>
            <td class="col-check">
                <input type="checkbox" class="row-check" data-id="${m.id}"
                    ${_selectedIds.has(m.id) ? 'checked' : ''}>
            </td>
            <td class="col-num">${start + i + 1}</td>
            <td class="cell-name">${escapeHtml(m.fullname)}</td>
            <td class="col-center">${m.vassa_years}</td>
            <td><span class="badge ${m.monk_type === 'ភិក្ខុ' ? 'badge-bhikkhu' : 'badge-samanera'}">${escapeHtml(m.monk_type)}</span></td>
            <td>${escapeHtml(m.residence)}</td>
            <td>${escapeHtml(m.position)}</td>
            <td>${escapeHtml(m.education_level)}</td>
            <td class="col-center">${escapeHtml(m.academic_year)}</td>
            <td class="col-date">${formatDate(m.created_at)}</td>
            <td class="col-actions">
                <div class="row-actions">
                    <button class="btn-edit-row" data-id="${m.id}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                        កែប្រែ
                    </button>
                    <button class="btn-delete-row" data-id="${m.id}" data-name="${escapeHtml(m.fullname)}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                        </svg>
                        លុប
                    </button>
                </div>
            </td>
        </tr>
    `).join('');

    renderViewPagination(monks.length);
    _syncMasterCheckbox();
    _syncSelectionBar();
}

function renderViewPagination(total) {
    const el         = document.getElementById('view-pagination');
    const totalPages = Math.ceil(total / VIEW_PAGE_SIZE);
    if (totalPages <= 1) { el.innerHTML = ''; return; }

    const current = _viewPage;
    const from    = (current - 1) * VIEW_PAGE_SIZE + 1;
    const to      = Math.min(current * VIEW_PAGE_SIZE, total);

    const prev = `<button class="page-btn" onclick="goViewPage(${current - 1})"
        ${current === 1 ? 'disabled' : ''}>‹</button>`;
    const next = `<button class="page-btn" onclick="goViewPage(${current + 1})"
        ${current === totalPages ? 'disabled' : ''}>›</button>`;
    const nums = Array.from({ length: totalPages }, (_, p) =>
        `<button class="page-btn${p + 1 === current ? ' page-active' : ''}"
            onclick="goViewPage(${p + 1})">${p + 1}</button>`
    ).join('');

    el.innerHTML = `
        <div class="pagination">
            ${prev}${nums}${next}
            <span class="page-info">${from}–${to} / ${total} នាក់ · ទំព័រ ${current}/${totalPages}</span>
        </div>`;
}

function goViewPage(page) {
    _viewPage = page;
    renderTable();
    document.querySelector('.table-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ============ EXPORT ============

function exportData(fmt) {
    const params = new URLSearchParams({ fmt });
    if (filters.name)            params.set('name',            filters.name);
    if (filters.vassa_years)     params.set('vassa_years',     filters.vassa_years);
    if (filters.monk_type)       params.set('monk_type',       filters.monk_type);
    if (filters.residence)       params.set('residence',       filters.residence);
    if (filters.position)        params.set('position',        filters.position);
    if (filters.education_level) params.set('education_level', filters.education_level);
    if (filters.academic_year)   params.set('academic_year',   filters.academic_year);
    if (filters.sort_vassa)      params.set('sort_vassa',      filters.sort_vassa);
    document.getElementById('export-menu').classList.remove('open');
    window.location.href = `/api/monks/export?${params.toString()}`;
}

// ============ RESET FILTERS ============

function resetFilters() {
    document.getElementById('name-search').value = '';
    document.getElementById('autocomplete-list').style.display = 'none';
    filters.name = '';

    dropdownDefs.forEach(def => {
        const container = document.getElementById(def.id);
        container.querySelector('.sd-current').textContent = def.allText;
        container.querySelector('.sd-current').classList.remove('has-value');
        container.querySelectorAll('.sd-item').forEach(i => i.classList.remove('selected'));
        const allItem = container.querySelector('.sd-all');
        if (allItem) allItem.classList.add('selected');
        filters[def.field] = '';
    });

    filters.sort_vassa = '';
    applyFilters();
}

// ============ EDIT MODAL ============

function openEditModal(id) {
    const monk = allMonks.find(m => m.id === id);
    if (!monk) return;

    document.getElementById('edit-id').value = monk.id;
    document.getElementById('edit-fullname').value = monk.fullname;
    document.getElementById('edit-vassa').value = monk.vassa_years;
    document.getElementById('edit-type').value = monk.monk_type;
    document.getElementById('edit-residence').value = monk.residence;
    document.getElementById('edit-position').value = monk.position;
    document.getElementById('edit-education').value = monk.education_level;
    document.getElementById('edit-year').value = monk.academic_year;

    // Clear any previous error styling
    document.querySelectorAll('.modal-input, .modal-select').forEach(el => el.classList.remove('error'));

    document.getElementById('edit-modal').classList.add('active');
    document.getElementById('edit-fullname').focus();
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
}

async function handleEditSubmit(e) {
    e.preventDefault();

    const id = parseInt(document.getElementById('edit-id').value);
    const fullname = document.getElementById('edit-fullname').value.trim();
    const vassa = document.getElementById('edit-vassa').value.trim();
    const type = document.getElementById('edit-type').value;
    const residence = document.getElementById('edit-residence').value;
    const position = document.getElementById('edit-position').value;
    const education = document.getElementById('edit-education').value;
    const year = document.getElementById('edit-year').value;

    // Validate
    let hasError = false;
    [['edit-fullname', fullname], ['edit-vassa', vassa]].forEach(([elId, val]) => {
        const el = document.getElementById(elId);
        if (!val) { el.classList.add('error'); hasError = true; }
        else el.classList.remove('error');
    });
    if (hasError) return;

    const saveBtn = document.getElementById('edit-save-btn');
    const saveBtnText = document.getElementById('save-btn-text');
    saveBtn.disabled = true;
    saveBtnText.textContent = 'កំពុងរក្សាទុក...';

    try {
        const res = await fetch(`/api/monks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fullname,
                'total-monk': parseInt(vassa),
                type,
                home: residence,
                position,
                education_level: education,
                academic_level: year
            })
        });

        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        // Update local data
        const idx = allMonks.findIndex(m => m.id === id);
        if (idx !== -1) {
            allMonks[idx] = {
                ...allMonks[idx],
                fullname,
                vassa_years: parseInt(vassa),
                monk_type: type,
                residence,
                position,
                education_level: education,
                academic_year: year
            };
        }

        buildDropdownOptions();
        applyFilters();
        closeEditModal();
        showToast('ទិន្នន័យត្រូវបានកែប្រែជោគជ័យ!', 'success');

    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtnText.textContent = 'រក្សាទុក';
    }
}

// ============ DELETE MODAL ============

// ============ BULK SELECTION ============

function _syncMasterCheckbox() {
    const master   = document.getElementById('master-check-view');
    if (!master) return;
    const boxes    = document.querySelectorAll('.row-check');
    const checked  = document.querySelectorAll('.row-check:checked');
    master.indeterminate = checked.length > 0 && checked.length < boxes.length;
    master.checked       = boxes.length > 0 && checked.length === boxes.length;
}

function _syncSelectionBar() {
    const bar   = document.getElementById('selection-bar');
    const label = document.getElementById('selection-label');
    const count = _selectedIds.size;
    if (count > 0) {
        bar.style.display = 'flex';
        label.textContent = `${count} ជួរ​បាន​រើស`;
    } else {
        bar.style.display = 'none';
    }
}

async function executeBulkDelete() {
    const ids = Array.from(_selectedIds);
    if (!ids.length) return;

    if (!confirm(`លុប​ចោល ${ids.length} ជួរ​ដែល​បាន​រើស?`)) return;

    const btn = document.getElementById('btn-bulk-delete');
    btn.disabled = true;

    try {
        const res  = await fetch('/api/monks/bulk-delete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ids }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        allMonks = allMonks.filter(m => !_selectedIds.has(m.id));
        _selectedIds.clear();
        buildDropdownOptions();
        applyFilters();
        showToast(`លុប​ចោល ${json.count} ជួរ​ជោគ​ជ័យ!`, 'success');
    } catch (err) {
        showToast('មាន​បញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

let pendingDeleteId = null;

function openDeleteModal(id, name) {
    pendingDeleteId = id;
    document.getElementById('delete-msg').textContent = `តើអ្នកពិតជាចង់លុបទិន្នន័យ "${name}" មែនទេ?`;
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    pendingDeleteId = null;
    document.getElementById('delete-modal').classList.remove('active');
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = false;
    document.getElementById('delete-btn-text').textContent = 'លុបចេញ';
}

async function executeDelete() {
    if (!pendingDeleteId) return;

    const id = pendingDeleteId;
    const btn = document.getElementById('delete-confirm-btn');
    btn.disabled = true;
    document.getElementById('delete-btn-text').textContent = 'កំពុងលុប...';

    try {
        const res = await fetch(`/api/monks/${id}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);

        allMonks = allMonks.filter(m => m.id !== id);
        buildDropdownOptions();
        applyFilters();
        closeDeleteModal();
        showToast('ទិន្នន័យត្រូវបានលុបចោលជោគជ័យ!', 'success');

    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
        btn.disabled = false;
        document.getElementById('delete-btn-text').textContent = 'លុបចេញ';
    }
}

// ============ TOAST ============

let toastTimer = null;

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast toast-${type} visible`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// ============ UTILITIES ============

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ============ CHECK TRIGGER ============

function closeCheckModal() {
    document.getElementById('check-modal').classList.remove('active');
}

async function runCheckTrigger() {
    const btn = document.getElementById('check-trigger-btn');
    const body = document.getElementById('check-body');

    btn.classList.add('running');
    btn.disabled = true;

    // Show modal with spinner immediately
    body.innerHTML = `
        <div class="check-loading">
            <div class="spinner"></div>
            <span>កំពុងពិនិត្យ...</span>
        </div>`;
    document.getElementById('check-modal').classList.add('active');

    try {
        const res = await fetch('/api/check');
        const json = await res.json();

        if (!json.success) throw new Error(json.message);

        // Build trigger rows
        let triggerSection;
        if (json.triggers.length === 0) {
            triggerSection = `
                <div class="check-row check-warn">
                    <span class="check-icon">⚠</span>
                    <div class="check-row-text">
                        <span class="check-row-title">មិនមាន PostgreSQL Trigger</span>
                        <span class="check-row-sub">updated_at ត្រូវបានគ្រប់គ្រងដោយ Python code</span>
                    </div>
                </div>
                <button id="setup-trigger-btn" class="btn-setup-trigger">
                    ⚡ បង្កើត Trigger ឥឡូវ
                </button>`;
        } else {
            const tags = json.triggers.map(t => `
                <div class="check-row check-info">
                    <span class="check-icon">⚡</span>
                    <div class="check-row-text">
                        <span class="check-row-title">${escapeHtml(t.name)}</span>
                        <span class="check-row-sub">${escapeHtml(t.timing)} ${escapeHtml(t.event)} ON monk_tbl</span>
                    </div>
                </div>`).join('');
            triggerSection = tags;
        }

        body.innerHTML = `
            <div class="check-section">
                <div class="check-subtitle">ការតភ្ជាប់ & API</div>
                <div class="check-row check-ok">
                    <span class="check-icon">✓</span>
                    <div class="check-row-text">
                        <span class="check-row-title">Database ភ្ជាប់បានជោគជ័យ</span>
                        <span class="check-row-sub">pagoda_2026 — PostgreSQL</span>
                    </div>
                </div>
                <div class="check-row check-ok">
                    <span class="check-icon">✓</span>
                    <div class="check-row-text">
                        <span class="check-row-title">PUT /api/monks/:id — Update Trigger</span>
                        <span class="check-row-sub">ត្រៀមរួចរាល់</span>
                    </div>
                </div>
                <div class="check-row check-ok">
                    <span class="check-icon">✓</span>
                    <div class="check-row-text">
                        <span class="check-row-title">DELETE /api/monks/:id — Delete Trigger</span>
                        <span class="check-row-sub">ត្រៀមរួចរាល់</span>
                    </div>
                </div>
            </div>

            <div class="check-divider"></div>

            <div class="check-section">
                <div class="check-subtitle">ស្ថិតិទិន្នន័យ</div>
                <div class="check-stats">
                    <div class="check-stat-box">
                        <span class="check-stat-label">ចំនួនព្រះសង្ឃ</span>
                        <span class="check-stat-val">${json.total_records}</span>
                        <span class="check-stat-sub">នាក់</span>
                    </div>
                    <div class="check-stat-box">
                        <span class="check-stat-label">កែប្រែចុងក្រោយ</span>
                        <span class="check-stat-val" style="font-size:14px;padding-top:4px">
                            ${json.latest_updated_at ? formatDate(json.latest_updated_at) : '—'}
                        </span>
                        <span class="check-stat-sub">
                            ${json.latest_created_at ? 'បញ្ចូល ' + formatDate(json.latest_created_at) : 'មិនទាន់មានទិន្នន័យ'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="check-divider"></div>

            <div class="check-section">
                <div class="check-subtitle">PostgreSQL Triggers on monk_tbl</div>
                ${triggerSection}
            </div>
        `;

        const setupBtn = document.getElementById('setup-trigger-btn');
        if (setupBtn) {
            setupBtn.addEventListener('click', async () => {
                setupBtn.disabled = true;
                setupBtn.textContent = 'កំពុងបង្កើត...';
                try {
                    const r = await fetch('/api/setup-trigger', { method: 'POST' });
                    const j = await r.json();
                    if (!j.success) throw new Error(j.message);
                    showToast('Trigger បានបង្កើតជោគជ័យ!', 'success');
                    runCheckTrigger();
                } catch (ex) {
                    showToast('មានបញ្ហា: ' + ex.message, 'error');
                    setupBtn.disabled = false;
                    setupBtn.textContent = '⚡ បង្កើត Trigger ឥឡូវ';
                }
            });
        }

    } catch (err) {
        body.innerHTML = `
            <div class="check-section">
                <div class="check-row check-error">
                    <span class="check-icon">✗</span>
                    <div class="check-row-text">
                        <span class="check-row-title">មានបញ្ហា</span>
                        <span class="check-row-sub">${escapeHtml(err.message)}</span>
                    </div>
                </div>
            </div>`;
    } finally {
        btn.classList.remove('running');
        btn.disabled = false;
    }
}

// ============ GLOBAL EVENT LISTENERS ============

document.addEventListener('click', (e) => {
    if (!e.target.closest('.searchable-dropdown')) closeAllDropdowns();
    if (!e.target.closest('#export-dropdown'))
        document.getElementById('export-menu').classList.remove('open');
    if (e.target === document.getElementById('edit-modal')) closeEditModal();
    if (e.target === document.getElementById('delete-modal')) closeDeleteModal();
    if (e.target === document.getElementById('check-modal')) closeCheckModal();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeEditModal(); closeDeleteModal(); closeCheckModal(); }
});

// ============ INIT ============

document.addEventListener('DOMContentLoaded', () => {
    setupAutocomplete();
    loadData();

    // Edit form submit
    document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);

    // Edit modal close buttons
    document.getElementById('edit-close-btn').addEventListener('click', closeEditModal);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);

    // Delete modal buttons
    document.getElementById('delete-cancel-btn').addEventListener('click', closeDeleteModal);
    document.getElementById('delete-confirm-btn').addEventListener('click', executeDelete);

    // Export dropdown toggle
    document.getElementById('btn-export-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('export-menu').classList.toggle('open');
    });

    // Check modal buttons
    document.getElementById('check-close-btn').addEventListener('click', closeCheckModal);
    document.getElementById('check-trigger-btn').addEventListener('click', runCheckTrigger);

    // Bulk delete button
    document.getElementById('btn-bulk-delete').addEventListener('click', executeBulkDelete);

    // Master checkbox
    document.getElementById('master-check-view').addEventListener('change', (e) => {
        const pageIds = Array.from(document.querySelectorAll('.row-check'))
                             .map(cb => parseInt(cb.dataset.id));
        if (e.target.checked) {
            pageIds.forEach(id => _selectedIds.add(id));
        } else {
            pageIds.forEach(id => _selectedIds.delete(id));
        }
        document.querySelectorAll('.row-check').forEach(cb => {
            cb.checked = e.target.checked;
        });
        _syncSelectionBar();
    });

    // Table row action buttons — event delegation
    document.getElementById('table-body').addEventListener('click', (e) => {
        const editBtn   = e.target.closest('.btn-edit-row');
        const deleteBtn = e.target.closest('.btn-delete-row');
        const checkBox  = e.target.closest('.row-check');

        if (editBtn) {
            openEditModal(parseInt(editBtn.dataset.id));
        } else if (deleteBtn) {
            openDeleteModal(parseInt(deleteBtn.dataset.id), deleteBtn.dataset.name);
        } else if (checkBox) {
            const id = parseInt(checkBox.dataset.id);
            if (checkBox.checked) _selectedIds.add(id);
            else                  _selectedIds.delete(id);
            _syncMasterCheckbox();
            _syncSelectionBar();
        }
    });
});