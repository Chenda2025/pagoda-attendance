(function () {
    'use strict';

    const KHMER = '០១២៣៤៥៦៧៨៩';
    const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);

    const H_SLOTS = ['name1', 'name2', 'name3', 'name4', 'name5', 'name6'];
    const V_SLOTS = ['name1', 'name2', 'name3', 'name4', 'name5', 'name6', 'name7', 'name8'];
    const MAX_H = 6;
    const MAX_V = 8;

    /* Fill order = balanced around table; each slot stays on a fixed side */
    const H_FILL = ['name2', 'name6', 'name3', 'name5', 'name1', 'name4'];
    const V_FILL = ['name3', 'name8', 'name4', 'name7', 'name2', 'name5', 'name1', 'name6'];

    const H_POS = {
        name1: 'left', name2: 'top', name3: 'top',
        name4: 'right', name5: 'bot', name6: 'bot',
    };
    const V_POS = {
        name1: 'left', name2: 'left', name3: 'top', name4: 'top',
        name5: 'right', name6: 'right', name7: 'bot', name8: 'bot',
    };
    const H_SIDE_ORDER = {
        top: ['name2', 'name3'],
        left: ['name1'],
        right: ['name4'],
        bot: ['name6', 'name5'],
    };
    const V_SIDE_ORDER = {
        top: ['name3', 'name4'],
        left: ['name2', 'name1'],
        right: ['name5', 'name6'],
        bot: ['name8', 'name7'],
    };

    let layout = { rows: [] };
    let monks = [];
    let wizardStep = 1;
    let draftRows = [];
    let pickerTarget = null; // { rowId, tableId, slot }
    let dirty = false;

    const canvas = document.getElementById('layout-canvas');
    const canvasEmpty = document.getElementById('canvas-empty');
    const saveHint = document.getElementById('save-hint');
    const saveBtn = document.getElementById('btn-save');
    const legendEl = document.getElementById('cl-legend');
    const setupModal = document.getElementById('setup-modal');
    const pickerModal = document.getElementById('picker-modal');
    const addRowModal = document.getElementById('add-row-modal');
    const addTableModal = document.getElementById('add-table-modal');
    const rowEditModal = document.getElementById('row-edit-modal');
    const tableEditModal = document.getElementById('table-edit-modal');
    const tableDeleteModal = document.getElementById('table-delete-modal');

    const ICON_ADD = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    const ICON_EDIT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
    const ICON_DEL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    function closeAllRowMenus() {
        document.querySelectorAll('.cl-row-menu.open').forEach((el) => el.classList.remove('open'));
    }

    function uid(prefix) {
        return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function toast(msg, ok = true) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = msg;
        el.className = 'cl-toast show' + (ok ? '' : ' err');
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.className = 'cl-toast'; }, 2600);
    }

    let draftAddSlots = [];
    let draftEditSlots = [];

    function normalizeSeatSlots(orientation, seatCount, seatSlots) {
        const vertical = orientation === 'vertical';
        const all = vertical ? V_SLOTS : H_SLOTS;
        const fill = vertical ? V_FILL : H_FILL;
        const max = vertical ? MAX_V : MAX_H;
        const count = Math.min(max, Math.max(0, Number(seatCount) || 0));
        let slots = Array.isArray(seatSlots)
            ? seatSlots.filter((s) => all.includes(s))
            : [];
        slots = [...new Set(slots)];
        if (slots.length > count) slots = slots.slice(0, count);
        if (slots.length < count) {
            fill.forEach((s) => {
                if (slots.length >= count) return;
                if (!slots.includes(s)) slots.push(s);
            });
        }
        return slots;
    }

    function seatCountFor(table) {
        const max = table.orientation === 'vertical' ? MAX_V : MAX_H;
        if (Array.isArray(table.seat_slots) && table.seat_slots.length) {
            return Math.min(max, table.seat_slots.length);
        }
        return Math.min(max, Math.max(0, Number(table.seat_count) || max));
    }

    function getSeatLayout(table) {
        const vertical = table.orientation === 'vertical';
        const sideOrder = vertical ? V_SIDE_ORDER : H_SIDE_ORDER;
        const posMap = vertical ? V_POS : H_POS;
        const count = seatCountFor(table);
        const active = normalizeSeatSlots(table.orientation, count, table.seat_slots);
        const activeSet = new Set(active);
        const layoutMap = { top: [], left: [], right: [], bot: [] };
        Object.keys(sideOrder).forEach((side) => {
            layoutMap[side] = sideOrder[side].filter((slot) => activeSet.has(slot));
        });
        return { active, ...layoutMap, posMap };
    }

    function slotsForTable(table) {
        return getSeatLayout(table).active;
    }

    function emptySeats(orientation, seatCount, seatSlots) {
        const all = orientation === 'vertical' ? V_SLOTS : H_SLOTS;
        const active = new Set(normalizeSeatSlots(orientation, seatCount, seatSlots));
        const seats = {};
        all.forEach((s) => { seats[s] = active.has(s) ? null : undefined; });
        return seats;
    }

    function makeTable(label, orientation, seatCount, seatSlots) {
        const orient = orientation || 'horizontal';
        const count = seatCount != null ? seatCount : (orient === 'vertical' ? 8 : 6);
        const slots = normalizeSeatSlots(orient, count, seatSlots);
        return {
            id: uid('t'),
            label: label || 'តុ',
            orientation: orient,
            seat_count: slots.length,
            seat_slots: slots,
            seats: emptySeats(orient, slots.length, slots),
        };
    }

    function makeRow(name, priority) {
        return {
            id: uid('r'),
            name: name || 'ជួរ',
            priority: priority || 1,
            tables: [makeTable('តុ ១', 'horizontal', 6)],
        };
    }

    function sortRows(rows) {
        return [...rows].sort((a, b) => (a.priority || 0) - (b.priority || 0));
    }

    function normalizeMonkId(id) {
        if (id == null || id === '') return null;
        const n = Number(id);
        return Number.isFinite(n) ? n : null;
    }

    function monkById(id) {
        const n = normalizeMonkId(id);
        if (n == null) return null;
        return monks.find((m) => Number(m.id) === n) || null;
    }

    function normalizeLayout(data) {
        const out = data && typeof data === 'object' ? data : { rows: [] };
        if (!Array.isArray(out.rows)) out.rows = [];
        out.rows.forEach((row) => {
            (row.tables || []).forEach((table) => {
                if (!table.seats || typeof table.seats !== 'object') {
                    table.seats = emptySeats(
                        table.orientation || 'horizontal',
                        table.seat_count || (table.orientation === 'vertical' ? 8 : 6),
                    );
                    return;
                }
                Object.keys(table.seats).forEach((slot) => {
                    const v = table.seats[slot];
                    table.seats[slot] = v == null ? null : normalizeMonkId(v);
                });
                migrateOldSeatOrder(table);
                if (!Array.isArray(table.seat_slots) || !table.seat_slots.length) {
                    const activeFromSeats = Object.keys(table.seats).filter((s) => table.seats[s] !== undefined);
                    table.seat_slots = normalizeSeatSlots(
                        table.orientation || 'horizontal',
                        table.seat_count || activeFromSeats.length,
                        activeFromSeats.length ? activeFromSeats : null,
                    );
                    table.seat_count = table.seat_slots.length;
                } else {
                    table.seat_slots = normalizeSeatSlots(
                        table.orientation || 'horizontal',
                        table.seat_count || table.seat_slots.length,
                        table.seat_slots,
                    );
                    table.seat_count = table.seat_slots.length;
                }
            });
        });
        return out;
    }

    /* Old builds used name1..nameN; remap to balanced fill positions */
    function migrateOldSeatOrder(table) {
        const vertical = table.orientation === 'vertical';
        const all = vertical ? V_SLOTS : H_SLOTS;
        const fill = vertical ? V_FILL : H_FILL;
        const max = vertical ? MAX_V : MAX_H;
        const count = seatCountFor(table);
        if (count <= 0 || count >= max) return;
        const active = fill.slice(0, count);
        const oldPrefix = all.slice(0, count);
        const hasNew = active.some((s) => table.seats[s] != null);
        const hasOldOnly = oldPrefix.some((s) => table.seats[s] != null)
            && !active.some((s, i) => s !== oldPrefix[i] && table.seats[s] != null);
        if (hasNew || !hasOldOnly) return;
        const same = oldPrefix.every((s, i) => s === active[i]);
        if (same) return;
        const next = emptySeats(table.orientation, count);
        oldPrefix.forEach((oldSlot, i) => {
            const v = table.seats[oldSlot];
            if (v != null) next[active[i]] = normalizeMonkId(v);
        });
        table.seats = next;
        table.seat_slots = active;
        table.seat_count = active.length;
    }

    function seatDisplayName(fullname, isSide) {
        const name = (fullname || '').trim();
        if (!name) return '';
        if (isSide) {
            if (name.length <= 14) return name;
            return name.slice(0, 13) + '…';
        }
        if (name.length <= 16) return name;
        return name.slice(0, 15) + '…';
    }

    function renderSeatBtn(table, row, slot, activeSlots, orient, group) {
        const active = activeSlots.includes(slot);
        if (!active) return '';
        const mid = table.seats && table.seats[slot];
        const monk = mid != null ? monkById(mid) : null;
        const isSide = group === 'left' || group === 'right';
        const label = monk
            ? seatDisplayName(monk.fullname, isSide)
            : (mid != null ? '?' : '');
        const extra = [];
        if (orient === 'horizontal') {
            if (isSide) extra.push('cl-name-side', `cl-name-${group}`);
            else extra.push('cl-name-edge');
        } else if (isSide) {
            extra.push('cl-name-vert-side', `cl-name-${group}`);
        } else {
            extra.push('cl-name-vert-edge');
        }
        const cls = [
            'cl-name',
            monk ? 'filled' : 'empty',
            mid != null && !monk ? 'missing' : '',
            ...extra,
        ].filter(Boolean).join(' ');
        const tip = monk ? escapeHtml(monk.fullname) : (mid != null ? 'មិនរកឃើញ' : 'ជ្រើសឈ្មោះ');
        const aria = monk ? ` aria-label="${tip}"` : '';
        return `<button type="button" class="${cls}" data-slot="${slot}" data-row="${row.id}" data-table="${table.id}" title="${tip}"${aria}>${escapeHtml(label)}</button>`;
    }

    function renderSeatGroup(slots, table, row, activeSlots, orient, groupClass, groupKey) {
        const parts = slots
            .map((slot) => renderSeatBtn(table, row, slot, activeSlots, orient, groupKey))
            .filter(Boolean);
        if (!parts.length) return '';
        const isHorizontal = groupClass.includes('cl-group-h');
        const isSide = groupClass.includes('cl-group-side');
        const sepCls = isSide ? 'cl-name-sep cl-name-sep-v' : 'cl-name-sep';
        const sep = (isHorizontal || isSide) && parts.length > 1
            ? `<span class="${sepCls}" aria-hidden="true">|</span>`
            : '';
        const inner = sep ? parts.join(sep) : parts.join('');
        return `<div class="cl-seat-group ${groupClass}">${inner}</div>`;
    }

    function tableControls(table, row, ti, rowTableCount) {
        return `
            <div class="cl-table-controls">
                <button type="button" title="ទៅឆ្វេង" data-move="left" data-row="${row.id}" data-table="${table.id}" ${ti === 0 ? 'disabled' : ''} aria-label="ទៅឆ្វេង">&#8592;</button>
                <button type="button" title="ទៅស្តាំ" data-move="right" data-row="${row.id}" data-table="${table.id}" ${ti === rowTableCount - 1 ? 'disabled' : ''} aria-label="ទៅស្តាំ">&#8594;</button>
            </div>`;
    }

    function renderTableGrid(table, row, ti, activeSlots, rowTableCount, orient, topSlots, leftSlots, rightSlots, botSlots, typeLabel) {
        const gh = (slots, key) => renderSeatGroup(slots, table, row, activeSlots, orient, 'cl-group-h', key);
        const gv = (slots, key) => renderSeatGroup(slots, table, row, activeSlots, orient, 'cl-group-v cl-group-side', key);
        const surfaceCls = orient === 'vertical' ? 'cl-table-surface cl-surface-vert' : 'cl-table-surface';
        const tableCls = orient === 'vertical' ? 'cl-vertical' : 'cl-horizontal';
        return `
            <div class="cl-table-wrap" data-row="${row.id}" data-table="${table.id}">
                ${tableControls(table, row, ti, rowTableCount)}
                <div class="cl-table cl-table-grid ${tableCls}">
                    <div class="cl-grid-top">${gh(topSlots, 'top')}</div>
                    <div class="cl-grid-left">${gv(leftSlots, 'left')}</div>
                    <div class="cl-grid-center ${surfaceCls}">${escapeHtml(table.label)}</div>
                    <div class="cl-grid-right">${gv(rightSlots, 'right')}</div>
                    <div class="cl-grid-bot">${gh(botSlots, 'bot')}</div>
                </div>
                <span class="cl-table-label">${typeLabel} · ${toKhmer(activeSlots.length)}</span>
            </div>`;
    }

    function renderHorizontalTable(table, row, ti, activeSlots, rowTableCount) {
        const L = getSeatLayout(table);
        return renderTableGrid(
            table, row, ti, activeSlots, rowTableCount, 'horizontal',
            L.top, L.left, L.right, L.bot, 'ផ្តេក',
        );
    }

    function renderVerticalTable(table, row, ti, activeSlots, rowTableCount) {
        const L = getSeatLayout(table);
        return renderTableGrid(
            table, row, ti, activeSlots, rowTableCount, 'vertical',
            L.top, L.left, L.right, L.bot, 'បញ្ឈរ',
        );
    }

    function usedMonkIds(exclude) {
        const ids = new Set();
        layout.rows.forEach((row) => {
            row.tables.forEach((t) => {
                Object.entries(t.seats || {}).forEach(([slot, mid]) => {
                    const nid = normalizeMonkId(mid);
                    if (nid != null && !(exclude && exclude.rowId === row.id && exclude.tableId === t.id && exclude.slot === slot)) {
                        ids.add(nid);
                    }
                });
            });
        });
        return ids;
    }

    function computeStats() {
        let tables = 0;
        let seats = 0;
        let filled = 0;
        layout.rows.forEach((row) => {
            tables += row.tables.length;
            row.tables.forEach((t) => {
                slotsForTable(t).forEach((slot) => {
                    seats += 1;
                    if (t.seats && t.seats[slot] != null) filled += 1;
                });
            });
        });
        return { rows: layout.rows.length, tables, seats, filled };
    }

    function updateStats() {
        const s = computeStats();
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = toKhmer(val);
        };
        set('stat-rows', s.rows);
        set('stat-tables', s.tables);
        set('stat-seats', s.seats);
        set('stat-filled', s.filled);
    }

    function updateSaveState() {
        if (saveBtn) saveBtn.classList.toggle('is-dirty', dirty);
        if (saveHint) {
            saveHint.classList.toggle('is-dirty', dirty);
            saveHint.classList.toggle('is-clean', !dirty && layout.rows.length > 0);
        }
    }

    function markDirty() {
        dirty = true;
        if (saveHint) saveHint.textContent = 'មិនទាន់រក្សាទុក';
        updateSaveState();
    }

    function markClean(ts) {
        dirty = false;
        if (saveHint) {
            saveHint.textContent = ts
                ? `រក្សាទុក · ${ts.slice(0, 16).replace('T', ' ')}`
                : (layout.rows.length ? 'រក្សាទុករួច' : '—');
        }
        updateSaveState();
    }

    /* ── Render canvas ── */
    function renderCanvas() {
        if (!canvas) return;
        const rows = sortRows(layout.rows);
        updateStats();

        if (!rows.length) {
            canvas.hidden = true;
            canvas.innerHTML = '';
            if (canvasEmpty) canvasEmpty.hidden = false;
            if (legendEl) legendEl.hidden = true;
            return;
        }

        if (canvasEmpty) canvasEmpty.hidden = true;
        canvas.hidden = false;
        if (legendEl) legendEl.hidden = false;

        canvas.innerHTML = rows.map((row) => {
            const tableCount = row.tables.length;
            const tablesHtml = row.tables.map((table, ti) => {
                const orient = table.orientation === 'vertical' ? 'vertical' : 'horizontal';
                const activeSlots = slotsForTable(table);

                if (orient === 'horizontal') {
                    return renderHorizontalTable(table, row, ti, activeSlots, row.tables.length);
                }
                return renderVerticalTable(table, row, ti, activeSlots, row.tables.length);
            }).join('');

            return `
                <div class="cl-row-block" data-row="${row.id}">
                    <header class="cl-row-head">
                        <span class="cl-row-priority">${toKhmer(row.priority)}</span>
                        <h3 class="cl-row-name">${escapeHtml(row.name)}</h3>
                        <span class="cl-row-meta">${toKhmer(tableCount)} តុ</span>
                        <div class="cl-row-actions">
                            <div class="cl-row-menu">
                                <button type="button" class="cl-row-action cl-row-action-add" data-menu-toggle title="បន្ថែម" aria-label="បន្ថែម">${ICON_ADD}</button>
                                <div class="cl-row-dropdown">
                                    <button type="button" data-row-action="add-row" data-row="${row.id}">បន្ថែមជួរ</button>
                                    <button type="button" data-row-action="add-table" data-row="${row.id}">បន្ថែមតុ</button>
                                </div>
                            </div>
                            <div class="cl-row-menu">
                                <button type="button" class="cl-row-action cl-row-action-edit" data-menu-toggle title="កែប្រែ" aria-label="កែប្រែ">${ICON_EDIT}</button>
                                <div class="cl-row-dropdown">
                                    <button type="button" data-row-action="edit-row" data-row="${row.id}">កែជួរ</button>
                                    <button type="button" data-row-action="edit-table" data-row="${row.id}">កែតុ</button>
                                </div>
                            </div>
                            <div class="cl-row-menu">
                                <button type="button" class="cl-row-action cl-row-action-del" data-menu-toggle title="លុប" aria-label="លុប">${ICON_DEL}</button>
                                <div class="cl-row-dropdown">
                                    <button type="button" class="danger" data-row-action="delete-row" data-row="${row.id}">លុបជួរ</button>
                                    <button type="button" class="danger" data-row-action="delete-table" data-row="${row.id}">លុបតុ</button>
                                </div>
                            </div>
                        </div>
                    </header>
                    <div class="cl-tables-row">${tablesHtml}</div>
                </div>`;
        }).join('');

        canvas.querySelectorAll('.cl-seat:not(.disabled), .cl-name:not(.disabled)').forEach((btn) => {
            btn.addEventListener('click', () => {
                pickerTarget = {
                    rowId: btn.dataset.row,
                    tableId: btn.dataset.table,
                    slot: btn.dataset.slot,
                };
                openPicker();
            });
        });

        canvas.querySelectorAll('[data-move]').forEach((btn) => {
            btn.addEventListener('click', () => {
                moveTable(btn.dataset.row, btn.dataset.table, btn.dataset.move);
            });
        });

        canvas.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const menu = btn.closest('.cl-row-menu');
                const wasOpen = menu.classList.contains('open');
                closeAllRowMenus();
                if (!wasOpen) menu.classList.add('open');
            });
        });

        canvas.querySelectorAll('[data-row-action]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                closeAllRowMenus();
                const rowId = btn.dataset.row;
                const action = btn.dataset.rowAction;
                if (action === 'add-row') openAddRow(rowId);
                else if (action === 'add-table') openAddTable(rowId);
                else if (action === 'edit-row') openEditRow(rowId);
                else if (action === 'edit-table') openEditTable(rowId);
                else if (action === 'delete-row') deleteRow(rowId);
                else if (action === 'delete-table') openDeleteTable(rowId);
            });
        });
    }

    function fillTableSelect(selectEl, row, selectedId) {
        selectEl.innerHTML = row.tables.map((t) =>
            `<option value="${t.id}" ${t.id === selectedId ? 'selected' : ''}>${escapeHtml(t.label)}</option>`
        ).join('');
    }

    function syncSeatMax(orientEl, seatsEl) {
        const max = orientEl.value === 'vertical' ? MAX_V : MAX_H;
        seatsEl.max = max;
        if (parseInt(seatsEl.value, 10) > max) seatsEl.value = String(max);
        return max;
    }

    function applyTableOrientation(table, orient, seatCount, seatSlots) {
        const slots = normalizeSeatSlots(orient, seatCount, seatSlots);
        const prev = { ...(table.seats || {}) };
        table.orientation = orient;
        table.seat_count = slots.length;
        table.seat_slots = slots;
        table.seats = emptySeats(orient, slots.length, slots);
        slots.forEach((s) => {
            if (prev[s] != null) table.seats[s] = normalizeMonkId(prev[s]);
        });
    }

    const SLOT_LABEL = {
        name1: 'ឆ្វេង', name2: 'លើ១', name3: 'លើ២', name4: 'ស្តាំ',
        name5: 'ក្រោម២', name6: 'ក្រោម១', name7: 'ក្រោម២', name8: 'ក្រោម១',
    };
    const SLOT_LABEL_V = {
        name1: 'ឆ្វេង២', name2: 'ឆ្វេង១', name3: 'លើ១', name4: 'លើ២',
        name5: 'ស្តាំ១', name6: 'ស្តាំ២', name7: 'ក្រោម២', name8: 'ក្រោម១',
    };

    function renderSeatTemplate(rootId, countId, orientation, needed, selected, onToggle) {
        const root = document.getElementById(rootId);
        const countEl = document.getElementById(countId);
        if (!root) return;
        const vertical = orientation === 'vertical';
        const sideOrder = vertical ? V_SIDE_ORDER : H_SIDE_ORDER;
        const labels = vertical ? SLOT_LABEL_V : SLOT_LABEL;
        const selectedSet = new Set(selected);
        const max = vertical ? MAX_V : MAX_H;
        if (countEl) countEl.textContent = `(${toKhmer(selected.length)} / ${toKhmer(needed)} · អតិបរមា ${toKhmer(max)})`;

        const slotBtn = (slot, side) => {
            const on = selectedSet.has(slot);
            const sideCls = side === 'left' || side === 'right' ? ' is-side' : '';
            return `<button type="button" class="cl-st-slot${sideCls}${on ? ' on' : ''}" data-slot="${slot}" title="${labels[slot] || slot}">${labels[slot] || slot}</button>`;
        };
        const group = (side) => sideOrder[side].map((s) => slotBtn(s, side)).join('');

        root.innerHTML = `
            <div class="cl-st-top">${group('top')}</div>
            <div class="cl-st-left">${group('left')}</div>
            <div class="cl-st-center">តុ</div>
            <div class="cl-st-right">${group('right')}</div>
            <div class="cl-st-bot">${group('bot')}</div>`;

        root.querySelectorAll('[data-slot]').forEach((btn) => {
            btn.addEventListener('click', () => onToggle(btn.dataset.slot));
        });
    }

    function toggleDraftSlot(list, slot, needed, orientation) {
        const all = orientation === 'vertical' ? V_SLOTS : H_SLOTS;
        if (!all.includes(slot)) return list;
        const next = [...list];
        const idx = next.indexOf(slot);
        if (idx >= 0) {
            next.splice(idx, 1);
            return next;
        }
        if (needed <= 0) return next;
        if (next.length >= needed) next.shift();
        next.push(slot);
        return next;
    }

    function clampDraftSlots(list, orientation, needed) {
        const all = orientation === 'vertical' ? V_SLOTS : H_SLOTS;
        let slots = (list || []).filter((s) => all.includes(s));
        slots = [...new Set(slots)];
        if (slots.length > needed) slots = slots.slice(0, needed);
        return slots;
    }

    function refreshAddTableTemplate(autoFill) {
        const orient = document.getElementById('add-table-orient').value === 'vertical' ? 'vertical' : 'horizontal';
        const max = orient === 'vertical' ? MAX_V : MAX_H;
        let needed = parseInt(document.getElementById('add-table-seats').value, 10);
        if (!Number.isFinite(needed)) needed = max;
        needed = Math.max(0, Math.min(max, needed));
        if (autoFill) draftAddSlots = normalizeSeatSlots(orient, needed, draftAddSlots);
        else draftAddSlots = clampDraftSlots(draftAddSlots, orient, needed);
        renderSeatTemplate('add-table-preview', 'add-table-slot-count', orient, needed, draftAddSlots, (slot) => {
            draftAddSlots = toggleDraftSlot(draftAddSlots, slot, needed, orient);
            refreshAddTableTemplate(false);
        });
    }

    function refreshEditTableTemplate(autoFill) {
        const orient = document.getElementById('table-edit-orient').value === 'vertical' ? 'vertical' : 'horizontal';
        const max = orient === 'vertical' ? MAX_V : MAX_H;
        let needed = parseInt(document.getElementById('table-edit-seats').value, 10);
        if (!Number.isFinite(needed)) needed = max;
        needed = Math.max(0, Math.min(max, needed));
        if (autoFill) draftEditSlots = normalizeSeatSlots(orient, needed, draftEditSlots);
        else draftEditSlots = clampDraftSlots(draftEditSlots, orient, needed);
        renderSeatTemplate('table-edit-preview', 'table-edit-slot-count', orient, needed, draftEditSlots, (slot) => {
            draftEditSlots = toggleDraftSlot(draftEditSlots, slot, needed, orient);
            refreshEditTableTemplate(false);
        });
    }

    function renumberTables(row) {
        row.tables.forEach((t, i) => {
            t.label = `តុ ${toKhmer(i + 1)}`;
        });
    }

    function openAddRow(fromRowId) {
        const from = layout.rows.find((r) => r.id === fromRowId);
        const nextPri = Math.max(0, ...layout.rows.map((r) => r.priority || 0)) + 1;
        document.getElementById('add-row-name').value = `ជួរទី${toKhmer(layout.rows.length + 1)}`;
        document.getElementById('add-row-total').value = '1';
        document.getElementById('add-row-priority').value = String(from ? (from.priority || 1) + 1 : nextPri);
        addRowModal.hidden = false;
        document.getElementById('add-row-name').focus();
    }

    function closeAddRow() {
        addRowModal.hidden = true;
    }

    function openAddTable(rowId) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        const last = row.tables[row.tables.length - 1];
        const orient = last?.orientation || 'horizontal';
        const seats = last?.seat_count || (orient === 'vertical' ? 8 : 6);
        document.getElementById('add-table-row-id').value = rowId;
        document.getElementById('add-table-total').value = '1';
        document.getElementById('add-table-orient').value = orient;
        document.getElementById('add-table-seats').value = String(seats);
        syncSeatMax(document.getElementById('add-table-orient'), document.getElementById('add-table-seats'));
        draftAddSlots = normalizeSeatSlots(orient, seats, last?.seat_slots || null);
        refreshAddTableTemplate(true);
        addTableModal.hidden = false;
    }

    function closeAddTable() {
        addTableModal.hidden = true;
    }

    function openEditRow(rowId) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        document.getElementById('row-edit-id').value = row.id;
        document.getElementById('row-edit-name').value = row.name || '';
        document.getElementById('row-edit-priority').value = String(row.priority || 1);
        rowEditModal.hidden = false;
        document.getElementById('row-edit-name').focus();
    }

    function closeEditRow() {
        rowEditModal.hidden = true;
    }

    function openEditTable(rowId) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row || !row.tables.length) {
            toast('មិនមានតុក្នុងជួរនេះ', false);
            return;
        }
        document.getElementById('table-edit-row-id').value = rowId;
        const sel = document.getElementById('table-edit-select');
        fillTableSelect(sel, row, row.tables[0].id);
        const table = row.tables[0];
        document.getElementById('table-edit-orient').value = table.orientation === 'vertical' ? 'vertical' : 'horizontal';
        document.getElementById('table-edit-seats').value = String(table.seat_count || (table.orientation === 'vertical' ? 8 : 6));
        syncSeatMax(document.getElementById('table-edit-orient'), document.getElementById('table-edit-seats'));
        draftEditSlots = normalizeSeatSlots(
            table.orientation === 'vertical' ? 'vertical' : 'horizontal',
            table.seat_count || (table.orientation === 'vertical' ? 8 : 6),
            table.seat_slots || slotsForTable(table),
        );
        refreshEditTableTemplate(true);
        tableEditModal.hidden = false;
    }

    function closeEditTable() {
        tableEditModal.hidden = true;
    }

    function openDeleteTable(rowId) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row || !row.tables.length) {
            toast('មិនមានតុក្នុងជួរនេះ', false);
            return;
        }
        document.getElementById('table-delete-row-id').value = rowId;
        fillTableSelect(document.getElementById('table-delete-select'), row, row.tables[0].id);
        tableDeleteModal.hidden = false;
    }

    function closeDeleteTable() {
        tableDeleteModal.hidden = true;
    }

    function deleteRow(rowId) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        if (!confirm(`លុបជួរ «${row.name}» និងតុទាំងអស់ក្នុងជួរនេះ?`)) return;
        layout.rows = layout.rows.filter((r) => r.id !== rowId);
        markDirty();
        renderCanvas();
        toast('បានលុបជួរ');
    }

    function moveTable(rowId, tableId, dir) {
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        const idx = row.tables.findIndex((t) => t.id === tableId);
        if (idx < 0) return;
        const swap = dir === 'left' ? idx - 1 : idx + 1;
        if (swap < 0 || swap >= row.tables.length) return;
        [row.tables[idx], row.tables[swap]] = [row.tables[swap], row.tables[idx]];
        markDirty();
        renderCanvas();
    }

    /* ── Wizard ── */
    function openSetup() {
        draftRows = JSON.parse(JSON.stringify(layout.rows));
        if (!draftRows.length) draftRows = [makeRow('ជួរទី១', 1)];
        wizardStep = 1;
        updateWizardUI();
        setupModal.hidden = false;
    }

    function closeSetup() {
        setupModal.hidden = true;
    }

    function updateWizardUI() {
        document.querySelectorAll('.cl-step').forEach((el) => {
            el.classList.toggle('active', Number(el.dataset.step) === wizardStep);
        });
        document.querySelectorAll('.cl-step-panel').forEach((el) => {
            el.classList.toggle('active', Number(el.dataset.panel) === wizardStep);
        });
        document.getElementById('btn-prev-step').disabled = wizardStep <= 1;
        document.getElementById('btn-next-step').textContent = wizardStep >= 4 ? 'បញ្ចប់' : 'បន្ទាប់';

        if (wizardStep === 1) renderWizardRows();
        if (wizardStep === 2) renderWizardTables();
        if (wizardStep === 3) renderWizardSeats();
        if (wizardStep === 4) renderWizardSummary();
    }

    function renderWizardRows() {
        const list = document.getElementById('wizard-row-list');
        const sorted = sortRows(draftRows);
        list.innerHTML = sorted.map((row) => `
            <li>
                <span class="row-pri">${toKhmer(row.priority)}</span>
                <span class="row-name">${escapeHtml(row.name)}</span>
                <button type="button" data-del-row="${row.id}">លុប</button>
            </li>`).join('');

        list.querySelectorAll('[data-del-row]').forEach((btn) => {
            btn.addEventListener('click', () => {
                draftRows = draftRows.filter((r) => r.id !== btn.dataset.delRow);
                if (!draftRows.length) draftRows = [makeRow('ជួរទី១', 1)];
                renderWizardRows();
            });
        });
    }

    function renderWizardTables() {
        const root = document.getElementById('wizard-table-config');
        root.innerHTML = sortRows(draftRows).map((row) => {
            const count = row.tables.length;
            const orient = row.tables[0]?.orientation || 'horizontal';
            return `
                <div class="cl-config-block" data-row="${row.id}">
                    <h4>${escapeHtml(row.name)}</h4>
                    <div class="cl-config-row">
                        <label>ចំនួនតុ</label>
                        <input type="number" min="1" max="20" value="${count}" data-field="table-count" data-row="${row.id}">
                    </div>
                    <div class="cl-config-row">
                        <label>ទិសដៅ</label>
                        <select data-field="orientation" data-row="${row.id}">
                            <option value="horizontal" ${orient === 'horizontal' ? 'selected' : ''}>ផ្តេក (៦កន្លែង)</option>
                            <option value="vertical" ${orient === 'vertical' ? 'selected' : ''}>បញ្ឈរ (៨កន្លែង)</option>
                        </select>
                    </div>
                </div>`;
        }).join('');

        root.querySelectorAll('[data-field="table-count"]').forEach((input) => {
            input.addEventListener('change', () => {
                const row = draftRows.find((r) => r.id === input.dataset.row);
                if (!row) return;
                let n = Math.max(1, Math.min(20, parseInt(input.value, 10) || 1));
                input.value = n;
                const orient = row.tables[0]?.orientation || 'horizontal';
                const seatDefault = orient === 'vertical' ? 8 : 6;
                while (row.tables.length < n) {
                    row.tables.push(makeTable(`តុ ${toKhmer(row.tables.length + 1)}`, orient, seatDefault));
                }
                while (row.tables.length > n) row.tables.pop();
                row.tables.forEach((t, i) => {
                    t.label = `តុ ${toKhmer(i + 1)}`;
                    t.orientation = orient;
                });
            });
        });

        root.querySelectorAll('[data-field="orientation"]').forEach((sel) => {
            sel.addEventListener('change', () => {
                const row = draftRows.find((r) => r.id === sel.dataset.row);
                if (!row) return;
                const orient = sel.value;
                const seatDefault = orient === 'vertical' ? 8 : 6;
                row.tables.forEach((t, i) => {
                    applyTableOrientation(t, orient, seatDefault, null);
                    t.label = `តុ ${toKhmer(i + 1)}`;
                });
            });
        });
    }

    function renderWizardSeats() {
        const root = document.getElementById('wizard-seat-config');
        root.innerHTML = sortRows(draftRows).map((row) => {
            const tablesHtml = row.tables.map((table) => {
                const max = table.orientation === 'vertical' ? MAX_V : MAX_H;
                return `
                    <div class="cl-table-seat-row">
                        <span>${escapeHtml(table.label)}</span>
                        <label>កន្លែង</label>
                        <input type="number" min="0" max="${max}" value="${table.seat_count || max}"
                            data-field="seat-count" data-row="${row.id}" data-table="${table.id}">
                        <span class="cl-muted">/ ${toKhmer(max)}</span>
                    </div>`;
            }).join('');
            return `
                <div class="cl-config-block">
                    <h4>${escapeHtml(row.name)}</h4>
                    ${tablesHtml}
                </div>`;
        }).join('');

        root.querySelectorAll('[data-field="seat-count"]').forEach((input) => {
            input.addEventListener('change', () => {
                const row = draftRows.find((r) => r.id === input.dataset.row);
                const table = row?.tables.find((t) => t.id === input.dataset.table);
                if (!table) return;
                const max = table.orientation === 'vertical' ? MAX_V : MAX_H;
                let n = Math.max(0, Math.min(max, parseInt(input.value, 10) || 0));
                input.value = n;
                applyTableOrientation(table, table.orientation || 'horizontal', n, null);
            });
        });
    }

    function renderWizardSummary() {
        const root = document.getElementById('wizard-summary');
        let totalRows = draftRows.length;
        let totalTables = 0;
        let totalSeats = 0;
        draftRows.forEach((row) => {
            totalTables += row.tables.length;
            row.tables.forEach((t) => { totalSeats += slotsForTable(t).length; });
        });
        root.innerHTML = `
            <p><strong>${toKhmer(totalRows)}</strong> ជួរ ·
               <strong>${toKhmer(totalTables)}</strong> តុ ·
               <strong>${toKhmer(totalSeats)}</strong> កន្លែង</p>
            <p>បន្ទាប់ពីបញ្ចប់ — ចុចលើកន្លែងទទេ ដើម្បីជ្រើសឈ្មោះ ឬ «រៀបតាមអក្សរ»</p>`;
    }

    function applyDraft() {
        layout.rows = JSON.parse(JSON.stringify(draftRows));
        markDirty();
        renderCanvas();
    }

    /* ── Monk picker ── */
    function openPicker() {
        renderPickerList('');
        document.getElementById('picker-search').value = '';
        pickerModal.hidden = false;
        document.getElementById('picker-search').focus();
    }

    function closePicker() {
        pickerModal.hidden = true;
        pickerTarget = null;
    }

    function renderPickerList(q) {
        const list = document.getElementById('picker-list');
        const used = usedMonkIds(pickerTarget);
        const query = (q || '').trim().toLowerCase();
        let pool = [...monks].sort((a, b) => (a.fullname || '').localeCompare(b.fullname || '', 'km'));
        if (query) pool = pool.filter((m) => (m.fullname || '').toLowerCase().includes(query));

        list.innerHTML = pool.map((m) => {
            const isUsed = used.has(Number(m.id));
            return `<li><button type="button" class="${isUsed ? 'used' : ''}" data-monk="${m.id}">${escapeHtml(m.fullname)}</button></li>`;
        }).join('') || '<li><span style="padding:12px;color:#64748b">មិនមាន</span></li>';

        list.querySelectorAll('[data-monk]').forEach((btn) => {
            btn.addEventListener('click', () => assignMonk(normalizeMonkId(btn.dataset.monk)));
        });
    }

    function assignMonk(monkId) {
        if (!pickerTarget) return;
        const row = layout.rows.find((r) => r.id === pickerTarget.rowId);
        const table = row?.tables.find((t) => t.id === pickerTarget.tableId);
        if (!table) return;
        if (!table.seats) table.seats = {};
        table.seats[pickerTarget.slot] = monkId;
        markDirty();
        closePicker();
        renderCanvas();
    }

    function clearSeat() {
        if (!pickerTarget) return;
        const row = layout.rows.find((r) => r.id === pickerTarget.rowId);
        const table = row?.tables.find((t) => t.id === pickerTarget.tableId);
        if (!table || !table.seats) return;
        table.seats[pickerTarget.slot] = null;
        markDirty();
        closePicker();
        renderCanvas();
    }

    function autoFillAlphabetical() {
        const used = usedMonkIds(null);
        const pool = [...monks]
            .filter((m) => !used.has(Number(m.id)))
            .sort((a, b) => (a.fullname || '').localeCompare(b.fullname || '', 'km'));

        let pi = 0;
        sortRows(layout.rows).forEach((row) => {
            row.tables.forEach((table) => {
                slotsForTable(table).forEach((slot) => {
                    if (!table.seats) table.seats = {};
                    if (table.seats[slot] == null && pi < pool.length) {
                        table.seats[slot] = pool[pi++].id;
                    }
                });
            });
        });
        markDirty();
        renderCanvas();
        toast(`បានរៀប ${toKhmer(pi)} ឈ្មោះ`);
    }

    /* ── Save / Load ── */
    async function loadAll() {
        try {
            const [layoutRes, monksRes] = await Promise.all([
                fetch('/api/classroom-layout'),
                fetch('/api/monks'),
            ]);
            const layoutData = await layoutRes.json();
            const monksData = await monksRes.json();
            if (layoutData.success && layoutData.layout) {
                layout = normalizeLayout(JSON.parse(JSON.stringify(layoutData.layout)));
            }
            if (!layout.rows) layout.rows = [];
            if (monksData.success) monks = monksData.monks || [];
            markClean(layoutData.updated_at);
            updateStats();
            renderCanvas();
        } catch (err) {
            console.error(err);
            toast('មិនអាចផ្ទុកបាន', false);
        }
    }

    async function saveLayout() {
        try {
            const res = await fetch('/api/classroom-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'failed');
            markClean(data.updated_at);
            toast('បានរក្សាទុក');
        } catch (err) {
            console.error(err);
            toast('រក្សាទុកបរាជ័យ', false);
        }
    }

    /* ── Events ── */
    document.getElementById('btn-setup').addEventListener('click', openSetup);
    document.getElementById('btn-setup-empty')?.addEventListener('click', openSetup);
    document.getElementById('btn-save').addEventListener('click', saveLayout);
    document.getElementById('btn-auto-fill').addEventListener('click', autoFillAlphabetical);

    document.getElementById('row-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('row-name').value.trim();
        const priority = parseInt(document.getElementById('row-priority').value, 10) || 1;
        if (!name) return;
        draftRows.push(makeRow(name, priority));
        document.getElementById('row-name').value = '';
        document.getElementById('row-priority').value = String(draftRows.length + 1);
        renderWizardRows();
    });

    document.querySelectorAll('.cl-step').forEach((btn) => {
        btn.addEventListener('click', () => {
            wizardStep = Number(btn.dataset.step);
            updateWizardUI();
        });
    });

    document.getElementById('btn-prev-step').addEventListener('click', () => {
        if (wizardStep > 1) { wizardStep--; updateWizardUI(); }
    });

    document.getElementById('btn-next-step').addEventListener('click', () => {
        if (wizardStep < 4) {
            wizardStep++;
            updateWizardUI();
        } else {
            applyDraft();
            closeSetup();
            toast('បានកំណត់ប្លង់');
        }
    });

    document.querySelectorAll('[data-close]').forEach((el) => {
        el.addEventListener('click', () => {
            if (el.dataset.close === 'setup') closeSetup();
            if (el.dataset.close === 'picker') closePicker();
            if (el.dataset.close === 'add-row') closeAddRow();
            if (el.dataset.close === 'add-table') closeAddTable();
            if (el.dataset.close === 'row-edit') closeEditRow();
            if (el.dataset.close === 'table-edit') closeEditTable();
            if (el.dataset.close === 'table-delete') closeDeleteTable();
        });
    });

    document.addEventListener('click', () => closeAllRowMenus());

    function bindOrientSeat(orientId, seatsId, onChange) {
        const orientEl = document.getElementById(orientId);
        const seatsEl = document.getElementById(seatsId);
        if (!orientEl || !seatsEl) return;
        const run = () => {
            const max = syncSeatMax(orientEl, seatsEl);
            if (!seatsEl.value) seatsEl.value = String(max);
            if (onChange) onChange();
        };
        orientEl.addEventListener('change', run);
        seatsEl.addEventListener('input', run);
        seatsEl.addEventListener('change', run);
    }
    bindOrientSeat('add-table-orient', 'add-table-seats', () => {
        draftAddSlots = [];
        refreshAddTableTemplate(true);
    });
    bindOrientSeat('table-edit-orient', 'table-edit-seats', () => {
        draftEditSlots = [];
        refreshEditTableTemplate(true);
    });

    document.getElementById('table-edit-select').addEventListener('change', () => {
        const rowId = document.getElementById('table-edit-row-id').value;
        const row = layout.rows.find((r) => r.id === rowId);
        const table = row?.tables.find((t) => t.id === document.getElementById('table-edit-select').value);
        if (!table) return;
        document.getElementById('table-edit-orient').value = table.orientation === 'vertical' ? 'vertical' : 'horizontal';
        document.getElementById('table-edit-seats').value = String(
            table.seat_count || (table.orientation === 'vertical' ? 8 : 6),
        );
        syncSeatMax(document.getElementById('table-edit-orient'), document.getElementById('table-edit-seats'));
        draftEditSlots = normalizeSeatSlots(
            table.orientation === 'vertical' ? 'vertical' : 'horizontal',
            table.seat_count || (table.orientation === 'vertical' ? 8 : 6),
            table.seat_slots || slotsForTable(table),
        );
        refreshEditTableTemplate(true);
    });

    document.getElementById('add-row-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('add-row-name').value.trim();
        let total = parseInt(document.getElementById('add-row-total').value, 10) || 1;
        total = Math.max(1, Math.min(20, total));
        const priority = Math.max(1, parseInt(document.getElementById('add-row-priority').value, 10) || 1);
        if (!name) return;
        const row = makeRow(name, priority);
        row.tables = [];
        for (let i = 0; i < total; i += 1) {
            row.tables.push(makeTable(`តុ ${toKhmer(i + 1)}`, 'horizontal', 6));
        }
        layout.rows.push(row);
        markDirty();
        closeAddRow();
        renderCanvas();
        toast('បានបន្ថែមជួរ');
    });

    document.getElementById('add-table-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const rowId = document.getElementById('add-table-row-id').value;
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        let total = parseInt(document.getElementById('add-table-total').value, 10) || 1;
        total = Math.max(1, Math.min(20, total));
        const orient = document.getElementById('add-table-orient').value === 'vertical' ? 'vertical' : 'horizontal';
        const max = orient === 'vertical' ? MAX_V : MAX_H;
        let seats = parseInt(document.getElementById('add-table-seats').value, 10);
        if (!Number.isFinite(seats)) seats = max;
        seats = Math.max(0, Math.min(max, seats));
        const slots = normalizeSeatSlots(orient, seats, draftAddSlots);
        if (slots.length !== seats) {
            toast(`សូមជ្រើសទីតាំង ${toKhmer(seats)} កន្លែង`, false);
            refreshAddTableTemplate(true);
            return;
        }
        for (let i = 0; i < total; i += 1) {
            row.tables.push(makeTable(`តុ ${toKhmer(row.tables.length + 1)}`, orient, seats, slots));
        }
        renumberTables(row);
        markDirty();
        closeAddTable();
        renderCanvas();
        toast(total > 1 ? `បានបន្ថែម ${toKhmer(total)} តុ` : 'បានបន្ថែមតុ');
    });

    document.getElementById('row-edit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const rowId = document.getElementById('row-edit-id').value;
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        const name = document.getElementById('row-edit-name').value.trim();
        const priority = parseInt(document.getElementById('row-edit-priority').value, 10) || 1;
        if (!name) return;
        row.name = name;
        row.priority = Math.max(1, priority);
        markDirty();
        closeEditRow();
        renderCanvas();
        toast('បានកែជួរ');
    });

    document.getElementById('table-edit-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const rowId = document.getElementById('table-edit-row-id').value;
        const row = layout.rows.find((r) => r.id === rowId);
        const table = row?.tables.find((t) => t.id === document.getElementById('table-edit-select').value);
        if (!table) return;
        const orient = document.getElementById('table-edit-orient').value === 'vertical' ? 'vertical' : 'horizontal';
        const max = orient === 'vertical' ? MAX_V : MAX_H;
        let seats = parseInt(document.getElementById('table-edit-seats').value, 10);
        if (!Number.isFinite(seats)) seats = max;
        seats = Math.max(0, Math.min(max, seats));
        const slots = normalizeSeatSlots(orient, seats, draftEditSlots);
        if (slots.length !== seats) {
            toast(`សូមជ្រើសទីតាំង ${toKhmer(seats)} កន្លែង`, false);
            refreshEditTableTemplate(true);
            return;
        }
        applyTableOrientation(table, orient, seats, slots);
        markDirty();
        closeEditTable();
        renderCanvas();
        toast('បានកែតុ');
    });

    document.getElementById('table-delete-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const rowId = document.getElementById('table-delete-row-id').value;
        const row = layout.rows.find((r) => r.id === rowId);
        if (!row) return;
        const tableId = document.getElementById('table-delete-select').value;
        const table = row.tables.find((t) => t.id === tableId);
        if (!table) return;
        if (row.tables.length <= 1) {
            toast('ជួរត្រូវមានយ៉ាងហោចណាស់ ១ តុ', false);
            return;
        }
        if (!confirm(`លុប «${table.label}»?`)) return;
        row.tables = row.tables.filter((t) => t.id !== tableId);
        renumberTables(row);
        markDirty();
        closeDeleteTable();
        renderCanvas();
        toast('បានលុបតុ');
    });

    document.getElementById('btn-clear-seat').addEventListener('click', clearSeat);
    document.getElementById('picker-search').addEventListener('input', (e) => {
        renderPickerList(e.target.value);
    });

    window.addEventListener('beforeunload', (e) => {
        if (dirty) e.preventDefault();
    });

    loadAll();
})();
