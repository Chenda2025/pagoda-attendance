(function () {
    'use strict';

    const CAN_EDIT = PAGE_ROLE === 'admin';
    const PAGE_SIZE = 50;
    const SHIFTS_PER_PAGE = 2;
    const KHMER = '\u17e0\u17e1\u17e2\u17e3\u17e4\u17e5\u17e6\u17e7\u17e8\u17e9';
    const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);
    const T = {"title": "\u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "pagoda": "\u179c\u178f\u17d2\u178f\u1793\u17b7\u179a\u17c4\u1792\u179a\u1784\u17d2\u179f\u17b8", "morning": "\u1796\u17d2\u179a\u17b9\u1780", "evening": "\u179b\u17d2\u1784\u17b6\u1785", "shift": "\u179c\u17c1\u1793\u1791\u17b8", "preview": "\u1798\u17be\u179b\u1798\u17bb\u1793", "export": "\u1793\u17b6\u17c6\u1785\u17c1\u1789", "image": "\u179a\u17bc\u1794\u1797\u17b6\u1796", "save": "\u1794\u17b6\u1793\u179a\u1780\u17d2\u179f\u17b6\u1791\u17bb\u1780", "saving_word": "\u1780\u17c6\u1796\u17bb\u1784\u1795\u17d2\u1791\u17bb\u1780", "auto": "\u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7", "all": "\u1791\u17b6\u17c6\u1784\u17a2\u179f\u17cb", "delete": "\u179b\u17bb\u1794", "dup": "\u1785\u1798\u17d2\u179b\u1784", "search": "\u179f\u17d2\u179c\u17c2\u1784\u179a\u1780\u1788\u17d2\u1798\u17c4\u17c7\u2026", "bhikkhu": "\u1797\u17b7\u1780\u17d2\u1781\u17bb", "samanera": "\u179f\u17b6\u1798\u178e\u17c1\u179a", "year": "\u1786\u17d2\u1793\u17b6\u17c6", "hour": "\u1798\u17c9\u17c4\u1784", "day": "\u1790\u17d2\u1784\u17c3", "not_yet": "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb", "create": "\u1794\u1784\u17d2\u1780\u17be\u178f", "official": "\u1795\u17d2\u179b\u17bc\u179c\u1780\u17b6\u179a", "report": "\u179a\u1794\u17b6\u1799\u1780\u17b6\u179a\u178e\u17cd", "name": "\u1788\u17d2\u1798\u17c4\u17c7", "new": "\u1790\u17d2\u1798\u17b8", "choose": "\u1787\u17d2\u179a\u17be\u179f", "count_unit": "\u1793\u17b6\u1780\u17cb", "be": "\u1796.\u179f.", "need_name": "\u179f\u17bc\u1798\u1794\u1789\u17d2\u1785\u17bc\u179b\u1788\u17d2\u1798\u17c4\u17c7\u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8", "not_found": "\u179a\u1780\u1798\u17b7\u1793\u1783\u17be\u1789 \u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "notes_label": "\u1780\u17c6\u178e\u178f\u17cb", "page_sub": "\u179c\u17c1\u1793\u1791\u17b8\u1796\u17d2\u179a\u17b9\u1780 \u00b7 \u179c\u17c1\u1793\u1791\u17b8\u179b\u17d2\u1784\u17b6\u1785 \u00b7 \u1798\u17be\u179b\u1798\u17bb\u1793\u179a\u1794\u17b6\u1799\u1780\u17b6\u179a\u178e\u17cd\u1795\u17d2\u179b\u17bc\u179c\u1780\u17b6\u179a", "save_hint": "\u1794\u17b6\u1793\u179a\u1780\u17d2\u179f\u17b6\u1791\u17bb\u1780 \u00b7 \u179f\u17d2\u179c\u17d0\u1799\u1794\u17d2\u179a\u179c\u178f\u17d2\u178f\u17b7", "saving": "\u1780\u17c6\u1796\u17bb\u1784\u1795\u17d2\u1791\u17bb\u1780...", "year_label": "\u1786\u17d2\u1793\u17b6\u17c6 \u1796.\u179f.", "empty_title": "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb \u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "empty_text": "+ \u1794\u1784\u17d2\u1780\u17be\u178f\u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784\u1790\u17d2\u1798\u17b8", "unassigned": "\u1798\u17b7\u1793\u1791\u17b6\u1793\u17cb", "assigned": "\u1794\u17b6\u1793\u1785\u17b6\u178f\u17cb", "hint": "\u1787\u17d2\u179a\u17be\u179f\u179c\u17c1\u1793\u1791\u17b8 \u00b7 \u1788\u17d2\u1798\u17c4\u17c7", "name_label": "\u1788\u17d2\u1798\u17c4\u17c7\u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "date_label": "\u1790\u17d2\u1784\u17c3", "morning_label": "\u1798\u17c9\u17c4\u1784\u1796\u17d2\u179a\u17b9\u1780", "evening_label": "\u1798\u17c9\u17c4\u1784\u179b\u17d2\u1784\u17b6\u1785", "preview_title": "\u1798\u17be\u179b\u1798\u17bb\u1793\u179a\u1794\u17b6\u1799\u1780\u17b6\u179a\u178e\u17cd", "dup_btn": "\u1785\u1798\u17d2\u179b\u1784 \u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "del_btn": "\u179b\u17bb\u1794 \u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "create_btn": "\u1794\u1784\u17d2\u1780\u17be\u178f \u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "export_label": "\u1793\u17b6\u17c6\u1785\u17c1\u1789", "search_ph": "\u179f\u17d2\u179c\u17c2\u1784\u179a\u1780\u1788\u17d2\u1798\u17c4\u17c7\u2026", "program_prefix": "\u1780\u1798\u17d2\u1798\u179c\u17b7\u1792\u17b8\u1794\u17bb\u178e\u17d2\u1799\u1795\u17d2\u179f\u17c1\u1784", "confirm_del": "\u179b\u17bb\u1794?"};

    T.chant = '\u179f\u17bc\u178f\u17d2\u179a\u1798\u1793\u17d2\u178f';
    T.alms = '\u1791\u1791\u17bd\u179b\u1794\u17b6\u1799\u1794\u17b7\u178e\u17d2\u178c';
    T.afternoon = '\u179a\u179f\u17c0\u179b';
    T.morning_label = T.chant;
    T.evening_label = T.alms;
    T.kuti = '\u1780\u17bb\u178c\u17b7';
    T.level = '\u1780\u1798\u17d2\u179a\u17b7\u178f';
    T.not_assigned = T.unassigned + '\u1785\u17b6\u178f\u17cb';

    const state = {
        monks: [],
        monkMap: new Map(),
        programs: [],
        years: [],
        year: currentBE(),
        currentId: null,
        selected: { session: 'morning', shift: 0 },
        filterKuti: [],
        filterLevel: [],
        filterAssign: [],
        pickerPage: 1,
        search: '',
        saveTimer: null,
        saving: false,
        saveAgain: false,
        renamingId: null,
        listEdit: false,
        sheetPage: 0,
    };

    function currentBE() {
        const d = new Date();
        const cutoff = new Date(d.getFullYear(), 3, 14);
        return d.getFullYear() + (d >= cutoff ? 544 : 543);
    }

    function $(id) { return document.getElementById(id); }

    function toast(msg, ok) {
        const el = $('fp-toast');
        if (!el) return;
        el.hidden = false;
        el.textContent = msg;
        el.style.background = ok === false ? '#9b1c1c' : '#0c2d5a';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.hidden = true; }, 2400);
    }

    function setSaveHint(kind, text) {
        const el = $('fp-save-hint');
        if (!el) return;
        el.className = 'fp-save-hint' + (kind ? ' is-' + kind : '');
        el.textContent = text || T.save_hint;
    }

    function current() {
        return state.programs.find((p) => p.id === state.currentId) || null;
    }

    function defaultShifts() {
        return [1, 2].map((n) => ({ label: T.shift + ' ' + toKhmer(n), monk_ids: [] }));
    }

    function eveningNeedsSync(p) {
        const morning = p.morning_shifts || [];
        const evening = p.evening_shifts || [];
        if (morning.length !== evening.length) return true;
        return morning.some((s, i) => (
            JSON.stringify(s.monk_ids || []) !== JSON.stringify((evening[i] || {}).monk_ids || [])
        ));
    }

    function mirrorEveningFromMorning(p) {
        if (!p) return false;
        const morning = (p.morning_shifts && p.morning_shifts.length)
            ? p.morning_shifts
            : defaultShifts();
        p.morning_shifts = morning;
        const changed = eveningNeedsSync(p);
        p.evening_shifts = morning.map((s, i) => ({
            label: ((p.evening_shifts || [])[i] || {}).label || s.label || (T.shift + ' ' + toKhmer(i + 1)),
            monk_ids: (s.monk_ids || []).slice(),
        }));
        return changed;
    }

    function nextName() {
        return T.program_prefix + toKhmer(state.programs.length + 1);
    }

    function assignmentOf(id) {
        const p = current();
        if (!p) return null;
        for (const session of ['morning', 'evening']) {
            const shifts = p[session + '_shifts'] || [];
            for (let i = 0; i < shifts.length; i++) {
                if ((shifts[i].monk_ids || []).includes(id)) {
                    return { session, shift: i };
                }
            }
        }
        return null;
    }

    function countAssigned(p) {
        const ids = new Set();
        for (const session of ['morning', 'evening']) {
            for (const s of p[session + '_shifts'] || []) {
                (s.monk_ids || []).forEach((id) => ids.add(id));
            }
        }
        return ids.size;
    }

    function applyLabels() {
        const set = (id, text, prop) => {
            const el = $(id);
            if (el && text) el[prop || 'textContent'] = text;
        };
        set('fp-page-sub', T.page_sub);
        set('fp-save-hint', T.save_hint);
        set('fp-export-label', T.export_label);
        set('fp-empty-title', T.empty_title);
        set('fp-empty-text', T.empty_text);
        set('btn-empty-create', T.create_btn);
        set('fp-picker-hint', T.hint);
        set('fp-name-label', T.name);
        set('fp-morning-label', T.morning_label);
        set('fp-evening-label', T.evening_label);
        const morningC = $('fp-morning-ceremony');
        const eveningC = $('fp-evening-ceremony');
        const morningP = $('fp-morning-period');
        const eveningP = $('fp-evening-period');
        if (morningC) morningC.placeholder = T.chant;
        if (eveningC) eveningC.placeholder = T.alms;
        if (morningP) morningP.placeholder = T.afternoon;
        if (eveningP) eveningP.placeholder = T.morning;
        set('fp-notes-label', T.notes_label);
        set('fp-preview-title', T.preview_title);
        set('btn-dup-tab', T.dup_btn);
        set('btn-del-tab', T.del_btn);
        set('btn-del-shift-text', T.delete);
        set('fp-list-edit-label', T.delete + T.name);
        const search = $('fp-search');
        if (search) search.placeholder = T.search_ph;
        set('fp-filter-assigned', T.assigned);
        set('fp-filter-unassigned', T.not_assigned);
        const pdf = $('btn-fp-export-pdf');
        const png = $('btn-fp-export-png');
        if (pdf) pdf.textContent = 'PDF A4';
        if (png) png.textContent = T.image + ' PNG';
    }

    function fillYears() {
        if (!Number.isFinite(state.year)) state.year = currentBE();
    }

    function renderTabs() {
        const wrap = $('fp-tabs');
        if (state.renamingId != null && wrap.querySelector('.fp-tab-rename')) return;
        wrap.innerHTML = state.programs.map((p) => {
            const active = p.id === state.currentId ? ' is-active' : '';
            const title = CAN_EDIT
                ? ' title="\u1785\u17bb\u1785\u1796\u17b8\u179a\u178a\u17c4\u1784\u178a\u17be\u1798\u17d2\u1794\u17b8\u1794\u17d2\u178f\u17bc\u179a\u1788\u17d2\u1798\u17c4\u17c7"'
                : '';
            return `<button type="button" class="fp-tab${active}" data-id="${p.id}"${title}>${escapeHtml(p.name)}</button>`;
        }).join('');
    }

    function commitTabRename(input, cancelled) {
        const id = Number(input.dataset.id);
        const p = state.programs.find((x) => x.id === id);
        state.renamingId = null;
        if (!p) {
            renderTabs();
            return;
        }
        if (!cancelled) {
            const name = String(input.value || '').trim().slice(0, 160);
            if (name && name !== p.name) {
                p.name = name;
                if (state.currentId === id) {
                    const nameEl = $('fp-name');
                    if (nameEl) nameEl.value = name;
                    renderSheet();
                }
                scheduleSave();
            }
        }
        renderTabs();
    }

    function startTabRename(btn) {
        if (!CAN_EDIT || !btn) return;
        const id = Number(btn.dataset.id);
        const p = state.programs.find((x) => x.id === id);
        if (!p) return;
        if (state.renamingId != null) return;

        state.renamingId = id;
        if (state.currentId !== id) {
            state.currentId = id;
            state.selected = { session: 'morning', shift: 0 };
            renderMeta();
            renderSheet();
            renderPicker();
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fp-tab-rename';
        input.maxLength = 160;
        input.value = p.name || '';
        input.dataset.id = String(id);
        input.setAttribute('aria-label', T.name_label || 'ឈ្មោះ');
        btn.replaceWith(input);
        input.focus();
        input.select();

        let done = false;
        const finish = (cancelled) => {
            if (done) return;
            done = true;
            commitTabRename(input, cancelled);
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                finish(false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                finish(true);
            }
        });
        input.addEventListener('blur', () => finish(false));
    }

    function monkName(id) {
        const m = state.monkMap.get(id);
        return m ? m.fullname : '#' + id;
    }

    function normOpt(value) {
        return String(value || '').replace(/[_\s]+/g, '');
    }

    function valuesMatch(a, b) {
        if (!a || !b) return false;
        return a === b || normOpt(a) === normOpt(b);
    }

    function uniqueField(field) {
        const seen = new Set();
        const out = [];
        state.monks.forEach((m) => {
            const raw = String(m[field] || '').trim();
            if (!raw) return;
            const key = normOpt(raw);
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ value: raw, label: raw.replace(/_/g, ' ') });
        });
        return out.sort((a, b) => a.label.localeCompare(b.label, 'km'));
    }

    function fieldMatchesAny(value, selected) {
        if (!selected.length) return true;
        return selected.some((s) => valuesMatch(value, s));
    }

    function closeFilterMenus(except) {
        document.querySelectorAll('.fp-ms.open').forEach((el) => {
            if (el !== except) el.classList.remove('open');
        });
    }

    function selectedLabel(allText, options, selected) {
        if (!selected.length) return allText;
        if (selected.length === 1) {
            const hit = options.find((o) => valuesMatch(o.value, selected[0]));
            return (hit && hit.label) || selected[0].replace(/_/g, ' ');
        }
        return `${allText} · ${toKhmer(selected.length)}`;
    }

    function syncFilterMenu(el, allText, options, selected) {
        const trigger = el.querySelector('.fp-ms-current');
        if (trigger) trigger.textContent = selectedLabel(allText, options, selected);
        el.querySelector('.fp-ms-trigger')?.classList.toggle('is-on', selected.length > 0);
        el.querySelectorAll('.fp-ms-item').forEach((item) => {
            const value = item.dataset.value;
            const on = value ? selected.some((s) => valuesMatch(s, value)) : selected.length === 0;
            item.classList.toggle('is-on', on);
            const box = item.querySelector('input');
            if (box) box.checked = on;
        });
    }

    function buildFilterMenu(id, allText, options, stateKey) {
        const el = $(id);
        if (!el) return;
        const selected = state[stateKey];
        el.innerHTML = `
            <button type="button" class="fp-ms-trigger${selected.length ? ' is-on' : ''}">
                <span class="fp-ms-current">${escapeHtml(selectedLabel(allText, options, selected))}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <polyline points="6 9 12 15 18 9"/>
                </svg>
            </button>
            <div class="fp-ms-panel">
                <label class="fp-ms-item${selected.length ? '' : ' is-on'}" data-value="">
                    <input type="checkbox"${selected.length ? '' : ' checked'}>
                    <span>${escapeHtml(T.all)}</span>
                </label>
                ${options.map((o) => {
                    const on = selected.some((s) => valuesMatch(s, o.value));
                    return `<label class="fp-ms-item${on ? ' is-on' : ''}" data-value="${escapeHtml(o.value)}">
                        <input type="checkbox"${on ? ' checked' : ''}>
                        <span>${escapeHtml(o.label)}</span>
                    </label>`;
                }).join('')}
            </div>`;
        el.querySelector('.fp-ms-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            const open = el.classList.contains('open');
            closeFilterMenus();
            if (!open) el.classList.add('open');
        });
        el.querySelector('.fp-ms-panel').addEventListener('click', (e) => e.stopPropagation());
        el.querySelectorAll('.fp-ms-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const value = item.dataset.value;
                if (!value) {
                    state[stateKey] = [];
                } else {
                    const next = state[stateKey].filter((s) => !valuesMatch(s, value));
                    if (next.length === state[stateKey].length) next.push(value);
                    state[stateKey] = next;
                }
                syncFilterMenu(el, allText, options, state[stateKey]);
                state.pickerPage = 1;
                renderPicker();
            });
        });
    }

    function initFilters() {
        const keep = (list, selected) => selected.filter((s) => list.some((o) => valuesMatch(o.value, s)));
        const kutis = uniqueField('residence');
        const levels = uniqueField('education_level');
        state.filterKuti = keep(kutis, state.filterKuti);
        state.filterLevel = keep(levels, state.filterLevel);
        buildFilterMenu('fp-filter-kuti', T.kuti, kutis, 'filterKuti');
        buildFilterMenu('fp-filter-level', T.level, levels, 'filterLevel');
    }

    function filteredMonks() {
        const q = state.search.trim().toLowerCase();
        return state.monks.filter((m) => {
            if (!fieldMatchesAny(m.residence, state.filterKuti)) return false;
            if (!fieldMatchesAny(m.education_level, state.filterLevel)) return false;
            const wantA = state.filterAssign.includes('assigned');
            const wantU = state.filterAssign.includes('unassigned');
            if (wantA !== wantU) {
                const asg = assignmentOf(m.id);
                if (wantA && !asg) return false;
                if (wantU && asg) return false;
            }
            if (q && !(m.fullname || '').toLowerCase().includes(q)) return false;
            return true;
        });
    }

    function renderPickerPage(total) {
        const el = $('fp-monk-page');
        if (!el) return;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (pages <= 1) {
            el.innerHTML = '';
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const page = state.pickerPage;
        const nums = [];
        let start = Math.max(1, page - 2);
        let end = Math.min(pages, start + 4);
        start = Math.max(1, end - 4);
        if (start > 1) nums.push(1);
        if (start > 2) nums.push('…');
        for (let n = start; n <= end; n++) nums.push(n);
        if (end < pages - 1) nums.push('…');
        if (end < pages) nums.push(pages);
        el.innerHTML = `
            <button type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>
            ${nums.map((n) => n === '…'
                ? `<span class="fp-page-gap">…</span>`
                : `<button type="button" data-page="${n}" class="${n === page ? 'is-on' : ''}">${toKhmer(n)}</button>`
            ).join('')}
            <button type="button" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button>
            <span class="fp-page-info">${toKhmer(page)} / ${toKhmer(pages)}</span>`;
    }

    function renderPicker() {
        const p = current();
        const list = filteredMonks();
        const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE) || 1);
        if (state.pickerPage > pages) state.pickerPage = pages;
        if (state.pickerPage < 1) state.pickerPage = 1;
        const start = (state.pickerPage - 1) * PAGE_SIZE;
        const pageList = list.slice(start, start + PAGE_SIZE);
        const sel = state.selected;
        $('fp-monk-list').innerHTML = pageList.map((m, i) => {
            const asg = assignmentOf(m.id);
            const here = asg && asg.shift === sel.shift;
            const cls = here ? ' is-here' : (asg ? ' is-used' : '');
            const tag = asg
                ? `<span class="fp-monk-tag" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><polyline points="20 6 9 17 4 12"/></svg></span>`
                : '';
            return `<button type="button" class="fp-monk${cls}" data-id="${m.id}">` +
                `<span class="fp-monk-num">${toKhmer(start + i + 1)}-</span>` +
                `<span>${escapeHtml(m.fullname)}</span>${tag}</button>`;
        }).join('');
        const from = list.length ? start + 1 : 0;
        const to = start + pageList.length;
        $('fp-picker-count').textContent = list.length
            ? `${toKhmer(from)}–${toKhmer(to)} / ${toKhmer(list.length)} ${T.count_unit}`
            : `${toKhmer(0)} / ${toKhmer(state.monks.length)} ${T.count_unit}`;
        renderPickerPage(list.length);
        if (p) {
            $('fp-assign-summary').textContent =
                `${toKhmer(countAssigned(p))} ${T.count_unit}`;
        }
        $('fp-filter-assigned')?.classList.toggle('is-on', state.filterAssign.includes('assigned'));
        $('fp-filter-unassigned')?.classList.toggle('is-on', state.filterAssign.includes('unassigned'));
    }

    function renderMeta() {
        const p = current();
        if (!p) return;
        $('fp-name').value = p.name || '';
        $('fp-morning-time').value = p.morning_time || '06:00';
        $('fp-evening-time').value = p.evening_time || '17:00';
        $('fp-morning-ceremony').value = headingPart(p, 'morning', 'ceremony');
        $('fp-evening-ceremony').value = headingPart(p, 'evening', 'ceremony');
        $('fp-morning-period').value = headingPart(p, 'morning', 'period');
        $('fp-evening-period').value = headingPart(p, 'evening', 'period');
        $('fp-notes').value = p.notes || '';
    }

    function headingPart(p, key, kind) {
        if (kind === 'ceremony') {
            const value = key === 'morning' ? p.morning_ceremony : p.evening_ceremony;
            return (value || '').trim() || (key === 'morning' ? T.chant : T.alms);
        }
        const value = key === 'morning' ? p.morning_period : p.evening_period;
        return (value || '').trim() || (key === 'morning' ? T.afternoon : T.morning);
    }

    function formatTime(t) {
        if (!t) return '';
        const parts = String(t).split(':');
        let hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1], 10);
        if (!Number.isFinite(hour)) return '';
        hour = hour % 12;
        if (hour === 0) hour = 12;
        if (!Number.isFinite(minute) || minute === 0) return toKhmer(hour);
        return `${toKhmer(hour)} : ${toKhmer(String(minute).padStart(2, '0'))}`;
    }

    function sessionHeading(p, sess) {
        const time = formatTime(sess.time);
        return `${headingPart(p, sess.key, 'ceremony')} ${T.hour} ${time} ${headingPart(p, sess.key, 'period')}`;
    }

    function formatDate(iso) {
        if (!iso) return '';
        const [y, m, d] = iso.split('-');
        return `${toKhmer(d)}/${toKhmer(m)}/${toKhmer(y)}`;
    }

    function sheetPageCount(p) {
        const n = ((p && p.morning_shifts) || []).length;
        return Math.max(1, Math.ceil(n / SHIFTS_PER_PAGE));
    }

    function renderSheet() {
        const p = current();
        const sheet = $('fp-sheet');
        if (!p) {
            sheet.innerHTML = '';
            applySheetNav(1);
            return;
        }
        const morningAll = p.morning_shifts || defaultShifts();
        const eveningAll = p.evening_shifts || defaultShifts();
        const pages = sheetPageCount(p);
        if (state.sheetPage >= pages) state.sheetPage = pages - 1;
        if (state.sheetPage < 0) state.sheetPage = 0;
        const from = state.sheetPage * SHIFTS_PER_PAGE;
        const sessions = [
            { key: 'morning', title: T.morning, time: p.morning_time, shifts: morningAll.slice(from, from + SHIFTS_PER_PAGE) },
            { key: 'evening', title: T.evening, time: p.evening_time, shifts: eveningAll.slice(from, from + SHIFTS_PER_PAGE) },
        ];
        sheet.innerHTML = `
            <div class="fp-sheet-inner">
            <img src="/static/logo.jpg" alt="" class="fp-sheet-logo">
            <p class="fp-sheet-org">${escapeHtml(T.pagoda)}</p>
            <h2 class="fp-sheet-title">${escapeHtml(p.name || T.title)}</h2>
            ${p.ceremony_date ? `<p class="fp-sheet-date">${formatDate(p.ceremony_date)}</p>` : ''}
            ${p.notes ? `<p class="fp-sheet-notes">${escapeHtml(p.notes)}</p>` : ''}
            <div class="fp-sheet-rule"></div>
            <div class="fp-sheet-grid">
                ${sessions.map((sess) => `
                    <section class="fp-session${sess.key === 'morning' && state.listEdit ? ' is-list-edit' : ''}" data-session="${sess.key}">
                        <h3>${escapeHtml(sessionHeading(p, sess))}</h3>
                        ${sess.shifts.map((shift, i) => {
                            const idx = from + i;
                            const selected = state.selected.shift === idx;
                            const names = (shift.monk_ids || []).map((id, n) =>
                                `<li data-id="${id}">${toKhmer(n + 1)}- ${escapeHtml(monkName(id))}</li>`
                            ).join('');
                            const canAdd = CAN_EDIT && sess.key === 'morning' && idx === morningAll.length - 1;
                            return `<div class="fp-shift${selected ? ' is-selected' : ''}" data-session="${sess.key}" data-shift="${idx}">
                                <div class="fp-shift-label">
                                    <span>${escapeHtml(shift.label || (T.shift + ' ' + toKhmer(idx + 1)))}</span>
                                    ${canAdd ? `<button type="button" data-add-shift="morning">+</button>` : ''}
                                </div>
                                <div class="fp-shift-brace" aria-hidden="true">
                                    <svg class="fp-brace-cap" viewBox="0 0 20 18" preserveAspectRatio="xMaxYMax meet"><path d="M18 1C7 1 6 8 6 18"/></svg>
                                    <span class="fp-brace-line"></span>
                                    <svg class="fp-brace-notch" viewBox="0 0 20 20" preserveAspectRatio="xMidYMid meet"><path d="M6 0v5c0 4-3 5-5 5 2 0 5 1 5 5v5"/></svg>
                                    <span class="fp-brace-line"></span>
                                    <svg class="fp-brace-cap" viewBox="0 0 20 18" preserveAspectRatio="xMaxYMin meet"><path d="M6 0c0 10 1 17 12 17"/></svg>
                                </div>
                                <ol class="fp-shift-list">${names || `<li class="fp-shift-empty">—</li>`}</ol>
                            </div>`;
                        }).join('')}
                    </section>
                `).join('')}
            </div>
            </div>`;
        renderShiftManage();
        applySheetNav(pages);
    }

    function applySheetNav(pages) {
        const nav = $('fp-sheet-nav');
        if (!nav) return;
        const n = Math.max(1, pages || 1);
        nav.hidden = n <= 1;
        const prev = $('fp-sheet-prev');
        const next = $('fp-sheet-next');
        if (prev) prev.disabled = state.sheetPage <= 0;
        if (next) next.disabled = state.sheetPage >= n - 1;
        const label = $('fp-sheet-page-label');
        if (label) label.textContent = `A4 · ${toKhmer(state.sheetPage + 1)} / ${toKhmer(n)}`;
    }

    function stepSheetPage(dir) {
        const n = sheetPageCount(current());
        const next = Math.min(n - 1, Math.max(0, state.sheetPage + dir));
        if (next === state.sheetPage) return;
        state.sheetPage = next;
        renderSheet();
    }

    function renderShiftManage() {
        const wrap = $('fp-shift-manage');
        const pick = $('fp-shift-pick');
        const p = current();
        if (!wrap || !pick) return;
        const shifts = (p && p.morning_shifts) || [];
        const show = CAN_EDIT && shifts.length > 2;
        wrap.hidden = !show;
        wrap.classList.toggle('is-on', show);
        if (!show) {
            pick.innerHTML = '';
            return;
        }
        const prev = pick.value || String(state.selected.shift);
        pick.innerHTML = shifts.map((s, i) =>
            `<option value="${i}">${escapeHtml(s.label || (T.shift + ' ' + toKhmer(i + 1)))}</option>`
        ).join('');
        const next = shifts[Number(prev)] ? prev : String(shifts.length - 1);
        pick.value = next;
    }

    function deletePickedShift() {
        const p = current();
        if (!CAN_EDIT || !p) return;
        const i = Number($('fp-shift-pick')?.value);
        if (!Number.isFinite(i) || (p.morning_shifts || []).length <= 2) return;
        if (!p.morning_shifts[i]) return;
        p.morning_shifts.splice(i, 1);
        p.morning_shifts.forEach((s, idx) => { s.label = T.shift + ' ' + toKhmer(idx + 1); });
        mirrorEveningFromMorning(p);
        state.selected = { session: 'morning', shift: 0 };
        renderSheet();
        renderPicker();
        scheduleSave();
    }

    function renderAll() {
        const has = state.programs.length > 0 && current();
        $('fp-empty').hidden = !!has;
        $('fp-editor').hidden = !has;
        renderTabs();
        if (has) {
            state.selected.session = 'morning';
            if (mirrorEveningFromMorning(current()) && CAN_EDIT) scheduleSave();
            renderMeta();
            renderSheet();
            renderPicker();
        }
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function scheduleSave() {
        if (!CAN_EDIT || !current()) return;
        setSaveHint('saving', T.saving);
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(saveCurrent, 700);
    }

    async function saveCurrent() {
        const p = current();
        if (!CAN_EDIT || !p) return;
        if (state.saving) {
            state.saveAgain = true;
            return;
        }
        if (!(p.name || '').trim()) {
            setSaveHint('error', T.need_name);
            return;
        }
        state.saving = true;
        try {
            const res = await fetch('/api/festival-programs/' + p.id, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: p.name.trim(),
                    program_year: p.program_year,
                    sort_order: p.sort_order,
                    morning_time: p.morning_time,
                    evening_time: p.evening_time,
                    morning_ceremony: headingPart(p, 'morning', 'ceremony'),
                    morning_period: headingPart(p, 'morning', 'period'),
                    evening_ceremony: headingPart(p, 'evening', 'ceremony'),
                    evening_period: headingPart(p, 'evening', 'period'),
                    morning_shifts: p.morning_shifts,
                    evening_shifts: p.evening_shifts,
                    notes: p.notes || '',
                    ceremony_date: p.ceremony_date || '',
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'save');
            const idx = state.programs.findIndex((x) => x.id === p.id);
            if (idx >= 0) state.programs[idx] = data.program;
            setSaveHint('saved', T.save);
        } catch (err) {
            setSaveHint('error', err.message || T.not_found);
        } finally {
            state.saving = false;
            if (state.saveAgain) {
                state.saveAgain = false;
                saveCurrent();
            }
        }
    }

    function toggleMonk(id) {
        const p = current();
        if (!CAN_EDIT || !p) return;
        const shift = state.selected.shift;
        const shifts = p.morning_shifts;
        if (!shifts[shift]) return;
        if (!Array.isArray(shifts[shift].monk_ids)) shifts[shift].monk_ids = [];
        const idxHere = shifts[shift].monk_ids.indexOf(id);
        if (idxHere >= 0) {
            shifts[shift].monk_ids.splice(idxHere, 1);
        } else {
            shifts.forEach((s) => {
                s.monk_ids = (s.monk_ids || []).filter((x) => x !== id);
            });
            shifts[shift].monk_ids.push(id);
        }
        mirrorEveningFromMorning(p);
        renderSheet();
        renderPicker();
        scheduleSave();
    }

    function removeMonk(id, session, shift) {
        const p = current();
        if (!CAN_EDIT || !p) return;
        const s = p.morning_shifts[shift];
        if (!s) return;
        s.monk_ids = (s.monk_ids || []).filter((x) => x !== id);
        mirrorEveningFromMorning(p);
        renderSheet();
        renderPicker();
        scheduleSave();
    }

    async function loadMonks() {
        const res = await fetch('/api/monks?residing=1');
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'monks');
        state.monks = data.monks || [];
        state.monkMap = new Map(state.monks.map((m) => [m.id, m]));
        initFilters();
        if (current()) renderPicker();
    }

    async function loadPrograms() {
        const res = await fetch('/api/festival-programs?year=' + encodeURIComponent(state.year));
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'programs');
        state.programs = data.programs || [];
        state.years = data.years || [];
        if (!state.programs.some((p) => p.id === state.currentId)) {
            state.currentId = state.programs[0] ? state.programs[0].id : null;
        }
        fillYears();
        renderAll();
    }

    async function createProgram() {
        if (!CAN_EDIT) return;
        const res = await fetch('/api/festival-programs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: nextName(),
                program_year: state.year,
                morning_time: '06:00',
                evening_time: '17:00',
                morning_ceremony: T.chant,
                morning_period: T.afternoon,
                evening_ceremony: T.alms,
                evening_period: T.morning,
                morning_shifts: defaultShifts(),
                evening_shifts: defaultShifts(),
            }),
        });
        const data = await res.json();
        if (!data.success) {
            toast(data.message || T.need_name, false);
            return;
        }
        state.programs.push(data.program);
        state.currentId = data.program.id;
        fillYears();
        renderAll();
        $('fp-name')?.focus();
        $('fp-name')?.select();
    }

    async function duplicateProgram() {
        const p = current();
        if (!CAN_EDIT || !p) return;
        const res = await fetch('/api/festival-programs/' + p.id + '/duplicate', { method: 'POST' });
        const data = await res.json();
        if (!data.success) {
            toast(data.message || T.not_found, false);
            return;
        }
        state.programs.push(data.program);
        state.currentId = data.program.id;
        renderAll();
        toast(T.dup_btn);
    }

    async function deleteProgram() {
        const p = current();
        if (!CAN_EDIT || !p) return;
        if (!confirm(T.confirm_del + ' ' + p.name)) return;
        const res = await fetch('/api/festival-programs/' + p.id, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) {
            toast(data.message || T.not_found, false);
            return;
        }
        state.programs = state.programs.filter((x) => x.id !== p.id);
        state.currentId = state.programs[0] ? state.programs[0].id : null;
        renderAll();
        toast(T.del_btn);
    }

    function bindEditor() {
        $('fp-tabs').addEventListener('click', (e) => {
            if (e.target.closest('.fp-tab-rename')) return;
            const btn = e.target.closest('button.fp-tab[data-id]');
            if (!btn) return;
            const id = Number(btn.dataset.id);
            if (id === state.currentId) return;
            state.currentId = id;
            state.selected = { session: 'morning', shift: 0 };
            renderAll();
        });
        $('fp-tabs').addEventListener('dblclick', (e) => {
            const btn = e.target.closest('button.fp-tab[data-id]');
            if (!btn || !CAN_EDIT) return;
            e.preventDefault();
            startTabRename(btn);
        });
        $('btn-add-tab')?.addEventListener('click', createProgram);
        $('btn-empty-create')?.addEventListener('click', createProgram);
        $('btn-dup-tab')?.addEventListener('click', duplicateProgram);
        $('btn-del-tab')?.addEventListener('click', deleteProgram);
        $('fp-shift-pick')?.addEventListener('change', () => {
            const i = Number($('fp-shift-pick').value);
            if (!Number.isFinite(i)) return;
            state.selected = { session: 'morning', shift: i };
            renderSheet();
            renderPicker();
        });
        $('btn-del-shift')?.addEventListener('click', deletePickedShift);
        $('fp-list-edit')?.addEventListener('change', () => {
            state.listEdit = !!$('fp-list-edit').checked;
            renderSheet();
        });
        document.addEventListener('click', () => closeFilterMenus());
        document.querySelectorAll('[data-assign]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.assign;
                if (state.filterAssign.includes(key)) {
                    state.filterAssign = state.filterAssign.filter((x) => x !== key);
                } else {
                    state.filterAssign = [...state.filterAssign, key];
                }
                state.pickerPage = 1;
                renderPicker();
            });
        });
        $('fp-search').addEventListener('input', () => {
            state.search = $('fp-search').value;
            state.pickerPage = 1;
            renderPicker();
        });
        $('fp-monk-page')?.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (!btn || btn.disabled) return;
            const page = Number(btn.dataset.page);
            const total = filteredMonks().length;
            const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
            if (!Number.isFinite(page) || page < 1 || page > pages) return;
            state.pickerPage = page;
            renderPicker();
            $('fp-monk-list')?.scrollTo({ top: 0 });
        });
        $('fp-monk-list').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-id]');
            if (btn) toggleMonk(Number(btn.dataset.id));
        });
        ['fp-name', 'fp-morning-time', 'fp-evening-time',
            'fp-morning-ceremony', 'fp-morning-period',
            'fp-evening-ceremony', 'fp-evening-period', 'fp-notes'].forEach((id) => {
            $(id)?.addEventListener('input', () => {
                const p = current();
                if (!p) return;
                p.name = $('fp-name').value;
                p.morning_time = $('fp-morning-time').value;
                p.evening_time = $('fp-evening-time').value;
                p.morning_ceremony = $('fp-morning-ceremony').value;
                p.morning_period = $('fp-morning-period').value;
                p.evening_ceremony = $('fp-evening-ceremony').value;
                p.evening_period = $('fp-evening-period').value;
                p.notes = $('fp-notes').value;
                renderTabs();
                renderSheet();
                scheduleSave();
            });
        });
        $('fp-sheet').addEventListener('click', (e) => {
            const add = e.target.closest('[data-add-shift]');
            if (add) {
                const p = current();
                if ((p.morning_shifts || []).length >= 6) return;
                const n = (p.morning_shifts || []).length + 1;
                p.morning_shifts.push({ label: T.shift + ' ' + toKhmer(n), monk_ids: [] });
                mirrorEveningFromMorning(p);
                state.selected = { session: 'morning', shift: p.morning_shifts.length - 1 };
                state.sheetPage = sheetPageCount(p) - 1;
                renderSheet();
                renderPicker();
                scheduleSave();
                return;
            }
            const name = e.target.closest('li[data-id]');
            const shift = e.target.closest('.fp-shift');
            if (name && shift && CAN_EDIT && state.listEdit && shift.dataset.session === 'morning') {
                removeMonk(Number(name.dataset.id), shift.dataset.session, Number(shift.dataset.shift));
                return;
            }
            if (shift) {
                state.selected = {
                    session: 'morning',
                    shift: Number(shift.dataset.shift),
                };
                renderSheet();
                renderPicker();
            }
        });
        $('fp-sheet-prev')?.addEventListener('click', () => stepSheetPage(-1));
        $('fp-sheet-next')?.addEventListener('click', () => stepSheetPage(1));
        document.addEventListener('keydown', (e) => {
            if (e.target.closest('input, select, textarea, [contenteditable]')) return;
            if (e.key === 'ArrowLeft') stepSheetPage(-1);
            if (e.key === 'ArrowRight') stepSheetPage(1);
        });
    }

    function bindExport() {
        const dd = $('fp-export-dd');
        $('btn-fp-export-trigger')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = dd.classList.toggle('open');
            e.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        document.addEventListener('click', () => dd.classList.remove('open'));
        $('btn-fp-export-pdf')?.addEventListener('click', () => runExport('pdf'));
        $('btn-fp-export-png')?.addEventListener('click', () => runExport('png'));
    }

    function waitFrame() {
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }

    function waitImages(root) {
        const imgs = [...(root.querySelectorAll('img') || [])];
        if (!imgs.length) return Promise.resolve();
        return Promise.all(imgs.map((img) => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
            });
        }));
    }

    function fitCanvasOnA4(pdf, canvas) {
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgR = canvas.width / canvas.height;
        const pageR = pageW / pageH;
        let w = pageW;
        let h = pageH;
        let x = 0;
        let y = 0;
        if (imgR > pageR) {
            h = pageW / imgR;
            y = (pageH - h) / 2;
        } else {
            w = pageH * imgR;
            x = (pageW - w) / 2;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, y, w, h);
    }

    async function captureOneSheet() {
        const src = $('fp-sheet');
        const pageW = ExportPreview?.A4_PAGE_W_PX || 794;
        const pageH = ExportPreview?.A4_PAGE_H_PX || 1123;
        const wrap = document.createElement('div');
        Object.assign(wrap.style, {
            position: 'fixed',
            left: '-10000px',
            top: '0',
            width: pageW + 'px',
            height: pageH + 'px',
            background: '#fff',
            overflow: 'hidden',
            pointerEvents: 'none',
        });
        const clone = src.cloneNode(true);
        clone.classList.add('is-print');
        clone.removeAttribute('id');
        clone.style.width = pageW + 'px';
        clone.style.height = pageH + 'px';
        clone.querySelectorAll('.fp-shift-tools, .fp-add-shift, [data-add-shift], [data-del-shift]').forEach((el) => el.remove());
        clone.querySelectorAll('.fp-shift').forEach((el) => el.classList.remove('is-selected'));
        wrap.appendChild(clone);
        document.body.appendChild(wrap);
        try {
            await waitImages(clone);
            await waitFrame();
            return await html2canvas(clone, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: pageW,
                height: pageH,
                windowWidth: pageW,
                windowHeight: pageH,
                x: 0,
                y: 0,
                scrollX: 0,
                scrollY: 0,
            });
        } finally {
            document.body.removeChild(wrap);
        }
    }

    async function captureSheetPages() {
        const src = $('fp-sheet');
        const p = current();
        if (!src || !p) throw new Error(T.not_found);
        if (typeof html2canvas !== 'function') throw new Error('html2canvas');
        const saved = state.sheetPage;
        const total = sheetPageCount(p);
        const pages = [];
        try {
            for (let i = 0; i < total; i++) {
                state.sheetPage = i;
                renderSheet();
                await waitImages(src);
                await waitFrame();
                pages.push(await captureOneSheet());
            }
            return pages;
        } finally {
            state.sheetPage = saved;
            renderSheet();
        }
    }

    async function runExport(kind) {
        const p = current();
        if (!p) {
            toast(T.not_found, false);
            return;
        }
        ddClose();
        try {
            const pages = await captureSheetPages();
            if (!pages.length) throw new Error(T.not_found);
            const name = (p.name || T.title).replace(/\s+/g, '_');
            const isPdf = kind === 'pdf';
            if (typeof ExportPreview?.open !== 'function') throw new Error('preview');
            await ExportPreview.open({
                title: p.name || T.title,
                subtitle: T.pagoda + ' · ' + T.be + toKhmer(p.program_year),
                formatLabel: isPdf ? 'PDF · A4' : ExportPreview.a4PngFormatLabel(pages),
                hint: T.preview_title,
                preview: { type: 'canvases', canvases: pages, hidePageLabels: true },
                onDownload: async () => {
                    if (isPdf) {
                        if (!window.jspdf?.jsPDF) throw new Error('pdf');
                        const { jsPDF } = window.jspdf;
                        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                        pages.forEach((page, i) => {
                            if (i) pdf.addPage('a4', 'portrait');
                            fitCanvasOnA4(pdf, page);
                        });
                        pdf.save(name + '.pdf');
                    } else {
                        await ExportPreview.downloadA4PngPages(pages, name);
                    }
                },
            });
        } catch (err) {
            toast(err.message || T.not_found, false);
        }
    }

    function ddClose() {
        $('fp-export-dd')?.classList.remove('open');
    }

    async function init() {
        applyLabels();
        fillYears();
        bindEditor();
        bindExport();
        try {
            await Promise.all([loadMonks(), loadPrograms()]);
            renderAll();
        } catch (err) {
            toast(err.message || T.not_found, false);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
