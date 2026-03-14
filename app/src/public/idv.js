/* ── Step 3: Document scan ───────────────────────────────────────────────────── */

const BASE       = '/idv-demo';
const MODELS_URL = BASE + '/models';

if (!sessionStorage.getItem('tier1')) { window.location.href = BASE + '/'; }

let ocrResult = null;

// ── Document input ────────────────────────────────────────────────────────────

function useTestId() {
    setActiveCard('card-testid');
    cancelDocCamera();
    showDocPreview(BASE + '/assets/test-id.svg');

    ocrResult = {
        parsedName:      'Jane Elizabeth Smith',
        parsedDob:       '03/15/1990',
        parsedDocNum:    'D1234567WA9',
        checkDigitValid: true,
        rawText:         'WASHINGTON DRIVER LICENSE\nNAME Jane Elizabeth Smith\nDATE OF BIRTH 03/15/1990\nDL NUMBER D1234567WA9\nADDRESS 4521 Maple Ave NW Seattle, WA 98103'
    };

    document.getElementById('ocr-progress').style.width = '100%';
    document.getElementById('ocr-status').textContent = 'Test ID loaded ✅';
    renderOcrResult(ocrResult);
}

function triggerUpload() {
    setActiveCard('card-upload');
    cancelDocCamera();
    document.getElementById('file-input').click();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file (JPG or PNG).');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => { showDocPreview(e.target.result); runOCR(img); };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

let docStream = null;

function startDocCamera() {
    setActiveCard('card-camera');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
            docStream = stream;
            const video = document.getElementById('doc-video');
            video.srcObject = stream;
            document.getElementById('doc-camera-ui').classList.remove('hidden');
        })
        .catch(() => {
            alert('Camera access denied or unavailable. Try uploading a photo instead.');
            setActiveCard(null);
        });
}

function captureDocPhoto() {
    const video  = document.getElementById('doc-video');
    const canvas = document.getElementById('doc-canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    cancelDocCamera();
    const img = new Image();
    img.onload = () => { showDocPreview(dataUrl); runOCR(img); };
    img.src = dataUrl;
}

function cancelDocCamera() {
    if (docStream) { docStream.getTracks().forEach(t => t.stop()); docStream = null; }
    document.getElementById('doc-camera-ui').classList.add('hidden');
}

function setActiveCard(id) {
    ['card-testid', 'card-upload', 'card-camera'].forEach(c =>
        document.getElementById(c).classList.toggle('active', c === id));
}

function showDocPreview(src) {
    const preview = document.getElementById('doc-preview');
    preview.src = src;
    preview.classList.remove('hidden');
    document.getElementById('ocr-section').classList.remove('hidden');
    document.getElementById('ocr-result').classList.add('hidden');
}

// ── Canvas preprocessing for better OCR ──────────────────────────────────────

function preprocessForOCR(img) {
    const W = img.naturalWidth  || img.width  || 640;
    const H = img.naturalHeight || img.height || 400;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, W, H);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
    }
    for (let i = 0; i < d.length; i += 4) {
        const v = d[i];
        d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, ((v - 30) / 190) * 255));
    }
    ctx.putImageData(imgData, 0, 0);

    const src = ctx.getImageData(0, 0, W, H);
    const out = ctx.createImageData(W, H);
    const s = src.data, o = out.data;
    const K = [0, -1, 0, -1, 5, -1, 0, -1, 0];
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++)
                for (let kx = -1; kx <= 1; kx++)
                    sum += s[((y + ky) * W + (x + kx)) * 4] * K[(ky + 1) * 3 + (kx + 1)];
            const idx = (y * W + x) * 4;
            const c = Math.max(0, Math.min(255, sum));
            o[idx] = o[idx + 1] = o[idx + 2] = c;
            o[idx + 3] = 255;
        }
    }
    for (let x = 0; x < W; x++) {
        for (const y of [0, H - 1]) {
            const i = (y * W + x) * 4;
            o[i] = s[i]; o[i+1] = s[i+1]; o[i+2] = s[i+2]; o[i+3] = 255;
        }
    }
    for (let y = 0; y < H; y++) {
        for (const x of [0, W - 1]) {
            const i = (y * W + x) * 4;
            o[i] = s[i]; o[i+1] = s[i+1]; o[i+2] = s[i+2]; o[i+3] = 255;
        }
    }
    ctx.putImageData(out, 0, 0);
    return canvas;
}

// ── ICAO check digit ──────────────────────────────────────────────────────────

function mrzCharValue(c) {
    if (c >= '0' && c <= '9') return parseInt(c, 10);
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
    return 0;
}

function mrzCheckDigit(str) {
    const weights = [7, 3, 1];
    let sum = 0;
    for (let i = 0; i < str.length; i++)
        sum += mrzCharValue(str[i].toUpperCase()) * weights[i % 3];
    return (sum % 10).toString();
}

function validateDocNum(raw) {
    if (!raw || raw.length < 2) return { valid: null, number: raw, digit: null };
    const number = raw.slice(0, -1);
    const digit  = raw.slice(-1);
    return { valid: digit === mrzCheckDigit(number), number, digit };
}

