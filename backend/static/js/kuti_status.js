/** Admin: check mekuti link status + monk name lists by living status. */

const STAY = 'កំពុងស្នាក់នៅ';
const LEFT = 'ឈប់ស្នាក់នៅ';
const HOME = 'នៅស្រុក';

let statusLinks = [];
let missingLinks = [];
let currentResidence = '';
let currentLabel = '';

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDate(iso) {
    if (!iso) return '—';
    return iso.replace('T', ' ').slice(0, 16);
}

function countPill(n, cls) {
    return `<span class="count-pill ${cls}">${n}</span>`;
}

function safeFileName(label) {
    return String(label || 'kuti').replace(/\s+/g, '_').replace(/[^\w\u1780-\u17FF\-]+/g, '');
}

function rowHtml(item) {
    return `
        <tr class="row-clickable" data-residence="${esc(item.residence)}"
            data-search="${esc((item.residence_label + ' ' + item.label).toLowerCase())}">
            <td><span class="kuti-name">${esc(item.residence_label)}</span></td>
            <td><span class="kuti-leader">${esc(item.label) || '—'}</span></td>
            <td>${countPill(item.active, 'count-active')}</td>
            <td>${countPill(item.left, 'count-left')}</td>
            <td>${countPill(item.hometown, 'count-home')}</td>
            <td>${countPill(item.total, 'count-total')}</td>
            <td><span class="muted-date">${formatDate(item.last_used_at)}</span></td>
            <td>
                <a class="btn-open" href="${esc(item.url)}" target="_blank" rel="noopener"
                   onclick="event.stopPropagation()">
                    បើកតំណ
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
            </td>
        </tr>
    `;
}

function cardHtml(item) {
    return `
        <article class="status-card card-clickable" data-residence="${esc(item.residence)}"
            data-search="${esc((item.residence_label + ' ' + item.label).toLowerCase())}">
            <div class="status-card-head">
                <div>
                    <strong>${esc(item.residence_label)}</strong>
                    <div class="kuti-leader">${esc(item.label) || '—'}</div>
                </div>
                <a class="btn-open" href="${esc(item.url)}" target="_blank" rel="noopener"
                   onclick="event.stopPropagation()">បើកតំណ</a>
            </div>
            <div class="status-card-counts">
                ${countPill(item.active + ' ស្នាក់', 'count-active')}
                ${countPill(item.left + ' ឈប់', 'count-left')}
                ${countPill(item.hometown + ' ស្រុក', 'count-home')}
                ${countPill(item.total + ' សរុប', 'count-total')}
            </div>
            <span class="muted-date">ប្រើចុងក្រោយ៖ ${formatDate(item.last_used_at)}</span>
        </article>
    `;
}

function missingHtml(item) {
    return `
        <button type="button" class="missing-card card-clickable"
            data-residence="${esc(item.residence)}"
            data-label="${esc(item.residence_label)}">
            <strong>${esc(item.residence_label)}</strong>
            <div class="missing-meta">
                កំពុងស្នាក់៖ ${item.active} · ឈប់៖ ${item.left} · នៅស្រុក៖ ${item.hometown}<br>
                សរុប៖ ${item.total} នាក់
            </div>
            <span class="missing-hint">ចុចដើម្បីមើលបញ្ជីឈ្មោះ</span>
        </button>
    `;
}

function applyFilter(q) {
    const query = (q || '').trim().toLowerCase();
    document.querySelectorAll('[data-search]').forEach(el => {
        const match = !query || el.dataset.search.includes(query);
        el.style.display = match ? '' : 'none';
    });
}

function render() {
    const body = document.getElementById('status-body');
    const cards = document.getElementById('status-cards');

    if (!statusLinks.length) {
        body.innerHTML = '<tr><td colspan="8" class="cell-empty">មិនមានតំណសកម្ម — បង្កើតនៅទំព័រ តំណមេកុដិ</td></tr>';
        cards.innerHTML = '<p class="cell-empty">មិនមានតំណសកម្ម</p>';
    } else {
        body.innerHTML = statusLinks.map(rowHtml).join('');
        cards.innerHTML = statusLinks.map(cardHtml).join('');
    }

    const missingPanel = document.getElementById('missing-panel');
    const missingBody = document.getElementById('missing-body');
    if (missingLinks.length) {
        missingPanel.style.display = '';
        missingBody.innerHTML = missingLinks.map(missingHtml).join('');
    } else {
        missingPanel.style.display = 'none';
        missingBody.innerHTML = '';
    }

    applyFilter(document.getElementById('status-search').value);
}

const KHMER = '០១២៣៤៥៦៧៨៩';
const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);

