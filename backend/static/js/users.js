const MODULES = {
    entry:       'បញ្ចូលទិន្នន័យ',
    view:        'មើលទិន្នន័យ',
    layout:      'ប្លង់អាសនៈ',
    classroom_layout: 'ប្លងសាលាឆាន់',
    approve:     'អនុម័ត',
    report:      'របាយការណ៍',
    report_book: 'សៀវភៅរបាយការណ៍',
    kuti_links:  'តំណមេកុដិ',
    telegram_notify: 'កិច្ចសន្យា',
    users:       'គ្រប់គ្រងអ្នកប្រើ',
};

const ROLE_LABELS = {
    admin: 'អ្នកគ្រប់គ្រង',
    staff: 'បុគ្គលិក',
    user1: 'ប្លង់អាសនៈ',
    user2: 'របាយការណ៍',
};

const ACTION_LABELS = {
    login_password: 'ចូល (លេខសម្ងាត់)',
    login_face: 'ចូល (Face ID)',
    login_face_device_mismatch: 'ឧបករណ៍មិនត្រូវ',
    login_failed: 'ចូលបរាជ័យ',
    login_blocked: 'ចូលពេលគណនីផ្អាក',
    account_locked: 'គណនីត្រូវផ្អាក',
    account_unlocked: 'បើកគណនីឡើងវិញ',
    logout: 'ចាកចេញ',
    face_enroll: 'ចុះឈ្មោ៙ Face ID',
    user_create: 'បង្កើតគណនី',
    user_update: 'កែប្រែគណនី',
    user_delete: 'លុបគណនី',
    kuti_link_create: 'បង្កើតតំណមេកុដិ',
    kuti_link_delete: 'លុបតំណមេកុដិ',
    attendance_submit: 'បញ្ជូន Telegram',
};

const MODULE_LABELS = {
    auth: 'ចូល/ចេញ',
    users: 'គណនី',
    kuti_links: 'តំណមេកុដិ',
    layout: 'ប្លង់អាសនៈ',
};

let usersList = [];

function toast(msg, ok = true) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'usr-toast show ' + (ok ? 'ok' : 'err');
    setTimeout(() => el.classList.remove('show'), 3000);
}

function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildPermGrid(containerId, selected = []) {
    const el = document.getElementById(containerId);
    el.innerHTML = Object.entries(MODULES).map(([k, label]) => `
        <label class="perm-check">
            <input type="checkbox" value="${k}" ${selected.includes(k) ? 'checked' : ''}>
            <span>${label}</span>
        </label>
    `).join('');
}

function getSelectedPerms(containerId) {
    return [...document.querySelectorAll(`#${containerId} input:checked`)].map(c => c.value);
}

function permDropdown(perms) {
    if (!perms || !perms.length) {
        return '<span class="badge-muted">មិនមាន</span>';
    }
    const items = perms.map(p => `<li>${esc(MODULES[p] || p)}</li>`).join('');
    const count = perms.length;
    return `
        <details class="perm-drop">
            <summary class="perm-drop-btn" aria-label="មើលសិទ្ធិ">
                <span>${count} សិទ្ធិ</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </summary>
            <div class="perm-drop-menu">
                <p class="perm-drop-title">សិទ្ធិប្រើប្រាស់</p>
                <ul class="perm-drop-list">${items}</ul>
            </div>
        </details>
    `;
}

function closePermDrops(except) {
    document.querySelectorAll('.perm-drop[open]').forEach(el => {
        if (el !== except) el.removeAttribute('open');
    });
}

function roleBadge(role) {
    const label = ROLE_LABELS[role] || role;
    const cls = role === 'admin' ? 'badge-role-admin' : 'badge-role-staff';
    return `<span class="badge ${cls}">${esc(label)}</span>`;
}

function faceBadge(enrolled) {
    return enrolled
        ? '<span class="badge badge-face-yes">✓ រួចរាល់</span>'
        : '<span class="badge badge-face-no">⏳ រង់ចាំ</span>';
}

function statusBadge(u) {
    if (u.is_active) {
        return '<span class="badge badge-status-ok">សកម្ម</span>';
    }
    const reason = u.lock_reason || 'ត្រូវបានផ្អាក';
    return `<span class="badge badge-status-locked" title="${esc(reason)}">🔒 ផ្អាក</span>`;
}

