'use strict';

let allMonks = [];
let reportMonks = [];
let selectedIds = new Set();
let editingReportId = null;
const A4_PORTRAIT_W = 794;   // 210mm @ 96dpi
const A4_PORTRAIT_H = 1123;  // 297mm @ 96dpi
const A4_RENDER_SCALE = 2;

const ICON_EDIT = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

const ICON_DELETE = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

function showToast(msg, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = `toast toast-${type} visible`;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove('visible'), 3000);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    return d.toLocaleDateString('km-KH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isoDateOnly(iso) {
    if (!iso) return '';
    return iso.slice(0, 10);
}

function reportNameCell(m) {
    const initial = (m.fullname || '?').trim().charAt(0) || '?';
    return `<div class="tg-report-name">
        <span class="tg-avatar">${escapeHtml(initial)}</span>
        <span class="tg-name">${escapeHtml(m.fullname)}</span>
    </div>`;
}

function reportDateCell(m) {
    if (editingReportId === m.id) {
        const val = isoDateOnly(m.contract_updated_at) || document.getElementById('ref-date').value;
        return `<input type="date" class="tg-input tg-date-edit report-date-input" data-id="${m.id}" value="${val}">`;
    }
    return `<span class="tg-date-badge">${fmtDateShort(m.contract_updated_at)}</span>`;
}

function reportActions(m) {
    const editing = editingReportId === m.id;
    return `<div class="tg-row-actions">
        <button type="button" class="tg-icon-btn tg-icon-edit${editing ? ' is-active' : ''}" data-action="edit" data-id="${m.id}" title="កែប្រែ" aria-label="កែប្រែ">${ICON_EDIT}</button>
        <button type="button" class="tg-icon-btn tg-icon-delete" data-action="delete" data-id="${m.id}" data-name="${escapeHtml(m.fullname)}" title="លុប" aria-label="លុប">${ICON_DELETE}</button>
    </div>`;
}
function violationLabel(m) {
    const parts = [];
    if (m.over_absent) {
        if (m.contract_step && m.contract_label) {
            parts.push(`អវត្តមាន · កិច្ចសន្យាទី${m.contract_step} (${m.contract_label})`);
        } else {
            parts.push('អវត្តមាន');
        }
    }
    if (m.over_perm) parts.push('ច្បាប់ > ២');
    return parts.join(' + ') || '—';
}

function contractSelect(m) {
    const pending = m.contract_status !== 'done' ? ' selected' : '';
    const done = m.contract_status === 'done' ? ' selected' : '';
    const cls = m.contract_status === 'done' ? 'tg-contract-done' : 'tg-contract-pending';
    return `<select class="tg-contract-select ${cls}" data-id="${m.id}" aria-label="កិច្ចសន្យា">
        <option value="pending"${pending}>មិនទាន់ធ្វើ</option>
        <option value="done"${done}>ធ្វើកិច្ចសន្យារួច</option>
    </select>`;
}

function safeFileName(value) {
    return String(value || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, '_');
}

function blockPeriodText() {
    const el = document.getElementById('block-hint');
    return (el?.textContent || '').trim();
}

function reportBaseFilename(ext) {
    const raw = blockPeriodText();
    const safe = safeFileName(raw || new Date().toISOString().slice(0, 10));
    return `contract_done_${safe}.${ext}`;
}

function monkNameCell(m) {
    const initial = (m.fullname || '?').trim().charAt(0) || '?';
    return `<div class="tg-monk-name">
        <span class="tg-avatar tg-avatar-blue">${escapeHtml(initial)}</span>
        <span class="tg-name">${escapeHtml(m.fullname)}</span>
    </div>`;
}

function telegramBadge(m) {
    if (m.sent) {
        return `<span class="tg-badge tg-badge-sent tg-badge-tg">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 1 0 24 12 12 12 0 0 0 11.944 0zm5.992 8.194-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.94z"/></svg>
            ${fmtDate(m.last_sent)}
        </span>`;
    }
    return `<span class="tg-badge tg-badge-unsent tg-badge-tg">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        មិនទាន់ផ្ញើ
    </span>`;
}