// ── Tesseract OCR ─────────────────────────────────────────────────────────────

async function runOCR(imageSource) {
    const progressBar = document.getElementById('ocr-progress');
    const statusLabel = document.getElementById('ocr-status');
    const resultDiv   = document.getElementById('ocr-result');

    progressBar.style.width = '0%';
    statusLabel.textContent = 'Preprocessing image…';
    resultDiv.classList.add('hidden');

    try {
        const processedCanvas = preprocessForOCR(imageSource);
        statusLabel.textContent = 'Starting OCR…';

        const worker = await Tesseract.createWorker('eng', 1, {
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
            langPath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tessdata',
            corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
            logger: m => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round((m.progress || 0) * 100);
                    progressBar.style.width = pct + '%';
                    statusLabel.textContent = `Recognizing text… ${pct}%`;
                } else if (m.status) {
                    statusLabel.textContent = m.status;
                }
            }
        });

        const { data: { text } } = await worker.recognize(processedCanvas);
        await worker.terminate();

        progressBar.style.width = '100%';
        statusLabel.textContent = 'OCR complete ✅';

        ocrResult = parseDocument(text);
        renderOcrResult(ocrResult);
    } catch (err) {
        statusLabel.textContent = '⚠️ OCR failed: ' + err.message;
        statusLabel.style.color = '#dc2626';
    }
}

function parseDocument(rawText) {
    const namePatterns = [
        /(?:NAME|Name)[:\s]+([A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){1,3})/,
        /([A-Z][A-Z]+,\s*[A-Z][A-Z]+)/,
        /([A-Z][a-z]+\s+[A-Z][a-z]+\s+[A-Z][a-z]+)/
    ];

    let parsedName = null;
    for (const pat of namePatterns) {
        const m = rawText.match(pat);
        if (m) { parsedName = m[1].trim(); break; }
    }

    const dobMatch    = rawText.match(/(?:DOB|Born|Date\s+of\s+Birth|D\.O\.B)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    const docMatch    = rawText.match(/(?:DL|LIC|ID|No\.?|Number|#)[:\s#]*([A-Z0-9]{6,12})\b/i);
    const parsedDocRaw = docMatch ? docMatch[1].trim() : null;
    const cdResult     = parsedDocRaw ? validateDocNum(parsedDocRaw) : { valid: null, number: parsedDocRaw };

    return {
        parsedName,
        parsedDob:       dobMatch ? dobMatch[1].trim() : null,
        parsedDocNum:    cdResult.number || parsedDocRaw,
        checkDigitValid: cdResult.valid,
        rawText
    };
}

function renderOcrResult(result) {
    document.getElementById('ocr-result').classList.remove('hidden');
    document.getElementById('ocr-name').textContent   = result.parsedName   || '— not detected';
    document.getElementById('ocr-dob').textContent    = result.parsedDob    || '— not detected';
    document.getElementById('ocr-docnum').textContent = result.parsedDocNum || '— not detected';
    document.getElementById('ocr-raw').textContent    = result.rawText;

    const cdEl = document.getElementById('ocr-checkdigit');
    if (cdEl) {
        if (result.parsedDocNum && result.checkDigitValid === true) {
            cdEl.textContent = '✅ ICAO check digit valid';
            cdEl.style.color = '#15803d';
        } else if (result.parsedDocNum && result.checkDigitValid === false) {
            cdEl.textContent = '❌ ICAO check digit invalid';
            cdEl.style.color = '#dc2626';
        } else {
            cdEl.textContent = '';
        }
    }

    const correctionField = document.getElementById('name-correction-field');
    if (!result.parsedName) {
        correctionField.style.display = '';
        document.getElementById('name-correction').value = '';
    } else {
        correctionField.style.display = 'none';
    }

    document.getElementById('to-liveness-btn').disabled = false;
}

// ── Continue to liveness ──────────────────────────────────────────────────────

function continueToLiveness() {
    if (!ocrResult.parsedName) {
        const correction = document.getElementById('name-correction').value.trim();
        if (!correction) {
            alert('Please enter the name shown on your document to continue.');
            return;
        }
        ocrResult.parsedName = correction;
    }

    sessionStorage.setItem('ocr_result', JSON.stringify(ocrResult));
    window.location.href = BASE + '/liveness';
}

// ── Event wiring ──────────────────────────────────────────────────────────────

document.getElementById('card-testid').addEventListener('click', useTestId);
document.getElementById('card-upload').addEventListener('click', triggerUpload);
document.getElementById('card-camera').addEventListener('click', startDocCamera);
document.getElementById('file-input').addEventListener('change', handleFileUpload);
document.getElementById('doc-capture-btn').addEventListener('click', captureDocPhoto);
document.getElementById('doc-cancel-btn').addEventListener('click', cancelDocCamera);
document.getElementById('to-liveness-btn').addEventListener('click', continueToLiveness);