function userInitial(name) {
    const s = String(name || '?').trim();
    return s ? s[0].toUpperCase() : '?';
}

function updateStats() {
    const locked = usersList.filter(u => !u.is_active).length;
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set('stat-total', usersList.length);
    set('stat-face', usersList.filter(u => u.face_enrolled).length);
    set('stat-admin', usersList.filter(u => u.role === 'admin').length);
    set('stat-locked', locked);

    const card = document.getElementById('stat-card-locked');
    if (card) card.classList.toggle('has-locked', locked > 0);
}

function formatDate(iso) {
    if (!iso) return '—';
    return iso.replace('T', ' ').slice(0, 16);
}

function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

function openModal() {
    document.getElementById('edit-modal').style.display = 'flex';
}

async function loadUsers() {
    const res = await fetch('/api/users');
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    usersList = json.users;

    const countEl = document.getElementById('user-count');
    if (countEl) countEl.textContent = `${usersList.length} អ្នកប្រើ`;
    updateStats();

    const body = document.getElementById('users-body');
    if (!usersList.length) {
        body.innerHTML = '<tr><td colspan="7" class="cell-empty">មិនមានគណនី</td></tr>';
        return;
    }

    body.innerHTML = usersList.map(u => `
        <tr class="${u.is_active ? '' : 'row-locked'}">
            <td class="user-cell-name" data-label="អ្នកប្រើ">
                <div class="user-cell-inner">
                    <span class="user-avatar-sm">${esc(userInitial(u.display_name || u.username))}</span>
                    <div>
                        <strong>${esc(u.display_name || u.username)}</strong>
                        <small>@${esc(u.username)}</small>
                    </div>
                </div>
            </td>
            <td data-label="តួនាទី">${roleBadge(u.role)}</td>
            <td class="perm-cell" data-label="សិទ្ធិ">${permDropdown(u.permissions)}</td>
            <td data-label="ស្ថានភាព">${statusBadge(u)}</td>
            <td class="col-hide-ipad" data-label="Face ID">${faceBadge(u.face_enrolled)}</td>
            <td class="col-hide-ipad" data-label="ចូលចុងក្រោយ"><small>${formatDate(u.last_login_at)}</small></td>
            <td class="cell-actions">
                ${u.is_active ? '' : `<button class="btn-icon unlock" data-unlock="${u.id}" data-name="${esc(u.username)}" title="បើកគណនីឡើងវិញ">🔓</button>`}
                <button class="btn-icon" data-edit="${u.id}" title="កែ">✎</button>
                <button class="btn-icon danger" data-del="${u.id}" data-name="${esc(u.username)}" title="លុប">🗑</button>
            </td>
        </tr>
    `).join('');
}

