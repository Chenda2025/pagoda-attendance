'use strict';

/** Shared dynamic dropdown options for monk entry forms. */
window.FormOptions = (function () {
    const SELECT_FIELDS = {
        monk_type: { name: 'type', placeholder: '-- ជ្រើសរើស --', ids: ['monk-type'] },
        residence: { name: 'home', placeholder: '-- ជ្រើសរើសកុដិ --' },
        position: { name: 'position', placeholder: '-- ជ្រើសរើសតួនាទី --', ids: ['monk-position'] },
        education_level: { name: 'education_level', placeholder: '-- ជ្រើសរើស --', ids: ['monk-education'] },
        academic_year: { name: 'academic_level', placeholder: '-- ជ្រើសរើសឆ្នាំ --', ids: ['monk-academic'] },
    };

    const FIELD_ORDER = [
        'monk_type',
        'residence',
        'position',
        'education_level',
        'academic_year',
    ];

    const KHMER = '០១២៣៤៥៦៧៨៩';
    const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);

    const EDIT_ICON = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
        </svg>`;

    const TRASH_ICON = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>`;

    let data = {};
    let fieldLabels = {};
    let loaded = false;
    let loadPromise = null;
    let editingId = null;

    function esc(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function optionsFor(fieldKey) {
        return data[fieldKey] || [];
    }

    function findOption(id) {
        const target = String(id);
        for (const fieldKey of FIELD_ORDER) {
            const hit = optionsFor(fieldKey).find((o) => String(o.id) === target);
            if (hit) return hit;
        }
        return null;
    }

    function optionsHtml(fieldKey) {
        const cfg = SELECT_FIELDS[fieldKey];
        if (!cfg) return '';
        const items = optionsFor(fieldKey)
            .map((o) => `<option value="${esc(o.value)}">${esc(o.label || o.value)}</option>`)
            .join('');
        return `<option value="">${esc(cfg.placeholder)}</option>${items}`;
    }

    function fillSelect(select, fieldKey, keepValue) {
        if (!select) return;
        const current = keepValue != null && keepValue !== '' ? keepValue : select.value;
        select.innerHTML = optionsHtml(fieldKey);
        if (current && ![...select.options].some((o) => o.value === current)) {
            const extra = document.createElement('option');
            extra.value = current;
            extra.textContent = current;
            select.appendChild(extra);
        }
        if (current) select.value = current;
    }

    function applyAll(root) {
        const scope = root || document;
        Object.entries(SELECT_FIELDS).forEach(([fieldKey, cfg]) => {
            scope.querySelectorAll(`select[name="${cfg.name}"]`).forEach((sel) => {
                fillSelect(sel, fieldKey);
            });
            (cfg.ids || []).forEach((id) => {
                fillSelect(scope.getElementById ? scope.getElementById(id) : document.getElementById(id), fieldKey);
            });
        });
    }

    async function load() {
        if (loaded) return data;
        if (loadPromise) return loadPromise;
        loadPromise = fetch('/api/form-options')
            .then((res) => res.json())
            .then((json) => {
                if (!json.success) throw new Error(json.message || 'ផ្ទុកជម្រើសមិនបាន');
                data = json.options || {};
                fieldLabels = json.fields || {};
                loaded = true;
                return data;
            })
            .catch((err) => {
                loadPromise = null;
                throw err;
            });
        return loadPromise;
    }

    function invalidate() {
        loaded = false;
        loadPromise = null;
    }

    async function reload() {
        invalidate();
        await load();
        applyAll(document);
    }

    function resetForm() {
        editingId = null;
        document.getElementById('options-label-input').value = '';
        document.getElementById('options-priority-input').value = '';
        const addBtn = document.getElementById('options-add-btn');
        const cancelBtn = document.getElementById('options-cancel-btn');
        const banner = document.getElementById('options-editing-banner');
        if (addBtn) {
            addBtn.textContent = 'បន្ថែម';
            addBtn.classList.remove('is-update');
        }
        if (cancelBtn) cancelBtn.hidden = true;
        if (banner) banner.hidden = true;
        document.querySelectorAll('.options-list-item.is-editing').forEach((el) => {
            el.classList.remove('is-editing');
        });
    }

    function updateTabCounts() {
        document.querySelectorAll('.options-tab-count').forEach((el) => {
            el.textContent = toKhmer(optionsFor(el.dataset.countFor).length);
        });
    }

    function renderAdminList(fieldKey) {
        const list = document.getElementById('options-list');
        if (!list) return;
        updateTabCounts();
        const items = optionsFor(fieldKey);
        if (!items.length) {
            list.innerHTML = '<p class="options-empty">មិនទាន់មានជម្រើស — បន្ថែមខាងក្រោម</p>';
            return;
        }
        list.innerHTML = items.map((o) => `
            <div class="options-list-item${String(editingId) === String(o.id) ? ' is-editing' : ''}" data-id="${o.id}">
                <span class="options-list-priority" title="អាទិភាព">${toKhmer(Number(o.sort_order) + 1)}</span>
                <div class="options-list-text">
                    <strong>${esc(o.label || o.value)}</strong>
                </div>
                <div class="options-list-actions">
                    <button type="button" class="options-edit-btn" data-id="${o.id}" title="កែប្រែ" aria-label="កែប្រែ">${EDIT_ICON}</button>
                    <button type="button" class="options-remove-btn" data-id="${o.id}" title="លុប" aria-label="លុប">${TRASH_ICON}</button>
                </div>
            </div>
        `).join('');
    }

    function setActiveTab(fieldKey) {
        resetForm();
        document.querySelectorAll('.options-tab').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.field === fieldKey);
        });
        const labelEl = document.getElementById('options-active-label');
        if (labelEl) {
            labelEl.textContent = fieldLabels[fieldKey] || fieldKey;
        }
        renderAdminList(fieldKey);
        const modal = document.getElementById('options-modal');
        if (modal) modal.dataset.activeField = fieldKey;
    }

    function startEdit(id) {
        const item = findOption(id);
        if (!item) return;
        editingId = item.id;
        document.getElementById('options-label-input').value = item.label || item.value || '';
        document.getElementById('options-priority-input').value = String(Number(item.sort_order) + 1);
        const addBtn = document.getElementById('options-add-btn');
        const cancelBtn = document.getElementById('options-cancel-btn');
        const banner = document.getElementById('options-editing-banner');
        const bannerName = document.getElementById('options-editing-name');
        if (addBtn) {
            addBtn.textContent = 'រក្សាទុក';
            addBtn.classList.add('is-update');
        }
        if (cancelBtn) cancelBtn.hidden = false;
        if (bannerName) bannerName.textContent = item.label || item.value || '';
        if (banner) banner.hidden = false;
        const modal = document.getElementById('options-modal');
        const fieldKey = modal?.dataset.activeField;
        if (fieldKey) renderAdminList(fieldKey);
        document.getElementById('options-label-input')?.focus();
    }

    function openModal() {
        const modal = document.getElementById('options-modal');
        if (!modal) return;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        setActiveTab(FIELD_ORDER[0]);
    }

    function closeModal() {
        const modal = document.getElementById('options-modal');
        if (!modal) return;
        resetForm();
        modal.hidden = true;
        document.body.style.overflow = '';
    }

    function readFormPayload(fieldKey) {
        const label = (document.getElementById('options-label-input')?.value || '').trim();
        const priorityRaw = (document.getElementById('options-priority-input')?.value || '').trim();
        if (!label) {
            alert('សូមបញ្ចូលឈ្មោះជម្រើស');
            return null;
        }
        const payload = { label };
        if (priorityRaw) {
            const priority = parseInt(priorityRaw, 10);
            if (!Number.isFinite(priority) || priority < 1) {
                alert('អាទិភាពត្រូវតែជាលេខ ≥ ១');
                return null;
            }
            payload.priority = priority;
        }
        if (!editingId) {
            let value = label;
            if (fieldKey === 'residence') {
                value = label.replace(/\s+/g, '_');
            }
            payload.field_key = fieldKey;
            payload.value = value;
        }
        return payload;
    }

    async function saveFromForm() {
        const modal = document.getElementById('options-modal');
        const fieldKey = modal?.dataset.activeField;
        if (!fieldKey) return;

        const payload = readFormPayload(fieldKey);
        if (!payload) return;

        const btn = document.getElementById('options-add-btn');
        btn.disabled = true;
        try {
            const res = editingId
                ? await fetch(`/api/form-options/${editingId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                : await fetch('/api/form-options', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || (editingId ? 'កែមិនបាន' : 'បន្ថែមមិនបាន'));
            await reload();
            setActiveTab(fieldKey);
        } catch (err) {
            alert(err.message || 'មិនអាចរក្សាទុកបាន');
        } finally {
            btn.disabled = false;
        }
    }

    async function removeOption(id) {
        if (!confirm('លុបជម្រើសនេះពីបញ្ជី?')) return;
        const modal = document.getElementById('options-modal');
        const fieldKey = modal?.dataset.activeField;
        if (String(editingId) === String(id)) resetForm();
        try {
            const res = await fetch(`/api/form-options/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || 'លុបមិនបាន');
            await reload();
            if (fieldKey) {
                renderAdminList(fieldKey);
            }
        } catch (err) {
            alert(err.message || 'មិនអាចលុបបាន');
        }
    }

    function initAdmin() {
        const modal = document.getElementById('options-modal');
        if (!modal) return;

        document.getElementById('btn-manage-options')?.addEventListener('click', openModal);
        document.querySelectorAll('[data-close-options]').forEach((el) => {
            el.addEventListener('click', closeModal);
        });
        document.querySelectorAll('.options-tab').forEach((btn) => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.field));
        });
        document.getElementById('options-add-btn')?.addEventListener('click', saveFromForm);
        document.getElementById('options-cancel-btn')?.addEventListener('click', resetForm);
        document.getElementById('options-list')?.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.options-edit-btn');
            if (editBtn) {
                startEdit(editBtn.dataset.id);
                return;
            }
            const remBtn = e.target.closest('.options-remove-btn');
            if (remBtn) removeOption(remBtn.dataset.id);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) closeModal();
        });
    }

    return {
        SELECT_FIELDS,
        FIELD_ORDER,
        get data() { return data; },
        optionsHtml,
        fillSelect,
        applyAll,
        load,
        reload,
        initAdmin,
    };
})();
