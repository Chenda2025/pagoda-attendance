(function () {
    'use strict';

    const form = document.getElementById('tg-settings-form');
    const tokenEl = document.getElementById('tg-token');
    const chatEl = document.getElementById('tg-chat');
    const labelEl = document.getElementById('tg-label');
    const enabledEl = document.getElementById('tg-enabled');
    const statusEl = document.getElementById('tg-status');
    const updatedEl = document.getElementById('tg-updated');
    const toastEl = document.getElementById('toast');
    const toggleBtn = document.getElementById('btn-toggle-token');

    let tokenTouched = false;

    function toast(msg, ok) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.className = 'tg-toast show' + (ok ? '' : ' err');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => { toastEl.className = 'tg-toast'; }, 2800);
    }

    function setStatus(cfg) {
        if (!statusEl) return;
        const textEl = statusEl.querySelector('.tg-status-text') || statusEl;
        let text;
        let cls = 'tg-settings-status';
        if (!cfg.enabled) {
            text = 'ផ្អាក — មិនផ្ញើ Telegram';
            cls += ' is-off';
        } else if (cfg.configured) {
            text = 'រួចរាល់ — Bot បានកំណត់';
            cls += ' is-ok';
        } else {
            text = 'មិនទាន់គ្រប់ — បញ្ចូល Token និង Chat ID';
            cls += ' is-off';
        }
        statusEl.className = cls;
        textEl.textContent = text;

        if (updatedEl) {
            updatedEl.textContent = cfg.updated_at
                ? `ធ្វើបច្ចុប្បន្នភាពចុងក្រោយ៖ ${String(cfg.updated_at).replace('T', ' ').slice(0, 19)}`
                : '';
        }
    }

    function setTokenVisibility(show) {
        tokenEl.type = show ? 'text' : 'password';
        if (!toggleBtn) return;
        const eye = toggleBtn.querySelector('.icon-eye');
        const eyeOff = toggleBtn.querySelector('.icon-eye-off');
        const label = toggleBtn.querySelector('.tg-eye-label');
        if (eye) eye.hidden = show;
        if (eyeOff) eyeOff.hidden = !show;
        if (label) label.textContent = show ? 'លាក់' : 'បង្ហាញ';
        toggleBtn.classList.toggle('is-shown', show);
        toggleBtn.setAttribute('aria-pressed', show ? 'true' : 'false');
        toggleBtn.setAttribute('aria-label', show ? 'លាក់ token' : 'បង្ហាញ token');
    }

    async function loadConfig() {
        try {
            const res = await fetch('/api/telegram-settings');
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'load failed');
            const cfg = data.config || {};
            labelEl.value = cfg.bot_label || '';
            chatEl.value = cfg.chat_id || '';
            enabledEl.checked = cfg.enabled !== false;
            tokenEl.value = '';
            tokenEl.placeholder = cfg.bot_token_set
                ? (cfg.bot_token || '•••• token មានរួច')
                : '123456:ABC-DEF...';
            tokenTouched = false;
            setTokenVisibility(false);
            setStatus(cfg);
        } catch (err) {
            toast(err.message || 'មិនអាចផ្ទុកបាន', false);
        }
    }

    tokenEl.addEventListener('input', () => { tokenTouched = true; });

    toggleBtn?.addEventListener('click', () => {
        setTokenVisibility(tokenEl.type === 'password');
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-save-tg');
        const prev = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.textContent = 'កំពុងរក្សាទុក...'; }
        try {
            const body = {
                chat_id: chatEl.value.trim(),
                bot_label: labelEl.value.trim(),
                enabled: enabledEl.checked,
            };
            if (tokenTouched && tokenEl.value.trim()) {
                body.bot_token = tokenEl.value.trim();
            }
            const res = await fetch('/api/telegram-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'save failed');
            toast('បានរក្សាទុកការកំណត់', true);
            await loadConfig();
        } catch (err) {
            toast(err.message || 'រក្សាទុកបរាជ័យ', false);
        } finally {
            if (btn) {
                btn.disabled = false;
                if (prev) btn.innerHTML = prev;
                else btn.textContent = 'រក្សាទុក';
            }
        }
    });

    document.getElementById('btn-test-tg')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-test-tg');
        const prev = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.textContent = 'កំពុងផ្ញើ...'; }
        try {
            const res = await fetch('/api/telegram-settings/test', { method: 'POST' });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'test failed');
            toast('បានផ្ញើសារសាកល្បងទៅ Telegram', true);
        } catch (err) {
            toast(err.message || 'ផ្ញើបរាជ័យ', false);
        } finally {
            if (btn) {
                btn.disabled = false;
                if (prev) btn.innerHTML = prev;
                else btn.textContent = 'ផ្ញើសារសាកល្បង';
            }
        }
    });

    loadConfig();
})();
