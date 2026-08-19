/** Log out after 15 minutes with no click / key / mouse / touch. */
(function () {
    const IDLE_MS = 15 * 60 * 1000;
    const PING_MS = 60 * 1000;
    let lastPing = 0;
    let timer = null;

    function logoutIdle() {
        window.location.href = '/logout?idle=1';
    }

    function ping() {
        const now = Date.now();
        if (now - lastPing < PING_MS) return;
        lastPing = now;
        fetch('/api/auth/idle-ping', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
        }).then((res) => {
            if (res.status === 401) logoutIdle();
        }).catch(() => {});
    }

    function bump() {
        clearTimeout(timer);
        timer = setTimeout(logoutIdle, IDLE_MS);
        ping();
    }

    ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((ev) => {
        document.addEventListener(ev, bump, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) bump();
    });
    bump();
})();