function monkItemHtml(m) {
    const typeCls = m.monk_type === 'ភិក្ខុ' ? 'type-bhikkhu' : 'type-samanera';
    const typePill = m.monk_type
        ? `<span class="monk-type-pill ${typeCls}">${esc(m.monk_type)}</span>`
        : '';
    const pos = m.position ? `<span class="monk-pos">${esc(m.position)}</span>` : '';
    const vassa = m.vassa_years != null && m.vassa_years !== ''
        ? `<span class="monk-vassa">វស្សា ${toKhmer(m.vassa_years)}</span>`
        : '';
    return `
        <li>
            <div class="monk-row-top">
                <span class="monk-name">${esc(m.fullname)}</span>
                ${typePill}
            </div>
            <div class="monk-meta">
                ${pos}
                ${vassa}
            </div>
        </li>
    `;
}

function updateSummaryStats(stay, home, left) {
    const total = stay + home + left;
    document.getElementById('chip-stay').textContent = toKhmer(stay);
    document.getElementById('chip-home').textContent = toKhmer(home);
    document.getElementById('chip-left').textContent = toKhmer(left);
    document.getElementById('chip-total').textContent = toKhmer(total);
}

function setModalLoading(on) {
    const loading = document.getElementById('monk-loading');
    const cols = document.getElementById('monk-cols');
    loading.hidden = !on;
    cols.hidden = on;
    cols.style.visibility = '';
}

function fillList(elId, countId, monks) {
    const el = document.getElementById(elId);
    const countEl = document.getElementById(countId);
    countEl.textContent = monks.length;
    el.innerHTML = monks.length
        ? monks.map(monkItemHtml).join('')
        : '<li class="monk-empty">មិនមាន</li>';
}

function closeMonkModal() {
    document.getElementById('monk-modal').style.display = 'none';
    document.getElementById('export-menu').classList.remove('open');
    document.body.style.overflow = '';
    setModalLoading(false);
}

async function openMonkModal(residence) {
    const modal = document.getElementById('monk-modal');
    const title = document.getElementById('monk-modal-title');
    const sub = document.getElementById('monk-modal-sub');

    currentResidence = residence;
    currentLabel = '';
    title.textContent = 'កំពុងផ្ទុក…';
    sub.textContent = '';
    updateSummaryStats(0, 0, 0);
    fillList('list-left', 'count-left', []);
    fillList('list-home', 'count-home', []);
    fillList('list-stay', 'count-stay', []);
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setModalLoading(true);

    try {
        const res = await fetch(`/api/kuti-links/monks?residence=${encodeURIComponent(residence)}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'ផ្ទុកមិនបាន');

        const monks = json.monks || [];
        currentLabel = json.residence_label || residence;
        title.textContent = currentLabel;
        sub.textContent = 'បញ្ជីព្រះសង្ឃតាមស្ថានភាព';

        const stay = monks.filter(m => (m.living_status || STAY) === STAY);
        const left = monks.filter(m => m.living_status === LEFT);
        const home = monks.filter(m => m.living_status === HOME);

        updateSummaryStats(stay.length, home.length, left.length);
        fillList('list-stay', 'count-stay', stay);
        fillList('list-home', 'count-home', home);
        fillList('list-left', 'count-left', left);
    } catch (err) {
        title.textContent = 'មានបញ្ហា';
        sub.textContent = err.message;
    } finally {
        setModalLoading(false);
    }
}

async function _fetchKutiExportHtml() {
    if (!currentResidence) throw new Error('មិនមានកុដិ');
    const res = await fetch(
        `/api/kuti-status/export?residence=${encodeURIComponent(currentResidence)}&fmt=html`
    );
    if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || 'មិនអាចបង្កើតរបាយការណ៍បាន');
    }
    return res.text();
}

const _KUTI_EXPORT_W = 794; // A4 portrait @ ~96dpi (210mm)

async function _renderKutiHtmlToCanvas(html) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${_KUTI_EXPORT_W}px;border:0;`;
    document.body.appendChild(iframe);
    try {
        await new Promise((resolve) => {
            iframe.onload = resolve;
            iframe.srcdoc = html;
        });
        const doc = iframe.contentDocument;
        iframe.style.height = doc.documentElement.scrollHeight + 'px';
        await new Promise(r => setTimeout(r, 250));
        return await html2canvas(doc.body, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            windowWidth: _KUTI_EXPORT_W,
        });
    } finally {
        document.body.removeChild(iframe);
    }
}

async function _downloadKutiHtmlAsPdf(html, filename) {
    const canvas = await _renderKutiHtmlToCanvas(html);
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
    heightLeft -= pageH;
    while (heightLeft > 0) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= pageH;
    }
    pdf.save(filename);
}

