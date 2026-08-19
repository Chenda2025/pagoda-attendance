(function () {
    'use strict';

    const KHMER = '០១២៣៤៥៦៧៨៩';
    const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);
    const API = `/api/kuti/${encodeURIComponent(KUTI_TOKEN)}/monks`;

    let allMonks = [];

    const tableBody = document.getElementById('table-body');
    const cards = document.getElementById('monk-cards');
    const monkModal = document.getElementById('monk-modal');
    const monkForm = document.getElementById('monk-form');
    const monkModalTitle = document.getElementById('monk-modal-title');
    const statusModal = document.getElementById('status-modal');

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function livingBadge(status) {
        const s = status || 'កំពុងស្នាក់នៅ';
        let cls = 'badge-living-active';
        if (s === 'ឈប់ស្នាក់នៅ') cls = 'badge-living-left';
        else if (s === 'នៅស្រុក') cls = 'badge-living-home';
        else if (s === 'ឈឺនៅពេទ្យ') cls = 'badge-living-sick-hosp';
        else if (s === 'ឈឺនៅស្រុក') cls = 'badge-living-sick-home';
        return `<span class="badge-living ${cls}">${escapeHtml(s)}</span>`;
    }

    function actionBtns(m) {
        return `
            <div class="row-actions">
                <button type="button" class="gov-btn btn-edit-monk" data-id="${m.id}">កែប្រែ</button>
                <button type="button" class="gov-btn gov-btn-gold btn-status-monk" data-id="${m.id}">ស្ថានភាព</button>
            </div>`;
    }

    function render(list) {
        const countEl = document.getElementById('member-count');
        if (countEl) countEl.textContent = `${toKhmer(list.length)} នាក់`;

        if (!list.length) {
            tableBody.innerHTML = '<tr><td colspan="7" class="muted">មិនមានព្រះសង្ឃក្នុងកុដិនេះ</td></tr>';
            cards.innerHTML = '<p class="muted card-empty">មិនមានព្រះសង្ឃក្នុងកុដិនេះ</p>';
            return;
        }

        tableBody.innerHTML = list.map((m, i) => {
            const pill = m.monk_type === 'ភិក្ខុ' ? 'type-bhikkhu' : 'type-samanera';
            const departed = m.living_status && m.living_status !== 'កំពុងស្នាក់នៅ';
            return `
                <tr class="${departed ? 'row-departed' : ''}">
                    <td>${toKhmer(i + 1)}</td>
                    <td><strong>${escapeHtml(m.fullname || '—')}</strong></td>
                    <td>${toKhmer(m.vassa_years ?? '—')}</td>
                    <td><span class="type-pill ${pill}">${escapeHtml(m.monk_type || '—')}</span></td>
                    <td>${escapeHtml(m.position || '—')}</td>
                    <td>${livingBadge(m.living_status)}</td>
                    <td>${actionBtns(m)}</td>
                </tr>`;
        }).join('');

        cards.innerHTML = list.map((m) => {
            const departed = m.living_status && m.living_status !== 'កំពុងស្នាក់នៅ';
            return `
                <article class="monk-card ${departed ? 'is-off' : ''}">
                    <div class="monk-card-top">
                        <strong>${escapeHtml(m.fullname || '—')}</strong>
                        ${livingBadge(m.living_status)}
                    </div>
                    <p class="monk-card-meta">
                        ${escapeHtml(m.monk_type || '—')} · វស្សា ${toKhmer(m.vassa_years ?? '—')}<br>
                        ${escapeHtml(m.position || '—')}
                    </p>
                    ${actionBtns(m)}
                </article>`;
        }).join('');
    }

    async function load() {
        tableBody.innerHTML = '<tr><td colspan="7" class="muted">កំពុងផ្ទុក...</td></tr>';
        cards.innerHTML = '<p class="muted card-empty">កំពុងផ្ទុក...</p>';
        try {
            const res = await fetch(API);
            const data = await res.json();
            if (!data.success) {
                tableBody.innerHTML =
                    `<tr><td colspan="7" class="muted">${escapeHtml(data.message || 'មិនអាចផ្ទុកបាន')}</td></tr>`;
                cards.innerHTML = `<p class="muted card-empty">${escapeHtml(data.message || 'មិនអាចផ្ទុកបាន')}</p>`;
                return;
            }
            allMonks = data.monks || [];
            applyFilter();
        } catch (_) {
            tableBody.innerHTML = '<tr><td colspan="7" class="muted">មិនអាចផ្ទុកបាន</td></tr>';
            cards.innerHTML = '<p class="muted card-empty">មិនអាចផ្ទុកបាន</p>';
        }
    }

    function applyFilter() {
        const search = document.getElementById('search');
        const q = (search && search.value.trim().toLowerCase()) || '';
        if (!q) {
            render(allMonks);
            return;
        }
        render(allMonks.filter((m) => (m.fullname || '').toLowerCase().includes(q)));
    }

    function openMonkModal(mode, monk) {
        monkForm.reset();
        document.getElementById('monk-id').value = '';
        document.getElementById('monk-residence').value = KUTI_RESIDENCE;

        if (window.FormOptions) {
            FormOptions.fillSelect(document.getElementById('monk-type'), 'monk_type', monk && monk.monk_type);
            FormOptions.fillSelect(document.getElementById('monk-position'), 'position', monk && monk.position);
            FormOptions.fillSelect(document.getElementById('monk-education'), 'education_level', monk && monk.education_level);
            FormOptions.fillSelect(document.getElementById('monk-academic'), 'academic_year', monk && monk.academic_year);
        }

        if (mode === 'edit' && monk) {
            monkModalTitle.textContent = 'កែប្រែទិន្នន័យ';
            document.getElementById('monk-id').value = monk.id;
            document.getElementById('monk-fullname').value = monk.fullname || '';
            document.getElementById('monk-vassa').value = monk.vassa_years ?? 0;
            document.getElementById('monk-type').value = monk.monk_type || '';
            document.getElementById('monk-position').value = monk.position || '';
            document.getElementById('monk-education').value = monk.education_level || '';
            document.getElementById('monk-academic').value = monk.academic_year || '';
            document.getElementById('monk-living').value = monk.living_status || 'កំពុងស្នាក់នៅ';
        } else {
            monkModalTitle.textContent = 'បន្ថែមទិន្នន័យ';
            document.getElementById('monk-living').value = 'កំពុងស្នាក់នៅ';
        }
        monkModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeMonkModal() {
        monkModal.hidden = true;
        document.body.style.overflow = '';
    }

    function openStatusModal(monk) {
        document.getElementById('status-monk-id').value = monk.id;
        document.getElementById('status-monk-name').textContent = monk.fullname || '';
        statusModal.querySelectorAll('.status-option-btn').forEach((btn) => {
            btn.classList.toggle('is-current', btn.dataset.status === monk.living_status);
        });
        statusModal.hidden = false;
        document.body.style.overflow = 'hidden';
    }

    function closeStatusModal() {
        statusModal.hidden = true;
        document.body.style.overflow = '';
    }

    document.getElementById('btn-add-monk').addEventListener('click', () => openMonkModal('add'));

    monkModal.querySelectorAll('[data-close-modal]').forEach((el) => {
        el.addEventListener('click', closeMonkModal);
    });
    statusModal.querySelectorAll('[data-close-status]').forEach((el) => {
        el.addEventListener('click', closeStatusModal);
    });

    monkForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('monk-id').value;
        const payload = {
            fullname: document.getElementById('monk-fullname').value.trim(),
            'total-monk': Number(document.getElementById('monk-vassa').value),
            type: document.getElementById('monk-type').value,
            home: KUTI_RESIDENCE,
            position: document.getElementById('monk-position').value,
            education_level: document.getElementById('monk-education').value,
            academic_level: document.getElementById('monk-academic').value,
            living_status: document.getElementById('monk-living').value,
        };
        if (!payload.fullname) {
            alert('សូមបញ្ចូលឈ្មោះ');
            return;
        }
        const btn = document.getElementById('monk-save-btn');
        btn.disabled = true;
        try {
            const res = await fetch(id ? `${API}/${id}` : API, {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message || 'បរាជ័យ');
                return;
            }
            closeMonkModal();
            if (data.pending) {
                alert(data.message || 'បានដាក់ស្នើ — រង់ចាំអនុម័តពីអ្នកគ្រប់គ្រង');
            } else {
                await load();
            }
        } catch (_) {
            alert('មិនអាចរក្សាទុកបាន');
        } finally {
            btn.disabled = false;
        }
    });

    statusModal.addEventListener('click', async (e) => {
        const btn = e.target.closest('.status-option-btn');
        if (!btn) return;
        const id = document.getElementById('status-monk-id').value;
        const living_status = btn.dataset.status;
        btn.disabled = true;
        try {
            const res = await fetch(`${API}/${id}/living-status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ living_status }),
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message || 'បរាជ័យ');
                return;
            }
            closeStatusModal();
            await load();
        } catch (_) {
            alert('មិនអាចប្តូរស្ថានភាពបាន');
        } finally {
            btn.disabled = false;
        }
    });

    function onAction(e) {
        const editBtn = e.target.closest('.btn-edit-monk');
        if (editBtn) {
            const monk = allMonks.find((m) => String(m.id) === String(editBtn.dataset.id));
            if (monk) openMonkModal('edit', monk);
            return;
        }
        const stBtn = e.target.closest('.btn-status-monk');
        if (stBtn) {
            const monk = allMonks.find((m) => String(m.id) === String(stBtn.dataset.id));
            if (monk) openStatusModal(monk);
        }
    }

    tableBody.addEventListener('click', onAction);
    cards.addEventListener('click', onAction);

    const search = document.getElementById('search');
    if (search) search.addEventListener('input', applyFilter);

    /* ---- Export ---- */
    const EXPORT_API = `/api/kuti/${encodeURIComponent(KUTI_TOKEN)}/export`;
    const exportDd = document.getElementById('export-dropdown');
    const exportMenu = document.getElementById('export-menu');
    const exportTrigger = document.getElementById('btn-export-trigger');

    exportTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!exportDd.contains(e.target)) exportMenu.classList.remove('open');
    });

    async function downloadHtmlAsPdf(html, filename) {
        // A4 portrait at ~96dpi: 210mm ≈ 794px
        const A4_W_PX = 794;
        const iframe = document.createElement('iframe');
        iframe.style.cssText = `position:fixed;top:-99999px;left:-99999px;width:${A4_W_PX}px;border:0;`;
        document.body.appendChild(iframe);
        try {
            await new Promise((resolve) => {
                iframe.onload = resolve;
                iframe.srcdoc = html;
            });
            const doc = iframe.contentDocument;
            const pageEl = doc.querySelector('.page') || doc.body;
            iframe.style.height = `${pageEl.scrollHeight}px`;
            await new Promise((r) => setTimeout(r, 300));

            const canvas = await html2canvas(pageEl, {
                scale: 2,
                useCORS: true,
                backgroundColor: '#ffffff',
                windowWidth: A4_W_PX,
            });

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageW = pdf.internal.pageSize.getWidth();   // 210
            const pageH = pdf.internal.pageSize.getHeight();  // 297
            const margin = 10; // mm
            const maxW = pageW - margin * 2;
            const maxH = pageH - margin * 2;

            const imgRatio = canvas.height / canvas.width;
            let imgW = maxW;
            let imgH = imgW * imgRatio;

            // Fit within printable area; keep aspect ratio
            if (imgH > maxH) {
                imgH = maxH;
                imgW = imgH / imgRatio;
            }

            const imgData = canvas.toDataURL('image/jpeg', 0.95);

            // Single-page content: center on A4
            if (imgH <= maxH + 0.1) {
                const x = (pageW - imgW) / 2;
                const y = (pageH - imgH) / 2;
                pdf.addImage(imgData, 'JPEG', x, y, imgW, imgH);
                pdf.save(filename);
                return;
            }

            // Multi-page: full width, centered horizontally, top margins
            imgW = maxW;
            imgH = imgW * imgRatio;
            const x = (pageW - imgW) / 2;
            let heightLeft = imgH;
            let position = margin;
            pdf.addImage(imgData, 'JPEG', x, position, imgW, imgH);
            heightLeft -= maxH;

            while (heightLeft > 0) {
                position = margin - (imgH - heightLeft);
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', x, position, imgW, imgH);
                heightLeft -= maxH;
            }
            pdf.save(filename);
        } finally {
            document.body.removeChild(iframe);
        }
    }

    exportMenu.addEventListener('click', async (e) => {
        const item = e.target.closest('.export-item');
        if (!item) return;
        const fmt = item.dataset.fmt;
        exportMenu.classList.remove('open');

        const orig = item.innerHTML;
        item.disabled = true;
        item.textContent = 'កំពុងបង្កើត...';

        try {
            const day = new Date().toISOString().slice(0, 10);

            if (fmt === 'docx' || fmt === 'excel') {
                const res = await fetch(`${EXPORT_API}?fmt=html`);
                if (!res.ok) throw new Error('មិនអាចនាំចេញបាន');
                const html = await res.text();
                await ExportPreview.open({
                    title: KUTI_RESIDENCE || 'បញ្ជីព្រះសង្ឃ',
                    subtitle: `ថ្ងៃ ${day}`,
                    formatLabel: fmt === 'excel' ? 'Excel (.xlsx)' : 'Word (.docx)',
                    preview: { type: 'html', html },
                    onDownload: async () => {
                        window.location.href = `${EXPORT_API}?fmt=${fmt}`;
                    },
                });
                return;
            }

            if (fmt === 'pdf') {
                const res = await fetch(`${EXPORT_API}?fmt=html`);
                if (!res.ok) throw new Error('មិនអាចនាំចេញបាន');
                const html = await res.text();
                await ExportPreview.open({
                    title: KUTI_RESIDENCE || 'បញ្ជីព្រះសង្ឃ',
                    subtitle: `ថ្ងៃ ${day}`,
                    formatLabel: 'PDF',
                    preview: { type: 'html', html },
                    onDownload: async () => {
                        await downloadHtmlAsPdf(html, `kuti_${day}.pdf`);
                    },
                });
            }
        } catch (err) {
            alert(err.message || 'មិនអាចបង្កើតឯកសារបាន');
        } finally {
            item.disabled = false;
            item.innerHTML = orig;
        }
    });

    if (window.FormOptions) {
        FormOptions.load()
            .then(() => FormOptions.applyAll(document))
            .catch(() => {});
    }
    load();
})();