function listEmptyHtml() {
    return `<tr><td colspan="10" class="tg-empty-cell">
        <div class="tg-list-empty">
            <div class="tg-list-empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
            <p>មិនមានព្រះសង្ឃរង់ធ្វើកិច្ចសន្យា</p>
            <span>គ្មានឈ្មោះលើសលក្ខណក្នុងរយៈពេលនេះ — ប្តូរថ្ងៃយកគណនាឬតម្រង</span>
        </div>
    </td></tr>`;
}

function updateSummary() {
    const unsent = allMonks.filter(m => !m.sent).length;
    const sent = allMonks.filter(m => m.sent).length;
    document.getElementById('sum-total').textContent = allMonks.length;
    document.getElementById('sum-eligible').textContent = unsent;
    document.getElementById('sum-sent').textContent = sent;
    document.getElementById('sum-selected').textContent = selectedIds.size;
    document.getElementById('sum-contract-done').textContent = reportMonks.length;
    document.getElementById('report-count').textContent = `${reportMonks.length} នាក់`;
    document.getElementById('report-count-num').textContent = reportMonks.length;
    document.getElementById('report-contract-sum').textContent =
        reportMonks.reduce((sum, m) => sum + (m.contract_total ?? 0), 0);
    document.getElementById('list-count-num').textContent = allMonks.length;
    document.getElementById('list-selected-num').textContent = selectedIds.size;
    document.getElementById('btn-send-tg').disabled = selectedIds.size === 0;
    document.getElementById('btn-export-report').disabled = reportMonks.length === 0;
}

function renderTable() {
    const q = document.getElementById('search-name').value.trim().toLowerCase();
    const filtered = q
        ? allMonks.filter(m => m.fullname.toLowerCase().includes(q))
        : allMonks;
    const body = document.getElementById('tg-body');

    if (!filtered.length) {
        body.innerHTML = listEmptyHtml();
        updateSummary();
        return;
    }

    body.innerHTML = filtered.map((m, i) => {
        const checked = selectedIds.has(m.id) ? ' checked' : '';
        const rowCls = selectedIds.has(m.id) ? ' class="is-selected"' : '';
        const absentCls = m.over_absent ? ' tg-over' : '';
        const permCls = m.over_perm ? ' tg-over' : '';
        return `<tr${rowCls} data-id="${m.id}">
            <td class="col-check"><input type="checkbox" class="row-check" data-id="${m.id}"${checked}></td>
            <td class="col-num">${i + 1}</td>
            <td class="tg-cell-name" data-label="នាម">${monkNameCell(m)}</td>
            <td class="col-hide-sm" data-label="ប្រភេទ">${escapeHtml(m.monk_type)}</td>
            <td data-label="កុដិ"><span class="tg-residence-tag">${escapeHtml(m.residence)}</span></td>
            <td class="col-num" data-label="អវត្តមាន"><span class="tg-count-absent${absentCls}">${m.absent_count}</span></td>
            <td class="col-num" data-label="ច្បាប់"><span class="tg-count-perm${permCls}">${m.perm_count}</span></td>
            <td class="col-hide-sm" data-label="មូលហេតុ"><span class="tg-violation">${escapeHtml(violationLabel(m))}</span></td>
            <td data-label="កិច្ចសន្យា">${contractSelect(m)}</td>
            <td data-label="Telegram">${telegramBadge(m)}</td>
        </tr>`;
    }).join('');

    updateSummary();
}

function reportEmptyHtml() {
    return `<tr><td colspan="10" class="tg-empty-cell">
        <div class="tg-report-empty">
            <div class="tg-report-empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <p>មិនទាន់មានរបាយការណ៍</p>
            <span>ជ្រើស «ធ្វើកិច្ចសន្យារួច» ក្នុងបញ្ជីខាងលើ ដើម្បីបន្ថែមឈ្មោះ</span>
        </div>
    </td></tr>`;
}