async function loadActivity() {
    const mod = document.getElementById('act-module-filter').value;
    const url = mod ? `/api/activity-log?module=${mod}&limit=200` : '/api/activity-log?limit=200';
    const res = await fetch(url);
    const json = await res.json();
    const body = document.getElementById('activity-body');

    const days = json.retention_days || 15;
    const badge = document.getElementById('retention-badge');
    if (badge) {
        badge.textContent = `រក្សាទុក ${days} ថ្ងៃ`;
        badge.title = `ទិន្នន័យចាស់ជាង ${days} ថ្ងៃត្រូវលុបដោយស្វ័យប្រវត្តិ`;
    }

    if (!json.success || !json.logs.length) {
        body.innerHTML = `<tr><td colspan="6" class="cell-empty">មិនមានប្រវត្តិ (${days} ថ្ងៃចុងក្រោយ)</td></tr>`;
        return;
    }

    body.innerHTML = json.logs.map(l => `
        <tr>
            <td data-label="ពេល"><small>${esc(l.created_at)}</small></td>
            <td data-label="អ្នកប្រើ"><strong>${esc(l.username || '—')}</strong></td>
            <td data-label="សកម្មភាព">${esc(ACTION_LABELS[l.action] || l.action)}</td>
            <td data-label="ម៉ូឌុល"><span class="badge badge-module">${esc(MODULE_LABELS[l.module] || l.module || '—')}</span></td>
            <td data-label="ព័ត៌មាន"><small>${esc(l.detail || '')}</small></td>
            <td class="col-hide-ipad" data-label="IP"><small>${esc(l.ip_address || '')}</small></td>
        </tr>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    buildPermGrid('new-perms');

    document.querySelectorAll('.users-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.users-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.users-tab-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
            if (tab.dataset.tab === 'activity') loadActivity();
        });
    });

    document.getElementById('create-user-form').addEventListener('submit', async e => {
        e.preventDefault();
        const btn = e.target.querySelector('.btn-create');
        btn.disabled = true;
        btn.textContent = 'កំពុងបង្កើត…';

        const body = {
            username: document.getElementById('new-username').value.trim(),
            password: document.getElementById('new-password').value,
            display_name: document.getElementById('new-display').value.trim(),
            role: document.getElementById('new-role').value,
            permissions: getSelectedPerms('new-perms'),
        };

        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            toast('បានបង្កើតគណនីជោគជ័យ');
            e.target.reset();
            buildPermGrid('new-perms');
            loadUsers();
        } catch (err) {
            toast(err.message, false);
        } finally {
            btn.disabled = false;
            btn.textContent = 'បង្កើតគណនី';
        }
    });

    document.getElementById('users-body').addEventListener('click', async e => {
        const permDrop = e.target.closest('.perm-drop');
        if (permDrop && e.target.closest('summary')) {
            e.preventDefault();
            const wasOpen = permDrop.hasAttribute('open');
            closePermDrops();
            if (!wasOpen) permDrop.setAttribute('open', '');
            return;
        }

        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-del]');
        const unlockBtn = e.target.closest('[data-unlock]');

        if (unlockBtn) {
            if (!confirm(`បើកគណនី "${unlockBtn.dataset.name}" ឡើងវិញ?`)) return;
            unlockBtn.disabled = true;
            try {
                const res = await fetch(`/api/users/${unlockBtn.dataset.unlock}/unlock`, { method: 'POST' });
                const json = await res.json();
                if (!json.success) throw new Error(json.message);
                toast('បានបើកគណនីឡើងវិញ');
                loadUsers();
            } catch (err) {
                toast(err.message, false);
                unlockBtn.disabled = false;
            }
            return;
        }

        if (editBtn) {
            const u = usersList.find(x => x.id === +editBtn.dataset.edit);
            if (!u) return;
            document.getElementById('edit-id').value = u.id;
            document.getElementById('edit-username').textContent = u.username;
            document.getElementById('edit-display').value = u.display_name || '';
            document.getElementById('edit-password').value = '';
            document.getElementById('edit-active').checked = u.is_active;
            buildPermGrid('edit-perms', u.permissions || []);
            openModal();
        }

        if (delBtn) {
            const name = delBtn.dataset.name;
            if (!confirm(`លុបគណនី "${name}"?`)) return;
            const res = await fetch(`/api/users/${delBtn.dataset.del}`, { method: 'DELETE' });
            const json = await res.json();
            if (!json.success) { toast(json.message, false); return; }
            toast('បានលុប');
            loadUsers();
        }
    });

    document.getElementById('edit-cancel').addEventListener('click', closeModal);
    document.getElementById('edit-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('edit-backdrop').addEventListener('click', closeModal);

    document.getElementById('edit-save').addEventListener('click', async () => {
        const id = document.getElementById('edit-id').value;
        const btn = document.getElementById('edit-save');
        btn.disabled = true;

        const body = {
            display_name: document.getElementById('edit-display').value.trim(),
            permissions: getSelectedPerms('edit-perms'),
            is_active: document.getElementById('edit-active').checked,
        };
        const pw = document.getElementById('edit-password').value;
        if (pw) body.password = pw;

        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            toast('បានរក្សាទុក');
            closeModal();
            loadUsers();
        } catch (err) {
            toast(err.message, false);
        } finally {
            btn.disabled = false;
        }
    });

    document.getElementById('act-module-filter').addEventListener('change', loadActivity);
    document.getElementById('btn-refresh-log').addEventListener('click', loadActivity);

    document.addEventListener('click', e => {
        if (!e.target.closest('.perm-drop')) closePermDrops();
    });

    loadUsers();
});
