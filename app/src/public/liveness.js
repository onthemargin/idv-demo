/* ── Step 4: Liveness check ──────────────────────────────────────────────────── */

const BASE       = '/idv-demo';
const MODELS_URL = BASE + '/models';

if (!sessionStorage.getItem('tier1'))    { window.location.href = BASE + '/'; }
if (!sessionStorage.getItem('ocr_result')) { window.location.href = BASE + '/idv'; }

let selfieDataUrl    = null;
let selfieDescriptor = null;
let selfieCanvas     = null;
let livenessVerified = false;

let livenessState  = 'FACE';
let detectionLoop  = null;
let livenessStream = null;
let blinkCooldown  = false;
let headBaseline   = null;
let headTurned     = false;
let headTurnFrames = 0;
let faceFrameCount = 0;
let isDetecting    = false;
let ssdLoaded      = false;
let descriptorAccum = [];

// ── Init: load models immediately on page load ────────────────────────────────

async function initLiveness() {
    const loadingEl = document.getElementById('liveness-loading');
    const uiEl      = document.getElementById('liveness-ui');

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);

        faceapi.nets.ssdMobilenetv1.loadFromUri(MODELS_URL)
            .then(() => { ssdLoaded = true; })
            .catch(() => {});

        loadingEl.classList.add('hidden');
        uiEl.classList.remove('hidden');
    } catch (err) {
        loadingEl.innerHTML = `<p style="color:#dc2626">Failed to load face models: ${err.message}</p>`;
    }
}

// ── Camera ────────────────────────────────────────────────────────────────────

async function startLivenessCamera() {
    document.getElementById('start-camera-btn').classList.add('hidden');

    try {
        livenessStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        const video = document.getElementById('liveness-video');
        video.srcObject = livenessStream;
        await new Promise(r => video.onloadedmetadata = r);
        video.play();

        livenessState  = 'FACE';
        faceFrameCount = 0;
        headBaseline   = null;
        headTurned     = false;
        headTurnFrames = 0;
        blinkCooldown  = false;
        isDetecting    = false;
        selfieCanvas   = null;
        descriptorAccum = [];

        document.getElementById('selfie-preview').style.display = 'none';
        document.getElementById('liveness-canvas').style.display = 'none';
        document.getElementById('liveness-video').style.display = '';

        updateStageUI();
        setStatus('Position your face in the oval');
        detectionLoop = setInterval(detectFace, 150);
    } catch (err) {
        document.getElementById('liveness-error').textContent =
            'Camera access denied or unavailable. ' + err.message;
        document.getElementById('liveness-error').classList.remove('hidden');
        document.getElementById('start-camera-btn').classList.remove('hidden');
    }
}

// ── Detection loop ────────────────────────────────────────────────────────────