function renderReport() {
    const body = document.getElementById('report-body');
    if (!reportMonks.length) {
        body.innerHTML = reportEmptyHtml();
        updateSummary();
        return;
    }

    body.innerHTML = reportMonks.map((m, i) => {
        const editing = editingReportId === m.id;
        return `<tr class="${editing ? 'is-editing' : ''}" data-id="${m.id}">
            <td class="col-num">${i + 1}</td>
            <td class="tg-cell-name" data-label="នាម">${reportNameCell(m)}</td>
            <td class="col-hide-sm" data-label="ប្រភេទ">${escapeHtml(m.monk_type)}</td>
            <td data-label="កុដិ">${escapeHtml(m.residence)}</td>
            <td class="col-num" data-label="អវត្តមាន"><span class="tg-count-absent tg-over">${m.absent_count}</span></td>
            <td class="col-num" data-label="ច្បាប់"><span class="tg-count-perm tg-over">${m.perm_count}</span></td>
            <td class="col-hide-sm" data-label="មូលហេតុ"><span class="tg-violation">${escapeHtml(violationLabel(m))}</span></td>
            <td class="col-num" data-label="ចំនួន"><span class="tg-count-contract">${m.contract_total ?? 0}</span></td>
            <td data-label="ថ្ងៃធ្វើកិច្ចសន្យា">${reportDateCell(m)}</td>
            <td class="col-actions">${reportActions(m)}</td>
        </tr>`;
    }).join('');

    updateSummary();
}

