(function () {
    'use strict';

    const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
    const DAYS_KM = ['អាទិត្យ', 'ច័ន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
    const MONTHS_KM = [
        'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
        'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
    ];

    function toKhmerNum(n) {
        return String(n).replace(/\d/g, (d) => KHMER_DIGITS[d]);
    }

    function formatSolar(iso) {
        if (!iso) return '—';
        const d = new Date(iso + 'T00:00:00');
        if (Number.isNaN(d.getTime())) return iso;
        const day = toKhmerNum(d.getDate());
        const month = MONTHS_KM[d.getMonth()];
        const year = toKhmerNum(d.getFullYear());
        const weekday = DAYS_KM[d.getDay()];
        return `ថ្ងៃ${weekday} ទី${day} ខែ${month} ឆ្នាំ${year}`;
    }

    function formatShortDate(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        return `${toKhmerNum(d.getDate())}/${toKhmerNum(d.getMonth() + 1)}/${toKhmerNum(d.getFullYear())}`;
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function animateCount(el, target) {
        if (!el) return;
        const end = Number(target) || 0;
        const start = 0;
        const duration = 550;
        const t0 = performance.now();

        function frame(now) {
            const p = Math.min(1, (now - t0) / duration);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = toKhmerNum(Math.round(start + (end - start) * eased));
            if (p < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function renderBars(list, maxTotal) {
        const root = document.getElementById('residence-list');
        if (!root) return;
        if (!list.length) {
            root.innerHTML = '<div class="empty-state">មិនមានទិន្នន័យ</div>';
            return;
        }
        const max = Math.max(1, maxTotal || Math.max(...list.map((x) => x.count)));
        root.innerHTML = list.map((item) => {
            const pct = Math.round((item.count / max) * 100);
            return `
                <div class="bar-row">
                    <div class="bar-meta">
                        <strong>${escapeHtml(item.name)}</strong>
                        <span>${toKhmerNum(item.count)}</span>
                    </div>
                    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
                </div>`;
        }).join('');
        // trigger width transition
        requestAnimationFrame(() => {
            root.querySelectorAll('.bar-fill').forEach((bar) => {
                const w = bar.style.width;
                bar.style.width = '0';
                requestAnimationFrame(() => { bar.style.width = w; });
            });
        });
    }

    function renderEducation(list) {
        const root = document.getElementById('education-list');
        if (!root) return;
        if (!list.length) {
            root.innerHTML = '<div class="empty-state">មិនមានទិន្នន័យ</div>';
            return;
        }
        root.innerHTML = list.map((item) => `
            <span class="edu-chip">
                ${escapeHtml(item.name)}
                <em>${toKhmerNum(item.count)}</em>
            </span>`).join('');
    }

    function renderRecent(rows) {
        const body = document.getElementById('recent-body');
        if (!body) return;
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="empty-state">មិនទាន់មានទិន្នន័យ</td></tr>';
            return;
        }
        body.innerHTML = rows.map((row, i) => {
            const isBhikkhu = row.monk_type === 'ភិក្ខុ';
            const pillClass = isBhikkhu ? 'type-bhikkhu' : 'type-samanera';
            return `
                <tr>
                    <td>${toKhmerNum(i + 1)}</td>
                    <td>${escapeHtml(row.fullname || '—')}</td>
                    <td><span class="type-pill ${pillClass}">${escapeHtml(row.monk_type || '—')}</span></td>
                    <td>${escapeHtml(row.position || '—')}</td>
                    <td>${formatShortDate(row.created_at)}</td>
                </tr>`;
        }).join('');
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function updateClock() {
        const el = document.getElementById('footer-clock');
        if (!el) return;
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        el.textContent = `ម៉ោង ${toKhmerNum(h)}:${toKhmerNum(m)}`;
    }

    async function loadDashboard() {
        try {
            const res = await fetch('/api/dashboard/stats');
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'failed');

            const s = data.stats || {};
            animateCount(document.getElementById('stat-total'), s.total);
            animateCount(document.getElementById('stat-bhikkhu'), s.bhikkhu);
            animateCount(document.getElementById('stat-samanera'), s.samanera);
            animateCount(document.getElementById('stat-pending'), s.pending);
            animateCount(document.getElementById('stat-present'), s.present_today);
            animateCount(
                document.getElementById('stat-absent'),
                (s.absent_today || 0) + (s.permission_today || 0)
            );

            setText('solar-date', formatSolar(data.date));
            setText('lunar-date', data.lunar || '—');

            const badge = document.getElementById('pending-badge');
            const approveCard = document.getElementById('mod-approve');
            if (badge && s.pending > 0) {
                badge.style.display = 'grid';
                badge.textContent = toKhmerNum(s.pending);
                if (approveCard) approveCard.classList.add('has-pending');
            }

            renderBars(data.by_residence || [], s.total);
            renderEducation(data.by_education || []);
            renderRecent(data.recent || []);
        } catch (err) {
            console.error(err);
            setText('stat-total', '—');
            document.getElementById('residence-list').innerHTML =
                '<div class="empty-state">មិនអាចផ្ទុកស្ថិតិបាន</div>';
            document.getElementById('education-list').innerHTML =
                '<div class="empty-state">—</div>';
            document.getElementById('recent-body').innerHTML =
                '<tr><td colspan="5" class="empty-state">មិនអាចផ្ទុកបាន</td></tr>';
        }
    }

    updateClock();
    setInterval(updateClock, 30000);
    loadDashboard();
})();