async function detectFace() {
    if (livenessState === 'COMPLETE' || isDetecting) return;
    isDetecting = true;

    const video = document.getElementById('liveness-video');
    if (!video.readyState || video.readyState < 2) { isDetecting = false; return; }

    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });

    try {
        const detection = await faceapi
            .detectSingleFace(video, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!detection) {
            setStatus('Position your face in the oval');
            document.getElementById('cam-overlay').className = 'camera-overlay';
            return;
        }

        document.getElementById('cam-overlay').className = 'camera-overlay detecting';

        if (livenessState === 'FACE') {
            faceFrameCount++;
            setStatus(`Face detected (${faceFrameCount}/5 frames)…`);
            if (faceFrameCount >= 5) {
                markStageDone('stage-face');
                livenessState = 'BLINK';
                setStatus('Now please blink your eyes');
            }
            return;
        }

        const landmarks = detection.landmarks;
        const ear = (eyeAspectRatio(landmarks.getLeftEye()) + eyeAspectRatio(landmarks.getRightEye())) / 2;

        if (livenessState === 'BLINK') {
            if (ear < 0.30 && !blinkCooldown) {
                blinkCooldown = true;
                setTimeout(() => { blinkCooldown = false; }, 800);
                markStageDone('stage-blink');
                takeSelfieSnapshot(video, detection.descriptor);
                markStageDone('stage-selfie');
                livenessState = 'HEAD';
                headBaseline  = getNoseTipX(landmarks);
                headTurned    = false;
                setStatus('Turn your head to the side');
            } else {
                setStatus(`Blink now (EAR: ${ear.toFixed(2)})`);
            }
            return;
        }

        if (livenessState === 'HEAD') {
            const noseX = getNoseTipX(landmarks);
            if (headBaseline !== null && Math.abs(noseX - headBaseline) > 30) {
                headTurnFrames++;
                setStatus(`Hold… (${headTurnFrames}/3)`);
                if (headTurnFrames >= 3 && !headTurned) {
                    headTurned = true;
                    markStageDone('stage-turn');
                    document.getElementById('cam-overlay').className = 'camera-overlay success';
                    setStatus('✅ Liveness confirmed!');
                    livenessState = 'COMPLETE';
                    finalizeLiveness();
                }
            } else {
                headTurnFrames = 0;
                setStatus('Turn your head to the side');
            }
        }
    } finally {
        isDetecting = false;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function eyeAspectRatio(eye) {
    const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    return (d(eye[1], eye[5]) + d(eye[2], eye[4])) / (2 * d(eye[0], eye[3]));
}

function getNoseTipX(landmarks) {
    return landmarks.getNose()[3].x;
}

function takeSelfieSnapshot(video, tinyDescriptor) {
    selfieCanvas = document.createElement('canvas');
    selfieCanvas.width  = video.videoWidth  || 640;
    selfieCanvas.height = video.videoHeight || 480;
    selfieCanvas.getContext('2d').drawImage(video, 0, 0);
    selfieDataUrl    = selfieCanvas.toDataURL('image/jpeg', 0.85);
    descriptorAccum  = [tinyDescriptor];
    selfieDescriptor = Array.from(tinyDescriptor);

    collectSsdDescriptors(video, 4);

    document.getElementById('selfie-thumb').src = selfieDataUrl;
    document.getElementById('selfie-preview').style.display = 'flex';
}

function averageDescriptors(descriptors) {
    if (!descriptors || descriptors.length === 0) return null;
    const len = descriptors[0].length;
    const avg = new Float32Array(len);
    for (const d of descriptors)
        for (let i = 0; i < len; i++) avg[i] += d[i];
    for (let i = 0; i < len; i++) avg[i] /= descriptors.length;
    return avg;
}

async function collectSsdDescriptors(video, n = 4) {
    const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    for (let i = 1; i <= n; i++) {
        await new Promise(r => setTimeout(r, i * 150));
        if (livenessState === 'COMPLETE' || !ssdLoaded || video.readyState < 2) continue;
        try {
            const det = await faceapi.detectSingleFace(video, opts).withFaceLandmarks().withFaceDescriptor();
            if (det) {
                descriptorAccum.push(det.descriptor);
                const avg = averageDescriptors(descriptorAccum);
                if (avg) selfieDescriptor = Array.from(avg);
            }
        } catch (_) {}
    }
}

function finalizeLiveness() {
    clearInterval(detectionLoop);
    livenessVerified = true;

    if (selfieCanvas) {
        const liveCanvas = document.getElementById('liveness-canvas');
        liveCanvas.width  = selfieCanvas.width;
        liveCanvas.height = selfieCanvas.height;
        liveCanvas.getContext('2d').drawImage(selfieCanvas, 0, 0);
        liveCanvas.className = 'camera-video';
        liveCanvas.style.display = 'block';
        document.getElementById('liveness-video').style.display = 'none';
    }

    if (livenessStream) livenessStream.getTracks().forEach(t => t.stop());
    document.getElementById('start-camera-btn').classList.add('hidden');
    document.getElementById('submit-section').classList.remove('hidden');
}

function markStageDone(stageId) {
    const el = document.getElementById(stageId);
    if (el) {
        el.className = 'stage done';
        el.textContent = '✅ ' + el.textContent.replace(/^[⬜🔵]\s*/, '');
    }
}

function setStatus(msg) { document.getElementById('liveness-status').textContent = msg; }

function updateStageUI() {
    ['stage-face', 'stage-blink', 'stage-selfie', 'stage-turn'].forEach(id =>
        document.getElementById(id).className = 'stage');
}

// ── Submit ────────────────────────────────────────────────────────────────────

async function submitIDV() {
    if (!livenessVerified) {
        alert('Please complete the liveness check first.');
        return;
    }

    const ocrResult = JSON.parse(sessionStorage.getItem('ocr_result') || '{}');

    let token = null;
    try {
        const tier1 = JSON.parse(sessionStorage.getItem('tier1') || '{}');
        const resp  = await fetch(BASE + '/api/idv/complete', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ sub: tier1.claims?.sub, name: tier1.claims?.name, ocrResult })
        });
        if (resp.ok) token = (await resp.json()).token;
    } catch (e) {
        console.warn('Could not fetch verification token:', e.message);
    }

    sessionStorage.setItem('tier2', JSON.stringify({
        ocrResult,
        livenessVerified: true,
        selfieDataUrl,
        selfieDescriptor,
        ssdFrames: descriptorAccum.length,
        token
    }));
    sessionStorage.removeItem('ocr_result');
    window.location.href = BASE + '/binding';
}

// ── Event wiring ──────────────────────────────────────────────────────────────

document.getElementById('start-camera-btn').addEventListener('click', startLivenessCamera);
document.getElementById('submit-btn').addEventListener('click', submitIDV);

initLiveness();
