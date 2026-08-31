'use strict';

const DEFAULT_GRID = { br: 3, bc: 5, sr: 12, sc: 10 };

const BHIKKHU_RANK = {
    'ព្រះអធិការ': 1,
    'ព្រះគ្រូសូត្រស្តាំ': 2,
    'ព្រះគ្រូសូត្រឆ្វេង': 3,
    'ព្រះគ្រូវិន័យធរ': 4,
    'ព្រះគ្រូលេខា': 5,
    'មេក្រុម': 6,
    'ព្រះគ្រូប្រធានការក': 7,
    'មេកុដិ': 8,
    'អនុកុដិ': 9,
    'អនុមេក្រុម': 10,
    'ព្រះគ្រូអនុប្រធានការកទី១': 10,
    'ព្រះគ្រូអនុប្រធានការកទី២': 10,
    'ព្រះសង្ឃធម្មតា': 11,
    'សមណសិស្ស': 11,
};
const BHIKKHU_CHIEF_POSITION = 'ព្រះអធិការ';
const SAMANERA_ADMIN_RANK = { 'មេកុដិ': 1, 'អនុកុដិ': 2 };

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function clampGrid(n, fallback) {
    const v = parseInt(n, 10);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(1, Math.min(30, v));
}

let layouts = [];
let activeId = null;
let modalMode = 'create';
let allMonks = [];
let activeGridConfig = { ...DEFAULT_GRID };
let modalSelectedIds = new Set();
let modalPickHighlight = -1;

function sortBhikkhus(monks) {
    return [...monks].sort((a, b) => {
        const ra = BHIKKHU_RANK[a.position] ?? 99;
        const rb = BHIKKHU_RANK[b.position] ?? 99;
        if (ra !== rb) return ra - rb;
        return b.vassa_years - a.vassa_years;
    });
}

function sortSamaneras(monks) {
    return [...monks].sort((a, b) => {
        const ra = SAMANERA_ADMIN_RANK[a.position] ?? 99;
        const rb = SAMANERA_ADMIN_RANK[b.position] ?? 99;
        if (ra !== rb) return ra - rb;
        if (b.vassa_years !== a.vassa_years) return b.vassa_years - a.vassa_years;
        return a.fullname.localeCompare(b.fullname);
    });
}

function readGridFromDetail() {
    const hasInputs = document.getElementById('alt-bhikkhu-rows');
    if (!hasInputs) return { ...activeGridConfig };
    return {
        br: clampGrid(document.getElementById('alt-bhikkhu-rows')?.value, DEFAULT_GRID.br),
        bc: clampGrid(document.getElementById('alt-bhikkhu-cols')?.value, DEFAULT_GRID.bc),
        sr: clampGrid(document.getElementById('alt-samanera-rows')?.value, DEFAULT_GRID.sr),
        sc: clampGrid(document.getElementById('alt-samanera-cols')?.value, DEFAULT_GRID.sc),
    };
}

function readGridFromModal() {
    return {
        br: clampGrid(document.getElementById('alt-modal-br')?.value, DEFAULT_GRID.br),
        bc: clampGrid(document.getElementById('alt-modal-bc')?.value, DEFAULT_GRID.bc),
        sr: clampGrid(document.getElementById('alt-modal-sr')?.value, DEFAULT_GRID.sr),
        sc: clampGrid(document.getElementById('alt-modal-sc')?.value, DEFAULT_GRID.sc),
    };
}

function applyGridToDetail(cfg) {
    const g = { ...DEFAULT_GRID, ...cfg };
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('alt-bhikkhu-rows', g.br);
    set('alt-bhikkhu-cols', g.bc);
    set('alt-samanera-rows', g.sr);
    set('alt-samanera-cols', g.sc);
}

function applyGridToModal(cfg) {
    const g = { ...DEFAULT_GRID, ...cfg };
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    };
    set('alt-modal-br', g.br);
    set('alt-modal-bc', g.bc);
    set('alt-modal-sr', g.sr);
    set('alt-modal-sc', g.sc);
}

function buildSeatOrderFromMonks(monks, rows, cols, type) {
    const total = rows * cols;
    const order = new Array(total).fill(null);
    const firstDataIndex = type === 'bhikkhu' ? cols : 0;
    const chiefSeat = type === 'bhikkhu' ? Math.floor(cols / 2) : 0;
    const placed = new Set();
    if (type === 'bhikkhu' && total > 0) {
        const chief = monks.find(m => m.position === BHIKKHU_CHIEF_POSITION);
        if (chief) {
            order[chiefSeat] = chief.id;
            placed.add(chief.id);
        }
    }
    const remaining = monks.filter(m => !placed.has(m.id));
    let ri = 0;
    for (let i = firstDataIndex; i < total && ri < remaining.length; i++) {
        order[i] = remaining[ri++].id;
    }
    return order;
}

