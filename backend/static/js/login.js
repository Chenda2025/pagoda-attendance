/** Face ID style login: tap to scan, password fallback after 3 failures. */
const MAX_FACE_ATTEMPTS = 3;

document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('face-video');
    const ticks = document.getElementById('login-ticks');
    const heading = document.getElementById('face-heading');
    const statusEl = document.getElementById('face-status');
    const failHint = document.getElementById('face-fail-hint');
    const introPanel = document.getElementById('face-intro');
    const introError = document.getElementById('face-intro-error');
    const btnStartFace = document.getElementById('btn-start-face');
    const facePanel = document.getElementById('face-panel');
    const scanRing = facePanel.querySelector('.fid-ring-wrap');
    const passPanel = document.getElementById('password-panel');
    const errBox = document.getElementById('login-error');
    const errText = document.getElementById('login-error-text');

    buildTickRing(ticks);
    buildTickRing(document.getElementById('intro-ticks'));

    let stream = null;
    let running = false;
    let verifying = false;
    let failCount = 0;
    let sweepIndex = 0;
    let sweepTimer = null;

    function showError(msg) {
        errText.textContent = msg;
        errBox.style.display = 'flex';
    }

    function hideError() {
        errBox.style.display = 'none';
    }

    function startSweep() {
        stopSweep();
        sweepTimer = setInterval(() => {
            resetTicks(ticks);
            for (let i = 0; i < 6; i++) {
                setTickState(ticks, (sweepIndex + i) % TICK_COUNT, 'active');
            }
            sweepIndex = (sweepIndex + 1) % TICK_COUNT;
        }, 45);
    }

    function stopSweep() {
        if (sweepTimer) clearInterval(sweepTimer);
        sweepTimer = null;
    }

    function fillAllTicks() {
        stopSweep();
        resetTicks(ticks);
        ticks.querySelectorAll('.fid-tick').forEach(t => t.classList.add('lit'));
        scanRing.classList.add('fid-ok');
    }

    function resetStartButton() {
        btnStartFace.disabled = false;
        btnStartFace.textContent = 'ស្កេនមុខ';
    }

    function showIntroPanel(reason) {
        running = false;
        stopSweep();
        stopCamera(stream);
        resetTicks(ticks);
        scanRing.classList.remove('fid-ok');
        introPanel.style.display = 'flex';
        facePanel.style.display = 'none';
        passPanel.style.display = 'none';
        introError.textContent = reason || '';
        resetStartButton();
    }

    function showPasswordPanel(reason) {
        running = false;
        stopSweep();
        stopCamera(stream);
        introPanel.style.display = 'none';
        facePanel.style.display = 'none';
        passPanel.style.display = 'flex';
        // Carried to the server so a lockout alert can report the Face ID failures too
        const faceField = document.getElementById('pw-face-fails');
        if (faceField && failCount > 0) faceField.value = String(failCount);
        if (reason) showError(reason);
    }

    /** Account disabled by the server — no retry is possible until an admin unlocks it. */
    function showLocked(message) {
        running = false;
        stopSweep();
        stopCamera(stream);
        resetTicks(ticks);
        introPanel.style.display = 'none';
        facePanel.style.display = 'none';
        passPanel.style.display = 'none';
        showError(message || 'គណនីត្រូវបានផ្អាក — សូមទាក់ទងអ្នកគ្រប់គ្រង');
        errBox.classList.add('login-error-locked');
    }

    async function verify(detection) {
        verifying = true;
        heading.textContent = 'កំពុងផ្ទៀងផ្ទាត់…';
        try {
            const res = await fetch('/api/auth/face-login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Id': getDeviceId(),
                },
                body: JSON.stringify({
                    descriptor: Array.from(detection.descriptor),
                    device_id: getDeviceId(),
                }),
            });
            const json = await res.json();

            if (json.success) {
                running = false;
                fillAllTicks();
                heading.textContent = 'ស្គាល់មុខហើយ';
                statusEl.textContent = 'កំពុងចូលប្រព័ន្ធ…';
                setTimeout(() => { window.location.href = json.redirect || '/'; }, 500);
                return;
            }

            if (json.locked) {
                showLocked(json.message);
                return;
            }

            // Known face on a new browser — password once, then it is trusted again
            if (json.need_password) {
                showPasswordPanel(json.message || 'សូមបញ្ចូលឈ្មោះ និងលេខសម្ងាត់');
                return;
            }

            failCount++;
            failHint.textContent = `មិនស្គាល់មុខ — ព្យាយាម ${failCount}/${MAX_FACE_ATTEMPTS}`;
            if (failCount >= MAX_FACE_ATTEMPTS) {
                showPasswordPanel('មិនស្គាល់មុខ — សូមបញ្ចូលឈ្មោះ និងលេខសម្ងាត់');
                return;
            }
            await new Promise(r => setTimeout(r, 1200));
        } catch (e) {
            failCount++;
            failHint.textContent = `មានបញ្ហាបណ្តាញ — ព្យាយាម ${failCount}/${MAX_FACE_ATTEMPTS}`;
            if (failCount >= MAX_FACE_ATTEMPTS) {
                showPasswordPanel('សូមបញ្ចូលឈ្មោះ និងលេខសម្ងាត់');
                return;
            }
        } finally {
            verifying = false;
        }
    }

    async function loop() {
        if (!running) return;
        if (!verifying) {
            try {
                const detection = await detectFace(video);
                if (detection) {
                    await verify(detection);
                } else {
                    heading.textContent = 'Face ID';
                    statusEl.textContent = 'ដាក់មុខក្នុងស៊ុម';
                }
            } catch (e) {
                /* keep scanning */
            }
        }
        if (running) requestAnimationFrame(loop);
    }

    async function initFace() {
        hideError();
        introError.textContent = '';
        btnStartFace.disabled = true;
        btnStartFace.textContent = 'កំពុងបើកកាមេរ៉ា…';
        heading.textContent = 'Face ID';
        statusEl.textContent = 'កំពុងផ្ទុកម៉ូឌែល…';
        try {
            await loadFaceModels();
            introPanel.style.display = 'none';
            facePanel.style.display = 'flex';
            passPanel.style.display = 'none';
            stream = await startCamera(video);
            statusEl.textContent = 'ដាក់មុខក្នុងស៊ុម';
            startSweep();
            running = true;
            loop();
        } catch (e) {
            showIntroPanel('មិនអាចបើកកាមេរ៉ា — សូមអនុញ្ញាតកាមេរ៉ា ឬប្រើលេខសម្ងាត់');
            return;
        }
        resetStartButton();
    }

    function startFaceScan() {
        failCount = 0;
        failHint.textContent = '';
        initFace();
    }

    btnStartFace.addEventListener('click', startFaceScan);
    document.getElementById('btn-face-ring').addEventListener('click', startFaceScan);
    document.getElementById('btn-intro-password').addEventListener('click', () => showPasswordPanel(''));
    document.getElementById('btn-show-password').addEventListener('click', () => showPasswordPanel(''));
    document.getElementById('btn-show-face').addEventListener('click', () => {
        hideError();
        showIntroPanel('');
    });

    passPanel.addEventListener('submit', () => {
        const deviceField = document.getElementById('pw-device-id');
        if (deviceField) deviceField.value = getDeviceId();
        const btn = passPanel.querySelector('.btn-login');
        if (btn) { btn.disabled = true; btn.textContent = 'កំពុងចូល…'; }
    });

    // A failed POST re-renders the page with an error — stay on the password form
    if (passPanel.dataset.startOpen === '1') {
        introPanel.style.display = 'none';
        facePanel.style.display = 'none';
        passPanel.style.display = 'flex';
    } else {
        showIntroPanel('');
    }
});
