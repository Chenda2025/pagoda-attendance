/** Face ID style scanner: models, camera, tick ring, head-angle capture. */
const FACE_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.14/model/';
const TICK_COUNT = 60;

let _faceModelsReady = false;

function getDeviceId() {
    let id = localStorage.getItem('pagoda_device_id');
    if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID()) ||
            'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('pagoda_device_id', id);
    }
    return id;
}

async function loadFaceModels(statusEl) {
    if (_faceModelsReady) return true;
    if (statusEl) statusEl.textContent = 'កំពុងផ្ទុកម៉ូឌែល…';
    await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODEL_URL),
    ]);
    _faceModelsReady = true;
    return true;
}

async function startCamera(videoEl) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        const err = new Error('INSECURE_CONTEXT');
        err.name = 'SecurityError';
        throw err;
    }

    videoEl.setAttribute('playsinline', '');
    videoEl.setAttribute('webkit-playsinline', '');
    videoEl.muted = true;
    videoEl.autoplay = true;

    const attempts = [
        { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
        { video: { facingMode: { ideal: 'user' } }, audio: false },
        { video: true, audio: false },
    ];

    let lastError = null;
    for (const constraints of attempts) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            videoEl.srcObject = stream;
            await videoEl.play();
            return stream;
        } catch (e) {
            lastError = e;
            if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError' || e.name === 'SecurityError')) {
                throw e;
            }
        }
    }
    throw lastError || new Error('CAMERA_UNAVAILABLE');
}

function cameraErrorMessage(err) {
    const name = err && err.name ? err.name : '';
    const msg = String((err && err.message) || '');
    if (name === 'SecurityError' || msg === 'INSECURE_CONTEXT' || !window.isSecureContext) {
        return 'ទូរសព្ទត្រូវការ HTTPS ដើម្បីបើកកាមេរ៉ា — សូមបើកតំណ https:// មិនមែន http://';
    }
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return 'កាមេរ៉ាត្រូវបានបិទ — សូមអនុញ្ញាតកាមេរ៉ាក្នុង Settings របស់ទូរសព្ទ';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'រកមិនឃើញកាមេរ៉ា នៅលើឧបករណ៍នេះ';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
        return 'កាមេរ៉ាកំពុងប្រើដោយកម្មវិធីផ្សេង — សូមបិទកម្មវិធីនោះ រួចព្យាយាមម្តងទៀត';
    }
    return 'មិនអាចបើកកាមេរ៉ា — សូមអនុញ្ញាតកាមេរ៉ា ឬប្រើលេខសម្ងាត់';
}

function stopCamera(stream) {
    if (stream) stream.getTracks().forEach(t => t.stop());
}

/** Render the ring of tick marks around the circular preview. */
function buildTickRing(container, count = TICK_COUNT) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const tick = document.createElement('span');
        tick.className = 'fid-tick';
        tick.dataset.index = String(i);
        tick.style.transform = `rotate(${(360 / count) * i}deg) translateY(calc(var(--fid-radius) * -1))`;
        container.appendChild(tick);
    }
}

function setTickState(container, index, state) {
    const tick = container.querySelector(`.fid-tick[data-index="${index}"]`);
    if (tick) tick.classList.add(state);
}

function resetTicks(container) {
    container.querySelectorAll('.fid-tick').forEach(t => t.classList.remove('lit', 'active'));
}

async function detectFace(videoEl) {
    return faceapi
        .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptor();
}

/**
 * Direction the head points, derived from nose offset inside the face box.
 * Returns { angle (rad), magnitude 0..1 } — magnitude 0 means facing forward.
 */
function headDirection(detection) {
    const box = detection.detection.box;
    const nose = detection.landmarks.getNose();
    const tip = nose[nose.length - 1] || nose[0];
    const dx = (tip.x - (box.x + box.width / 2)) / (box.width / 2);
    const dy = (tip.y - (box.y + box.height / 2)) / (box.height / 2);
    return {
        angle: Math.atan2(dy, dx),
        magnitude: Math.min(1, Math.hypot(dx, dy)),
    };
}

/** Map a head direction to a tick index (mirrored to match the flipped preview). */
function angleToTick(angle, count = TICK_COUNT) {
    const mirrored = Math.PI - angle;
    const normalized = ((mirrored % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.floor((normalized / (2 * Math.PI)) * count) % count;
}