function buildSeatArraysFromModal() {
    const cfg = readGridFromModal();
    const selected = allMonks.filter(m => modalSelectedIds.has(m.id));
    const bh = sortBhikkhus(selected.filter(m => m.monk_type === 'ភិក្ខុ'));
    const sam = sortSamaneras(selected.filter(m => m.monk_type === 'សាមណេរ'));
    return {
        bhikkhu_ids: buildSeatOrderFromMonks(bh, cfg.br, cfg.bc, 'bhikkhu'),
        samanera_ids: buildSeatOrderFromMonks(sam, cfg.sr, cfg.sc, 'samanera'),
    };
}

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (type === 'error' ? ' error' : '');
    setTimeout(() => { el.className = 'toast'; }, 2800);
}

function setVisible(id, show) {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
}

function formatUpdated(ts) {
    if (!ts) return '';
    try {
        const d = new Date(ts);
        return `ធ្វើបច្ចុប្បន្នភាព: ${d.toLocaleDateString('km-KH')} ${d.toLocaleTimeString('km-KH', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
        return '';
    }
}

function renderTabs() {
    const scroll = document.getElementById('alt-tab-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    layouts.forEach(layout => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'alt-tab' + (layout.id === activeId ? ' is-active' : '');
        btn.textContent = layout.name;
        btn.dataset.id = String(layout.id);
        btn.addEventListener('click', () => selectLayout(layout.id));
        scroll.appendChild(btn);
    });
}

async function loadTabGridConfig() {
    if (!activeId) return;
    try {
        const res = await fetch(`/api/alt-assemblies/${activeId}/seats`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'seats error');
        activeGridConfig = { ...DEFAULT_GRID, ...(json.grid_config || {}) };
        applyGridToDetail(activeGridConfig);
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

function renderDetail() {
    const layout = layouts.find(l => l.id === activeId);
    if (!layout) {
        setVisible('alt-detail', false);
        setVisible('alt-empty', true);
        return;
    }
    setVisible('alt-empty', false);
    setVisible('alt-detail', true);
    document.getElementById('alt-detail-name').textContent = layout.name;
    document.getElementById('alt-detail-meta').textContent = formatUpdated(layout.updated_at);
    const viewLink = document.getElementById('alt-view-layout');
    if (viewLink) viewLink.href = `/alt-layout/${layout.id}/edit`;
    loadTabGridConfig();
}

function selectLayout(id) {
    activeId = id;
    renderTabs();
    renderDetail();
}

async function loadLayouts() {
    setVisible('alt-loading', true);
    setVisible('alt-empty', false);
    setVisible('alt-detail', false);
    try {
        const res = await fetch('/api/alt-assemblies');
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'error');
        layouts = json.layouts || [];
        setVisible('alt-loading', false);
        if (!layouts.length) {
            activeId = null;
            setVisible('alt-empty', true);
            return;
        }
        if (!activeId || !layouts.some(l => l.id === activeId)) {
            activeId = layouts[0].id;
        }
        renderTabs();
        renderDetail();
    } catch (err) {
        setVisible('alt-loading', false);
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

function getPickMode() {
    const checked = document.querySelector('input[name="alt-pick-mode"]:checked');
    return checked?.value === 'multiple' ? 'multiple' : 'single';
}

function togglePickPanels() {
    const mode = getPickMode();
    const single = document.getElementById('alt-pick-single');
    const multi = document.getElementById('alt-pick-multiple');
    if (single) single.style.display = mode === 'single' ? '' : 'none';
    if (multi) multi.style.display = mode === 'multiple' ? '' : 'none';
    hidePickSuggestions();
}

function resetModalPicker() {
    modalSelectedIds = new Set();
    modalPickHighlight = -1;
    const search = document.getElementById('alt-pick-search');
    if (search) search.value = '';
    hidePickSuggestions();
    renderPickChips();
    updatePickCount();
    renderPickChecklist();
}

function updatePickCount() {
    const el = document.getElementById('alt-pick-count');
    if (!el) return;
    const n = modalSelectedIds.size;
    el.textContent = `ជ្រើសរើស: ${n} អង្គ`;
}

function renderPickChips() {
    const wrap = document.getElementById('alt-pick-chips');
    if (!wrap) return;
    const selected = allMonks.filter(m => modalSelectedIds.has(m.id));
    if (!selected.length) {
        wrap.innerHTML = '<span class="alt-pick-empty">មិនមានព្រះសង្ឃជ្រើសរើស</span>';
        return;
    }
    wrap.innerHTML = selected.map(m => `
        <span class="alt-pick-chip">
            <span class="alt-pick-chip-type">${escapeHtml(m.monk_type)}</span>
            ${escapeHtml(m.fullname)}
            <button type="button" class="alt-pick-chip-remove" data-id="${m.id}" aria-label="លុប">×</button>
        </span>
    `).join('');
    wrap.querySelectorAll('.alt-pick-chip-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            modalSelectedIds.delete(parseInt(btn.dataset.id, 10));
            renderPickChips();
            updatePickCount();
            renderPickChecklist();
        });
    });
}

function renderPickChecklist() {
    const box = document.getElementById('alt-pick-checklist');
    if (!box) return;
    const bh = sortBhikkhus(allMonks.filter(m => m.monk_type === 'ភិក្ខុ'));
    const sam = sortSamaneras(allMonks.filter(m => m.monk_type === 'សាមណេរ'));
    const row = (m) => `
        <label class="alt-pick-check-row">
            <input type="checkbox" value="${m.id}" ${modalSelectedIds.has(m.id) ? 'checked' : ''}>
            <span class="alt-pick-check-name">${escapeHtml(m.fullname)}</span>
            <span class="alt-pick-check-sub">${escapeHtml(m.position || '')}</span>
        </label>`;
    box.innerHTML = `
        <p class="alt-pick-group-title">ភិក្ខុ (${bh.length})</p>
        <div class="alt-pick-group">${bh.map(row).join('')}</div>
        <p class="alt-pick-group-title">សាមណេរ (${sam.length})</p>
        <div class="alt-pick-group">${sam.map(row).join('')}</div>`;
    box.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            const id = parseInt(cb.value, 10);
            if (cb.checked) modalSelectedIds.add(id);
            else modalSelectedIds.delete(id);
            renderPickChips();
            updatePickCount();
        });
    });
}

function filterMonksForSearch(q) {
    const term = (q || '').trim().toLowerCase();
    if (!term) return [];
    return allMonks.filter(m => {
        if (modalSelectedIds.has(m.id)) return false;
        const name = (m.fullname || '').toLowerCase();
        const pos = (m.position || '').toLowerCase();
        return name.includes(term) || pos.includes(term);
    }).slice(0, 12);
}

function hidePickSuggestions() {
    const el = document.getElementById('alt-pick-suggestions');
    if (el) {
        el.hidden = true;
        el.innerHTML = '';
    }
    modalPickHighlight = -1;
}

function showPickSuggestions(matches) {
    const el = document.getElementById('alt-pick-suggestions');
    if (!el) return;
    if (!matches.length) {
        hidePickSuggestions();
        return;
    }
    el.innerHTML = matches.map((m, i) => `
        <button type="button" class="alt-pick-suggest${i === modalPickHighlight ? ' is-active' : ''}"
            data-id="${m.id}" data-idx="${i}">
            <span class="alt-pick-suggest-type">${escapeHtml(m.monk_type)}</span>
            ${escapeHtml(m.fullname)}
            <span class="alt-pick-suggest-sub">${escapeHtml(m.position || '')}</span>
        </button>
    `).join('');
    el.hidden = false;
    el.querySelectorAll('.alt-pick-suggest').forEach(btn => {
        btn.addEventListener('click', () => addMonkToSelection(parseInt(btn.dataset.id, 10)));
    });
}

function addMonkToSelection(id) {
    if (!id) return;
    modalSelectedIds.add(id);
    const search = document.getElementById('alt-pick-search');
    if (search) search.value = '';
    hidePickSuggestions();
    renderPickChips();
    updatePickCount();
    renderPickChecklist();
}

function addFirstSearchMatch() {
    const search = document.getElementById('alt-pick-search');
    const matches = filterMonksForSearch(search?.value || '');
    if (!matches.length) {
        showToast('រកមិនឃើញ ឬជ្រើសរើសរួចហើយ', 'error');
        return;
    }
    const pick = modalPickHighlight >= 0 && matches[modalPickHighlight]
        ? matches[modalPickHighlight]
        : matches[0];
    addMonkToSelection(pick.id);
}

async function loadMonksForModal() {
    try {
        const res = await fetch('/api/monks?residing=1');
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'monks error');
        allMonks = json.monks || [];
        renderPickChecklist();
    } catch (err) {
        showToast('មិនអាចផ្ទុកព្រះសង្ឃ: ' + err.message, 'error');
    }
}

function openModal(mode, name = '') {
    modalMode = mode;
    document.getElementById('alt-modal-title').textContent =
        mode === 'create' ? 'បន្ថែមអាសនៈ' : 'កែឈ្មោះអាសនៈ';
    const input = document.getElementById('alt-modal-name');
    input.value = name;
    const gridBlock = document.querySelector('.alt-modal-grid');
    if (gridBlock) gridBlock.style.display = mode === 'create' ? '' : 'none';
    const pickSection = document.getElementById('alt-modal-pick-section');
    if (pickSection) pickSection.style.display = mode === 'create' ? '' : 'none';
    if (mode === 'create') {
        applyGridToModal(DEFAULT_GRID);
        resetModalPicker();
        togglePickPanels();
        loadMonksForModal();
    }
    const modal = document.getElementById('alt-modal');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    input.focus();
}

function closeModal() {
    const modal = document.getElementById('alt-modal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

async function saveGridConfig() {
    if (!activeId) return;
    const cfg = readGridFromDetail();
    try {
        const res = await fetch(`/api/alt-assemblies/${activeId}/seats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'grid_config', ids: cfg }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        showToast('បានរក្សាទុកជួរ/ឈរ ✓');
        await loadLayouts();
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

async function saveModal() {
    const name = (document.getElementById('alt-modal-name').value || '').trim();
    if (!name) {
        showToast('សូមបញ្ចូលឈ្មោះអាសនៈ', 'error');
        return;
    }
    try {
        if (modalMode === 'create') {
            const grid_config = readGridFromModal();
            const seats = buildSeatArraysFromModal();
            const res = await fetch('/api/alt-assemblies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    grid_config,
                    bhikkhu_ids: seats.bhikkhu_ids,
                    samanera_ids: seats.samanera_ids,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            activeId = json.layout.id;
            showToast('បានបង្កើតអាសនៈ ✓');
        } else {
            const res = await fetch(`/api/alt-assemblies/${activeId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            showToast('បានកែឈ្មោះ ✓');
        }
        closeModal();
        await loadLayouts();
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

async function deleteLayout() {
    if (!activeId) return;
    const layout = layouts.find(l => l.id === activeId);
    if (!layout) return;
    if (!confirm(`លុប «${layout.name}» និងប្លង់ទាំងអស់?`)) return;
    try {
        const res = await fetch(`/api/alt-assemblies/${activeId}`, { method: 'DELETE' });
        const json = await res.json();
        if (!json.success) throw new Error(json.message);
        activeId = null;
        showToast('បានលុប ✓');
        await loadLayouts();
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-add-alt-tab')?.addEventListener('click', () => openModal('create'));
    document.getElementById('btn-rename-alt')?.addEventListener('click', () => {
        const layout = layouts.find(l => l.id === activeId);
        openModal('rename', layout?.name || '');
    });
    document.getElementById('btn-delete-alt')?.addEventListener('click', deleteLayout);
    document.getElementById('btn-save-alt-grid')?.addEventListener('click', saveGridConfig);
    document.getElementById('alt-modal-cancel')?.addEventListener('click', closeModal);
    document.getElementById('alt-modal-save')?.addEventListener('click', saveModal);
    document.getElementById('alt-modal')?.addEventListener('click', e => {
        if (e.target.id === 'alt-modal') closeModal();
    });
    document.querySelectorAll('input[name="alt-pick-mode"]').forEach(r => {
        r.addEventListener('change', togglePickPanels);
    });
    document.getElementById('alt-pick-add-btn')?.addEventListener('click', addFirstSearchMatch);
    document.getElementById('alt-pick-search')?.addEventListener('input', e => {
        modalPickHighlight = -1;
        showPickSuggestions(filterMonksForSearch(e.target.value));
    });
    document.getElementById('alt-pick-search')?.addEventListener('keydown', e => {
        const matches = filterMonksForSearch(document.getElementById('alt-pick-search')?.value || '');
        if (e.key === 'ArrowDown' && matches.length) {
            e.preventDefault();
            modalPickHighlight = Math.min(modalPickHighlight + 1, matches.length - 1);
            showPickSuggestions(matches);
        } else if (e.key === 'ArrowUp' && matches.length) {
            e.preventDefault();
            modalPickHighlight = Math.max(modalPickHighlight - 1, 0);
            showPickSuggestions(matches);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            addFirstSearchMatch();
        } else if (e.key === 'Escape') {
            hidePickSuggestions();
        }
    });
    document.getElementById('alt-pick-all-bh')?.addEventListener('click', () => {
        allMonks.filter(m => m.monk_type === 'ភិក្ខុ').forEach(m => modalSelectedIds.add(m.id));
        renderPickChips();
        updatePickCount();
        renderPickChecklist();
    });
    document.getElementById('alt-pick-all-sam')?.addEventListener('click', () => {
        allMonks.filter(m => m.monk_type === 'សាមណេរ').forEach(m => modalSelectedIds.add(m.id));
        renderPickChips();
        updatePickCount();
        renderPickChecklist();
    });
    document.getElementById('alt-pick-clear')?.addEventListener('click', () => {
        modalSelectedIds = new Set();
        renderPickChips();
        updatePickCount();
        renderPickChecklist();
    });
    loadLayouts();
});
