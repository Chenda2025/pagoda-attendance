/** Face ID style enrollment: two passes, head circled to capture every angle. */
const SECTORS = 12;
const TICKS_PER_SECTOR = TICK_COUNT / SECTORS;
const TURN_THRESHOLD = 0.10;
const TOTAL_ROUNDS = 2;
const MAX_DESCRIPTORS = 16;

document.addEventListener('DOMContentLoaded', () => {
    const stages = {
        intro: document.getElementById('stage-intro'),
        scan: document.getElementById('stage-scan'),
        done: document.getElementById('stage-done'),
    };
    const video = document.getElementById('setup-video');
    const scanTicks = document.getElementById('scan-ticks');
    const arrow = document.getElementById('fid-arrow');
    const heading = document.getElementById('scan-heading');
    const progress = document.getElementById('scan-progress');
    const scanError = document.getElementById('scan-error');
    const introError = document.getElementById('intro-error');
    const btnStart = document.getElementById('btn-start');

    buildTickRing(document.getElementById('intro-ticks'));
    buildTickRing(scanTicks);
    buildTickRing(document.getElementById('done-ticks'));
    document.querySelectorAll('#done-ticks .fid-tick').forEach(t => t.classList.add('lit'));

    let stream = null;
    let running = false;
    let round = 1;
    let filled = new Set();
    let frontalDone = false;
    const descriptors = [];

    function showStage(name) {
        Object.entries(stages).forEach(([key, el]) => {
            el.style.display = key === name ? 'flex' : 'none';
        });
    }

    function resetRound() {
        filled = new Set();
        frontalDone = false;
        resetTicks(scanTicks);
        progress.textContent = round === 1 ? 'ការស្កេនលើកទី ១' : 'ការស្កេនលើកទី ២';
    }

    function lightSector(sector) {
        for (let i = 0; i < TICKS_PER_SECTOR; i++) {
            setTickState(scanTicks, sector * TICKS_PER_SECTOR + i, 'lit');
        }
    }

    function nextUnfilledSector() {
        for (let s = 0; s < SECTORS; s++) {
            if (!filled.has(s)) return s;
        }
        return null;
    }

    function pointArrowAt(sector) {
        if (sector === null) {
            arrow.classList.remove('show');
            return;
        }
        const tickDeg = (360 / TICK_COUNT) * (sector * TICKS_PER_SECTOR + TICKS_PER_SECTOR / 2);
        arrow.style.transform = `rotate(${tickDeg - 90}deg)`;
        arrow.classList.add('show');
    }

    async function captureAngle(detection) {
        if (descriptors.length >= MAX_DESCRIPTORS) return;
        descriptors.push(Array.from(detection.descriptor));
    }

    async function finishEnrollment() {
        running = false;
        arrow.classList.remove('show');
        heading.textContent = 'កំពុងរក្សាទុក…';
        try {
            const res = await fetch('/api/auth/face-enroll', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Device-Id': getDeviceId(),
                },
                body: JSON.stringify({ descriptors, device_id: getDeviceId() }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.message || 'Save failed');
            stopCamera(stream);
            showStage('done');
            document.getElementById('btn-continue').onclick = () => {
                window.location.href = json.redirect || '/';
            };
        } catch (e) {
            scanError.textContent = e.message || 'មានបញ្ហាក្នុងការរក្សាទុក';
            heading.textContent = 'បង្វិលក្បាលតាមព្រួញ';
            running = true;
            loop();
        }
    }

    async function loop() {
        if (!running) return;
        try {
            const detection = await detectFace(video);
            if (!detection) {
                heading.textContent = 'ដាក់មុខក្នុងស៊ុម';
            } else {
                const { angle, magnitude } = headDirection(detection);

                if (magnitude < TURN_THRESHOLD) {
                    heading.textContent = 'បង្វិលក្បាលយឺតៗ ជារង្វង់';
                    if (!frontalDone) {
                        frontalDone = true;
                        await captureAngle(detection);
                    }
                } else {
                    heading.textContent = 'បង្វិលក្បាលយឺតៗ ជារង្វង់';
                    const tick = angleToTick(angle);
                    const sector = Math.floor(tick / TICKS_PER_SECTOR) % SECTORS;
                    setTickState(scanTicks, tick, 'active');
                    if (!filled.has(sector)) {
                        filled.add(sector);
                        lightSector(sector);
                        await captureAngle(detection);
                    }
                }

                progress.textContent =
                    `${round === 1 ? 'ការស្កេនលើកទី ១' : 'ការស្កេនលើកទី ២'} — ${filled.size}/${SECTORS}`;
                pointArrowAt(nextUnfilledSector());

                if (filled.size >= SECTORS) {
                    if (round < TOTAL_ROUNDS) {
                        round++;
                        resetRound();
                        heading.textContent = 'ស្កេនម្តងទៀត';
                    } else {
                        await finishEnrollment();
                        return;
                    }
                }
            }
        } catch (e) {
            /* keep scanning through transient detection errors */
        }
        requestAnimationFrame(loop);
    }

    btnStart.addEventListener('click', async () => {
        btnStart.disabled = true;
        introError.textContent = '';
        btnStart.textContent = 'កំពុងបើកកាមេរ៉ា…';
        try {
            await loadFaceModels();
            showStage('scan');
            stream = await startCamera(video);
            round = 1;
            descriptors.length = 0;
            resetRound();
            running = true;
            loop();
        } catch (e) {
            showStage('intro');
            introError.textContent = 'មិនអាចបើកកាមេរ៉ា — សូមអនុញ្ញាតកាមេរ៉ា';
            btnStart.disabled = false;
            btnStart.textContent = 'ចាប់ផ្តើម';
        }
    });

    document.getElementById('btn-restart').addEventListener('click', () => {
        round = 1;
        descriptors.length = 0;
        scanError.textContent = '';
        resetRound();
        if (!running) {
            running = true;
            loop();
        }
    });
});