async function loadReport() {
    try {
        const res = await fetch(`/api/telegram-notify/contract-done?${periodQuery()}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');
        reportMonks = json.monks || [];
        renderReport();
    } catch (err) {
        reportMonks = [];
        document.getElementById('report-body').innerHTML =
            `<tr><td colspan="10" class="tg-empty-cell"><div class="tg-report-empty" style="color:#c53030">${escapeHtml(err.message)}</div></td></tr>`;
        updateSummary();
    }
}

async function fetchContractReportHtml() {
    const res = await fetch(`/api/telegram-notify/contract-report/export?${periodQuery({ fmt: 'html' })}`);
    if (!res.ok) {
        let msg = 'មិនអាចបង្កើតរបាយការណ៍បាន';
        try {
            const json = await res.json();
            msg = json.message || msg;
        } catch (_) {}
        throw new Error(msg);
    }
    return res.text();
}

async function renderReportHtmlToA4Pages(html) {
    return ExportPreview.renderHtmlToA4Pages(html, {
        selector: '.page',
        scale: A4_RENDER_SCALE,
        settleMs: 280,
    });
}

async function renderReportHtmlToCanvas(html) {
    const pages = await renderReportHtmlToA4Pages(html);
    return pages[0];
}

async function sendReportImagePagesToTelegram(pages) {
    for (let i = 0; i < pages.length; i++) {
        const blob = await new Promise(r => pages[i].toBlob(r, 'image/png'));
        const form = new FormData();
        const base = reportBaseFilename('png').replace(/\.png$/i, '');
        form.append('image', blob, pages.length === 1 ? `${base}.png` : `${base}_p${i + 1}.png`);
        form.append('date', document.getElementById('ref-date').value);
        form.append('period', currentPeriod());
        form.append('source', currentSource());
        const pageNote = pages.length > 1 ? ` — ទំព័រ ${i + 1}/${pages.length}` : '';
        form.append('caption', `📋 របាយការណ៍កិច្ចសន្យារួច — ${blockPeriodText()}${pageNote}`);

        const res = await fetch('/api/telegram-notify/contract-report/send-image', {
            method: 'POST',
            body: form,
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');
    }
}

async function sendReportImageToTelegram(canvas) {
    return sendReportImagePagesToTelegram([canvas]);
}

async function sendReportHtmlToTelegram(html) {
    const pages = await renderReportHtmlToA4Pages(html);
    return sendReportImagePagesToTelegram(pages);
}

function contractReportPreviewBase(html, subtitle) {
    return {
        title: 'របាយការណ៍កិច្ចសន្យារួច',
        subtitle,
        hint: 'របាយការណ៍ A4 បញ្ឈរ — ពិនិត្យមុនទាញយក ឬផ្ញើ Telegram',
        onTelegram: async () => {
            await sendReportHtmlToTelegram(html);
            showToast('បានផ្ញើរូបភាពទៅ Telegram', 'success');
        },
    };
}

async function downloadReportPdf(html, filename) {
    const pages = await renderReportHtmlToA4Pages(html);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pages.forEach((canvas, i) => {
        if (i > 0) pdf.addPage();
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
    });
    pdf.save(filename);
}

async function loadData() {
    const date = document.getElementById('ref-date').value;
    const filter = document.getElementById('filter-type').value;
    const body = document.getElementById('tg-body');
    body.innerHTML = '<tr><td colspan="10" class="tg-loading"><span class="tg-spinner"></span>កំពុងផ្ទុក...</td></tr>';

    try {
        const res = await fetch(`/api/telegram-notify?${periodQuery({ filter })}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');

        allMonks = json.monks || [];
        selectedIds.clear();
        document.getElementById('check-all').checked = false;

        const bs = json.block_start?.slice(0, 10);
        const be = json.block_end?.slice(0, 10);
        document.getElementById('block-hint').textContent =
            bs && be ? `${bs} → ${be}` : '—';

        renderTable();
        await loadReport();
    } catch (err) {
        body.innerHTML = `<tr><td colspan="10" class="tg-empty" style="color:#c53030">${escapeHtml(err.message)}</td></tr>`;
    }
}

async function saveReportContract(monkId, { status = 'done', contractDate } = {}) {
    const payload = contractPayload({
        monk_id: monkId,
        contract_status: status,
    });
    if (contractDate) payload.contract_date = contractDate;

    const res = await fetch('/api/telegram-notify/contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Error');
    return json;
}

async function deleteReportRow(monkId, name) {
    const label = name || 'ឈ្មោះនេះ';
    if (!window.confirm(`តើចង់លុប ${label} ចេញពីរបាយការណ៍?\n(ឈ្មោះនឹងត្រឡប់ទៅបញ្ជីខាងលើ)`)) return;

    try {
        await saveReportContract(monkId, { status: 'pending' });
        editingReportId = null;
        showToast(`${label} ត្រឡប់ទៅបញ្ជីរង់ចាំ`, 'success');
        await loadData();
    } catch (err) {
        showToast('មិនអាចលុប: ' + err.message, 'error');
    }
}

async function saveReportDate(monkId, dateValue) {
    if (!dateValue) return;
    try {
        const json = await saveReportContract(monkId, { status: 'done', contractDate: dateValue });
        const monk = reportMonks.find(m => m.id === monkId);
        if (monk) monk.contract_updated_at = json.contract_updated_at;
        editingReportId = null;
        renderReport();
        showToast('បានរក្សាទុកថ្ងៃធ្វើកិច្ចសន្យា', 'success');
    } catch (err) {
        showToast('មិនអាចរក្សាទុក: ' + err.message, 'error');
    }
}

async function updateContract(monkId, status, selectEl) {
    const monk = allMonks.find(m => m.id === monkId);
    const prevStatus = monk?.contract_status || 'pending';
    selectEl.disabled = true;

    try {
        const res = await fetch('/api/telegram-notify/contract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractPayload({
                monk_id: monkId,
                contract_status: status,
            })),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');

        if (json.contract_status === 'done' && monk) {
            selectedIds.delete(monkId);
            allMonks = allMonks.filter(m => m.id !== monkId);
            renderTable();
            await loadReport();
            showToast(`${monk.fullname} → របាយការណ៍កិច្ចសន្យារួច`, 'success');
        } else {
            if (monk) monk.contract_status = json.contract_status;
            renderTable();
            showToast('បានរក្សាទុកស្ថានភាពកិច្ចសន្យា', 'success');
        }
    } catch (err) {
        showToast('មិនអាចរក្សាទុក: ' + err.message, 'error');
        selectEl.value = prevStatus;
    } finally {
        selectEl.disabled = false;
    }
}

async function exportContractReport() {
    const html = await fetchContractReportHtml();
    const wordUrl = `/api/telegram-notify/contract-report/export?${periodQuery({ fmt: 'word' })}`;
    const subtitle = blockPeriodText();

    await ExportPreview.open({
        ...contractReportPreviewBase(html, subtitle),
        formatLabel: 'Word (.docx)',
        preview: { type: 'html', html },
        onDownload: async () => { window.location.href = wordUrl; },
    });
}