function _kutiExportFilename(ext) {
    const day = new Date().toISOString().slice(0, 10);
    return `kuti_${safeFileName(currentLabel)}_${day}.${ext}`;
}

function _kutiPreviewOpts(formatLabel) {
    return {
        title: `បញ្ជីព្រះសង្ឃ — ${currentLabel || ''}`.trim(),
        subtitle: 'តាមស្ថានភាពស្នាក់នៅ · វត្តនិរោធរង្សី',
        formatLabel,
        hint: 'របាយការណ៍ផ្លូវការ — ពិនិត្យមុនទាញយក',
    };
}

async function exportImage() {
    const html = await _fetchKutiExportHtml();
    await ExportPreview.open({
        ..._kutiPreviewOpts('រូបភាព PNG'),
        preview: { type: 'html', html },
        onDownload: async () => {
            const canvas = await _renderKutiHtmlToCanvas(html);
            const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            ExportPreview.downloadBlob(blob, _kutiExportFilename('png'));
        },
    });
}

async function exportPdf() {
    const html = await _fetchKutiExportHtml();
    await ExportPreview.open({
        ..._kutiPreviewOpts('PDF'),
        preview: { type: 'html', html },
        onDownload: async () => {
            await _downloadKutiHtmlAsPdf(html, _kutiExportFilename('pdf'));
        },
    });
}

async function exportExcel() {
    if (!currentResidence) return;
    const html = await _fetchKutiExportHtml();
    const url = `/api/kuti-status/export?residence=${encodeURIComponent(currentResidence)}&fmt=excel`;
    await ExportPreview.open({
        ..._kutiPreviewOpts('Excel (.xlsx)'),
        preview: { type: 'html', html },
        onDownload: async () => { window.location.href = url; },
    });
}

async function loadStatus() {
    const body = document.getElementById('status-body');
    body.innerHTML = '<tr><td colspan="8" class="cell-empty">កំពុងផ្ទុក…</td></tr>';

    try {
        const res = await fetch('/api/kuti-status');
        const json = await res.json();
        if (!json.success) throw new Error(json.message || 'ផ្ទុកមិនបាន');

        statusLinks = json.links || [];
        missingLinks = json.missing || [];
        const s = json.summary || {};

        document.getElementById('sum-links').textContent = s.links ?? statusLinks.length;
        document.getElementById('sum-active').textContent = s.monks_active ?? '—';
        document.getElementById('sum-total').textContent = s.monks_total ?? '—';
        document.getElementById('sum-missing').textContent = s.missing ?? missingLinks.length;

        render();
    } catch (err) {
        body.innerHTML = `<tr><td colspan="8" class="cell-empty">${esc(err.message)}</td></tr>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-refresh').addEventListener('click', loadStatus);
    document.getElementById('status-search').addEventListener('input', e => applyFilter(e.target.value));
    document.getElementById('monk-close').addEventListener('click', closeMonkModal);
    document.getElementById('monk-backdrop').addEventListener('click', closeMonkModal);

    const exportDd = document.getElementById('export-dropdown');
    const exportMenu = document.getElementById('export-menu');
    const exportTrigger = document.getElementById('btn-export-trigger');

    exportTrigger.addEventListener('click', e => {
        e.stopPropagation();
        exportMenu.classList.toggle('open');
    });

    document.addEventListener('click', e => {
        if (!exportDd.contains(e.target)) exportMenu.classList.remove('open');
    });

    exportMenu.addEventListener('click', async e => {
        const item = e.target.closest('.export-item');
        if (!item || !currentResidence) return;
        const fmt = item.dataset.fmt;
        exportMenu.classList.remove('open');

        const orig = item.innerHTML;
        item.disabled = true;
        item.textContent = 'កំពុងបង្កើត…';

        try {
            if (fmt === 'excel') {
                await exportExcel();
            } else if (fmt === 'pdf') {
                await exportPdf();
            } else if (fmt === 'image') {
                await exportImage();
            }
        } catch (err) {
            alert(err.message || 'មិនអាចនាំចេញបាន');
        } finally {
            item.disabled = false;
            item.innerHTML = orig;
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeMonkModal();
    });

    document.body.addEventListener('click', e => {
        const clickable = e.target.closest('[data-residence]');
        if (!clickable) return;
        if (e.target.closest('a.btn-open')) return;
        if (e.target.closest('.export-dropdown')) return;
        openMonkModal(clickable.dataset.residence);
    });

    loadStatus();
});
