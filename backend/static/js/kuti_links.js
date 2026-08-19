(function () {
    'use strict';

    const body = document.getElementById('links-body');
    const cards = document.getElementById('links-cards');
    const form = document.getElementById('create-form');
    const residenceEl = document.getElementById('residence');
    const labelEl = document.getElementById('label');
    const leaderHint = document.getElementById('leader-hint');
    const newBox = document.getElementById('new-link-box');
    const newUrl = document.getElementById('new-link-url');
    const linksCountEl = document.getElementById('links-count');

    const KHMER = '០១២៣៤៥៦៧៨៩';
    const toKhmer = (n) => String(n).replace(/\d/g, (d) => KHMER[d]);

    function setLinksCount(n) {
        if (!linksCountEl) return;
        if (typeof n !== 'number') {
            linksCountEl.textContent = '—';
            return;
        }
        linksCountEl.textContent = `${toKhmer(n)} តំណ`;
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        }
    }

    function resetLeaderSelect(placeholder) {
        labelEl.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
        labelEl.disabled = true;
        leaderHint.textContent = '';
    }

    async function loadLeaders(residence) {
        if (!residence) {
            resetLeaderSelect('-- ជ្រើសរើសកុដិជាមុន --');
            return;
        }
        labelEl.disabled = true;
        labelEl.innerHTML = '<option value="">កំពុងផ្ទុក...</option>';
        leaderHint.textContent = '';
        try {
            const res = await fetch(`/api/kuti-links/leaders?residence=${encodeURIComponent(residence)}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'fail');
            const leaders = data.leaders || [];
            const mekuti = leaders.filter((l) => l.position === 'មេកុដិ');
            const anukuti = leaders.filter((l) => l.position === 'អនុកុដិ');

            if (!leaders.length) {
                labelEl.innerHTML = '<option value="">— មិនមានមេកុដិក្នុងកុដិនេះ —</option>';
                labelEl.disabled = true;
                leaderHint.textContent = 'មិនទាន់មានព្រះសង្ឃតួនាទីមេកុដិក្នុងកុដិនេះ។';
                return;
            }

            let html = '<option value="">-- ជ្រើសរើសមេកុដិ --</option>';
            if (mekuti.length) {
                html += '<optgroup label="មេកុដិ">';
                mekuti.forEach((l) => {
                    html += `<option value="${escapeHtml(l.fullname)}">${escapeHtml(l.fullname)}</option>`;
                });
                html += '</optgroup>';
            }
            if (anukuti.length) {
                html += '<optgroup label="អនុកុដិ">';
                anukuti.forEach((l) => {
                    html += `<option value="${escapeHtml(l.fullname)}">${escapeHtml(l.fullname)} (អនុកុដិ)</option>`;
                });
                html += '</optgroup>';
            }
            labelEl.innerHTML = html;
            labelEl.disabled = false;

            if (mekuti.length) {
                labelEl.value = mekuti[0].fullname;
                leaderHint.textContent = `បានជ្រើសរើសស្វ័យប្រវត្តិ៖ ${mekuti[0].fullname}`;
            } else {
                leaderHint.textContent = 'មិនមានមេកុដិ — អាចជ្រើសអនុកុដិ។';
            }
        } catch (_) {
            resetLeaderSelect('-- មិនអាចផ្ទុកបាន --');
            leaderHint.textContent = 'មិនអាចផ្ទុកបញ្ជីមេកុដិបាន។';
        }
    }

    residenceEl.addEventListener('change', () => {
        loadLeaders(residenceEl.value);
    });

    const TRASH_ICON = `
        <svg class="icon-trash" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a1 1 0 0 0 1-1V8H5v12a1 1 0 0 0 1 1z"/>
        </svg>`;

    function actionButtons(l) {
        const copy = l.is_active
            ? `<button type="button" class="gov-btn gov-btn-gold btn-copy" data-url="${escapeHtml(l.url)}">ចម្លង</button>`
            : '';
        const remove = `
            <button type="button" class="btn-icon-remove btn-remove" data-id="${l.id}"
                title="លុបតំណ" aria-label="លុបតំណ">
                ${TRASH_ICON}
            </button>`;
        return `<div class="row-actions">${copy}${remove}</div>`;
    }

    function renderLinks(links) {
        setLinksCount(links.length);

        if (!links.length) {
            body.innerHTML = '<tr><td colspan="5" class="muted">មិនទាន់មានតំណ — បង្កើតខាងលើ</td></tr>';
            cards.innerHTML = '<p class="muted card-empty">មិនទាន់មានតំណ — បង្កើតខាងលើ</p>';
            return;
        }

        body.innerHTML = links.map((l) => `
            <tr>
                <td><strong>${escapeHtml(l.residence_label)}</strong></td>
                <td>${escapeHtml(l.label || '—')}</td>
                <td class="url-cell" title="${escapeHtml(l.url)}">${escapeHtml(l.url)}</td>
                <td>${l.is_active
                    ? '<span class="badge-on">សកម្ម</span>'
                    : '<span class="badge-off">បិទ</span>'}</td>
                <td>${actionButtons(l)}</td>
            </tr>
        `).join('');

        cards.innerHTML = links.map((l) => `
            <article class="link-card ${l.is_active ? '' : 'is-off'}">
                <div class="link-card-top">
                    <strong class="link-card-kuti">${escapeHtml(l.residence_label)}</strong>
                    <div class="link-card-badges">
                        ${l.is_active
                            ? '<span class="badge-on">សកម្ម</span>'
                            : '<span class="badge-off">បិទ</span>'}
                        <button type="button" class="btn-icon-remove btn-remove" data-id="${l.id}"
                            title="លុបតំណ" aria-label="លុបតំណ">
                            ${TRASH_ICON}
                        </button>
                    </div>
                </div>
                <p class="link-card-leader"><span>មេកុដិ</span> ${escapeHtml(l.label || '—')}</p>
                <p class="link-card-url" title="${escapeHtml(l.url)}">${escapeHtml(l.url)}</p>
                ${l.is_active ? `
                    <div class="row-actions">
                        <button type="button" class="gov-btn gov-btn-gold btn-copy" data-url="${escapeHtml(l.url)}">ចម្លង</button>
                    </div>
                ` : ''}
            </article>
        `).join('');
    }

    async function loadLinks() {
        setLinksCount(null);
        body.innerHTML = '<tr><td colspan="5" class="muted">កំពុងផ្ទុក...</td></tr>';
        cards.innerHTML = '<p class="muted card-empty">កំពុងផ្ទុក...</p>';
        try {
            const res = await fetch('/api/kuti-links');
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'fail');
            renderLinks(data.links || []);
        } catch (e) {
            setLinksCount(null);
            body.innerHTML = '<tr><td colspan="5" class="muted">មិនអាចផ្ទុកបាន</td></tr>';
            cards.innerHTML = '<p class="muted card-empty">មិនអាចផ្ទុកបាន</p>';
        }
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const residence = residenceEl.value;
        const label = labelEl.value.trim();
        if (!residence) return;
        if (!label) {
            alert('សូមជ្រើសរើសឈ្មោះមេកុដិ');
            return;
        }
        const btn = document.getElementById('btn-create');
        btn.disabled = true;
        try {
            const res = await fetch('/api/kuti-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ residence, label }),
            });
            const data = await res.json();
            if (!data.success) {
                alert(data.message || 'បរាជ័យ');
                return;
            }
            newUrl.value = data.link.url;
            newBox.style.display = 'block';
            await copyText(data.link.url);
            await loadLinks();
        } catch (_) {
            alert('មិនអាចបង្កើតតំណបាន');
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('btn-copy-new').addEventListener('click', async () => {
        const ok = await copyText(newUrl.value);
        alert(ok ? 'បានចម្លងតំណ!' : 'សូមចម្លងដោយដៃ');
    });

    document.getElementById('btn-refresh').addEventListener('click', loadLinks);

    function onActionClick(e) {
        const copyBtn = e.target.closest('.btn-copy');
        if (copyBtn) {
            copyText(copyBtn.dataset.url).then((ok) => {
                alert(ok ? 'បានចម្លងតំណ!' : 'សូមចម្លងដោយដៃ');
            });
            return;
        }
        const remBtn = e.target.closest('.btn-remove');
        if (remBtn) {
            if (!confirm('លុបតំណនេះ? មេកុដិនឹងមិនអាចចូលបានទៀតទេ។')) return;
            fetch(`/api/kuti-links/${remBtn.dataset.id}`, { method: 'DELETE' })
                .then((res) => res.json())
                .then((data) => {
                    if (!data.success) alert(data.message || 'មិនអាចលុបបាន');
                    loadLinks();
                })
                .catch(() => alert('មិនអាចលុបបាន'));
        }
    }

    body.addEventListener('click', onActionClick);
    cards.addEventListener('click', onActionClick);

    loadLinks();
})();