function toggleExportMenu(forceOpen) {
    const menu = document.getElementById('tg-export-menu');
    const btn = document.getElementById('btn-export-report');
    if (!menu || !btn) return;
    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : menu.hidden;
    menu.hidden = !shouldOpen;
    btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

async function exportContractReportBy(format) {
    toggleExportMenu(false);
    const html = await fetchContractReportHtml();
    const subtitle = blockPeriodText();

    if (format === 'telegram') {
        const pages = await renderReportHtmlToA4Pages(html);
        await ExportPreview.open({
            ...contractReportPreviewBase(html, subtitle),
            formatLabel: ExportPreview.a4PngFormatLabel(pages).replace('រូបភាព PNG', 'Telegram'),
            preview: { type: 'canvases', canvases: pages },
            onDownload: async () => {
                await ExportPreview.downloadA4PngPages(pages, reportBaseFilename('png').replace(/\.png$/i, ''));
            },
            onTelegram: async () => {
                await sendReportImagePagesToTelegram(pages);
                showToast('បានផ្ញើរូបភាពទៅ Telegram', 'success');
            },
        });
        return;
    }

    if (format === 'pdf') {
        await ExportPreview.open({
            ...contractReportPreviewBase(html, subtitle),
            formatLabel: 'PDF · A4',
            preview: { type: 'html', html },
            onDownload: async () => { await downloadReportPdf(html, reportBaseFilename('pdf')); },
        });
        return;
    }

    if (format === 'image') {
        const pages = await renderReportHtmlToA4Pages(html);
        await ExportPreview.open({
            ...contractReportPreviewBase(html, subtitle),
            formatLabel: ExportPreview.a4PngFormatLabel(pages),
            preview: { type: 'canvases', canvases: pages },
            onDownload: async () => {
                await ExportPreview.downloadA4PngPages(pages, reportBaseFilename('png').replace(/\.png$/i, ''));
            },
            onTelegram: async () => {
                await sendReportImagePagesToTelegram(pages);
                showToast('បានផ្ញើរូបភាពទៅ Telegram', 'success');
            },
        });
        return;
    }

    await exportContractReport();
}

async function sendSelected() {
    if (!selectedIds.size) return;
    const btn = document.getElementById('btn-send-tg');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'កំពុងផ្ញើ...';

    try {
        const res = await fetch('/api/telegram-notify/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contractPayload({
                monk_ids: [...selectedIds],
            })),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'Error');

        showToast(json.message || `បានបញ្ជូន ${json.sent} នាក់`, 'success');
        if (json.failed?.length) {
            showToast(`${json.failed.length} នាក់មិនបាន: ${json.failed.map(f => f.name).join(', ')}`, 'error');
        }
        await loadData();
    } catch (err) {
        showToast('មានបញ្ហា: ' + err.message, 'error');
    } finally {
        btn.disabled = selectedIds.size === 0;
        btn.innerHTML = orig;
    }
}

function currentPeriod() {
    const active = document.querySelector('.tg-period-seg.is-active');
    return active?.dataset.period || '15d';
}

function currentSource() {
    const active = document.querySelector('.tg-scope-tab.is-active');
    return active?.dataset.source || 'layout';
}

function periodQuery(extra = {}) {
    const params = new URLSearchParams({
        date: document.getElementById('ref-date').value,
        period: currentPeriod(),
        source: currentSource(),
        ...extra,
    });
    return params.toString();
}

function applyScopeChrome() {
    const sala = currentSource() === 'sala_chan';
    const chip = document.getElementById('tg-rule-chip');
    if (chip) chip.textContent = sala ? 'អវត្តមាន > ២' : 'អវត្តមាន > ២ · ច្បាប់ ≥ ៣';
    const title = document.querySelector('.tg-panel-title');
    if (title) title.textContent = sala ? 'បញ្ជីរង់ចាំកិច្ចសន្យា · សាលាឆាន់' : 'បញ្ជីរង់ចាំកិច្ចសន្យា';
}

function setSource(value) {
    document.querySelectorAll('.tg-scope-tab').forEach((btn) => {
        const on = btn.dataset.source === value;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    applyScopeChrome();
}

function setPeriod(value) {
    document.querySelectorAll('.tg-period-seg').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.period === value);
    });
}

function contractPayload(extra = {}) {
    return {
        date: document.getElementById('ref-date').value,
        period: currentPeriod(),
        source: currentSource(),
        ...extra,
    };
}

function setFilterType(value) {
    const select = document.getElementById('filter-type');
    select.value = value;
    document.querySelectorAll('.tg-segment').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.filter === value);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const dateEl = document.getElementById('ref-date');
    dateEl.value = new Date().toISOString().slice(0, 10);

    dateEl.addEventListener('change', loadData);
    document.querySelectorAll('.tg-scope-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
            setSource(btn.dataset.source);
            loadData();
        });
    });
    document.querySelectorAll('.tg-period-seg').forEach(btn => {
        btn.addEventListener('click', () => {
            setPeriod(btn.dataset.period);
            loadData();
        });
    });
    applyScopeChrome();
    document.querySelectorAll('.tg-segment').forEach(btn => {
        btn.addEventListener('click', () => {
            setFilterType(btn.dataset.filter);
            loadData();
        });
    });
    document.getElementById('search-name').addEventListener('input', renderTable);
    document.getElementById('btn-export-report').addEventListener('click', () => toggleExportMenu());
    document.getElementById('btn-export-report-word').addEventListener('click', () => exportContractReportBy('word'));
    document.getElementById('btn-export-report-pdf').addEventListener('click', () => exportContractReportBy('pdf'));
    document.getElementById('btn-export-report-image').addEventListener('click', () => exportContractReportBy('image'));
    document.getElementById('btn-export-report-telegram').addEventListener('click', () => exportContractReportBy('telegram'));

    document.getElementById('check-all').addEventListener('change', function () {
        const q = document.getElementById('search-name').value.trim().toLowerCase();
        const visible = q ? allMonks.filter(m => m.fullname.toLowerCase().includes(q)) : allMonks;
        if (this.checked) visible.forEach(m => selectedIds.add(m.id));
        else visible.forEach(m => selectedIds.delete(m.id));
        renderTable();
    });

    document.getElementById('btn-select-all').addEventListener('click', () => {
        allMonks.forEach(m => selectedIds.add(m.id));
        document.getElementById('check-all').checked = allMonks.length > 0;
        renderTable();
    });

    document.getElementById('tg-body').addEventListener('change', e => {
        const cb = e.target.closest('.row-check');
        if (cb) {
            const id = parseInt(cb.dataset.id);
            if (cb.checked) selectedIds.add(id);
            else selectedIds.delete(id);
            renderTable();
            return;
        }
        const sel = e.target.closest('.tg-contract-select');
        if (sel) {
            updateContract(parseInt(sel.dataset.id), sel.value, sel);
        }
    });

    document.addEventListener('click', (e) => {
        const wrap = e.target.closest('.tg-export-wrap');
        if (!wrap) toggleExportMenu(false);
    });

    document.getElementById('btn-send-tg').addEventListener('click', sendSelected);

    document.getElementById('report-body').addEventListener('click', e => {
        const editBtn = e.target.closest('[data-action="edit"]');
        if (editBtn) {
            const id = parseInt(editBtn.dataset.id, 10);
            editingReportId = editingReportId === id ? null : id;
            renderReport();
            if (editingReportId === id) {
                const input = document.querySelector(`.report-date-input[data-id="${id}"]`);
                input?.focus();
            }
            return;
        }
        const deleteBtn = e.target.closest('[data-action="delete"]');
        if (deleteBtn) {
            deleteReportRow(parseInt(deleteBtn.dataset.id, 10), deleteBtn.dataset.name);
        }
    });

    document.getElementById('report-body').addEventListener('change', e => {
        const input = e.target.closest('.report-date-input');
        if (input) {
            saveReportDate(parseInt(input.dataset.id, 10), input.value);
        }
    });

    document.getElementById('report-body').addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const input = e.target.closest('.report-date-input');
        if (input) {
            e.preventDefault();
            saveReportDate(parseInt(input.dataset.id, 10), input.value);
        }
    });

    loadData();
});
