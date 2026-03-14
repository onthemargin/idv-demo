/* ── Binding page: client-side state + face comparison ─────────────────────── */

const BASE       = '/idv-demo';
let   _jwtToken  = null;

function providerIconSvg(provider) {
    if (provider === 'microsoft') {
        return `<svg width="14" height="14" viewBox="0 0 23 23" style="flex-shrink:0">
            <rect x="1"  y="1"  width="10" height="10" fill="#f25022"/>
            <rect x="12" y="1"  width="10" height="10" fill="#7fba00"/>
            <rect x="1"  y="12" width="10" height="10" fill="#00a4ef"/>
            <rect x="12" y="12" width="10" height="10" fill="#ffb900"/>
        </svg>`;
    }
    if (provider === 'facebook') {
        return `<svg width="14" height="14" viewBox="0 0 24 24" style="flex-shrink:0">
            <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>`;
    }
    // default: Google
    return `<svg width="14" height="14" viewBox="0 0 24 24" style="flex-shrink:0">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>`;
}
const MODELS_URL = BASE + '/models';

function jaroWinkler(s1, s2) {
    s1 = s1.toLowerCase().trim();
    s2 = s2.toLowerCase().trim();
    if (s1 === s2) return 1;

    const len1 = s1.length;
    const len2 = s2.length;
    const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

    const s1Matches = new Array(len1).fill(false);
    const s2Matches = new Array(len2).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, len2);
        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = true;
            s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < len1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
}

function loadBinding() {
    const raw1 = sessionStorage.getItem('tier1');
    const raw2 = sessionStorage.getItem('tier2');

    if (!raw1) { window.location.href = BASE + '/'; return; }
    if (!raw2) { window.location.href = BASE + '/idv'; return; }

    try {
        const tier1 = JSON.parse(raw1);
        const tier2 = JSON.parse(raw2);

        const socialName   = tier1.claims.name;
        const verifiedName = tier2.ocrResult.parsedName || '';
        const nameScore    = jaroWinkler(socialName, verifiedName);
        const nameGrade    = nameScore > 0.85 ? 'strong' : nameScore > 0.70 ? 'moderate' : 'weak';

        const data = {
            sessionContinuity: true,
            nameMatch: {
                socialName,
                verifiedName,
                score:        Math.round(nameScore * 100) / 100,
                scorePercent: Math.round(nameScore * 100),
                grade:        nameGrade
            },
            faceComparison: {
                socialPhotoUrl: tier1.claims.picture,
                selfieDataUrl:  tier2.selfieDataUrl,
                ssdFrames:      tier2.ssdFrames || 1
            },
            liveness: {
                verified:      tier2.livenessVerified,
                selfieDataUrl: tier2.selfieDataUrl
            },
            tier1,
            tier2,
            assuranceLevel: 'IAL1.5',
            bindingMethod: 'session_continuity + ocr_name_fuzzy_match + face_descriptor_euclidean'
        };

        renderBinding(data);
        sessionStorage.removeItem('tier1');
        sessionStorage.removeItem('tier2');
        computeFaceMatch(data);

        if (tier2.token) {
            renderVerificationToken(tier2.token, tier2.ssdFrames || 1);
        }
    } catch (e) {
        document.getElementById('loading').innerHTML =
            `<p style="color:#dc2626">Failed to load binding data: ${e.message}. <a href="/idv-demo/">Return to start</a></p>`;
    }
}

function renderBinding(data) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('binding-content').classList.remove('hidden');

    const t1 = data.tier1;
    const t2 = data.tier2;

    // Provider icon
    const iconEl = document.getElementById('provider-icon');
    if (iconEl) iconEl.innerHTML = providerIconSvg(t1.provider);

    // Social column
    document.getElementById('social-avatar').src = t1.claims.picture || '';
    document.getElementById('social-name').textContent  = t1.claims.name  || '';
    document.getElementById('social-email').textContent = t1.claims.email || '';

    // Verdict headline
    const verifiedName = t2.ocrResult.parsedName || t1.claims.name || 'This person';
    document.getElementById('result-verdict').textContent    = `${verifiedName} is who they say they are`;
    document.getElementById('result-confidence').textContent = 'Overall confidence: computing\u2026';

    // Prime receipt card
    const providerLabels = { google: 'Google', microsoft: 'Microsoft', facebook: 'Facebook' };
    document.getElementById('receipt-name').textContent     = verifiedName;
    document.getElementById('receipt-provider').textContent = providerLabels[t1.provider] || t1.provider;
    document.getElementById('receipt-issued').textContent   = new Date().toLocaleString();
    const receiptCard = document.getElementById('receipt-card');
    receiptCard.classList.remove('hidden');
    receiptCard.classList.add('animate-signal');
    receiptCard.style.animationDelay = '2.1s';

    const claimsGrid = document.getElementById('social-claims-grid');
    const fields = [
        ['sub',            t1.claims.sub],
        ['email_verified', String(t1.claims.email_verified)],
        ['locale',         t1.claims.locale],
        ['received_at',    t1.receivedAt || '']
    ];
    claimsGrid.innerHTML = fields.map(([k, v]) => `
        <div class="key">${esc(k)}</div>
        <div class="val"><code>${esc(String(v ?? ''))}</code></div>
    `).join('');

    // Document column
    document.getElementById('doc-name').textContent   = t2.ocrResult.parsedName   || '— not detected';
    document.getElementById('doc-dob').textContent    = 'DOB: ' + (t2.ocrResult.parsedDob    || '—');
    document.getElementById('doc-docnum').textContent = 'Doc #: ' + (t2.ocrResult.parsedDocNum || '—');

    if (t2.selfieDataUrl) {
        document.getElementById('selfie-display').src     = t2.selfieDataUrl;
        document.getElementById('liveness-thumb').src     = t2.selfieDataUrl;
        const cmpEl = document.getElementById('selfie-compare-img');
        if (cmpEl) cmpEl.src = t2.selfieDataUrl;
    }

    // Name match signal
    const nm = data.nameMatch;
    data._nameScorePct = nm.scorePercent;
    document.getElementById('name-score-pct').textContent = nm.scorePercent + '%';
    document.getElementById('name-grade').textContent      = capitalise(nm.grade);
    document.getElementById('nm-social').textContent       = nm.socialName;
    document.getElementById('nm-verified').textContent     = nm.verifiedName;
    document.getElementById('name-sig-icon').textContent   = nm.grade === 'strong' ? '✅' : nm.grade === 'moderate' ? '⚠️' : '❌';

    const scoreBar = document.getElementById('name-score-bar');
    scoreBar.style.width = nm.scorePercent + '%';
    if (nm.grade === 'moderate') scoreBar.classList.add('score-fill--warn');
    if (nm.grade === 'weak')     scoreBar.classList.add('score-fill--danger');

    // Face compare — show social photo (descriptor comparison happens in computeFaceMatch)
    document.getElementById('face-social-img').src = t1.claims.picture || '';
}

async function computeFaceMatch(data) {
    const socialPhotoUrl    = data.tier1.claims.picture;
    const storedDescriptor  = data.tier2.selfieDescriptor;
    const ssdFrames         = data.faceComparison.ssdFrames;

    if (!storedDescriptor || storedDescriptor.length === 0) {
        document.getElementById('face-score-pct').textContent = 'No selfie descriptor available';
        document.getElementById('face-sig-icon').textContent  = '⚠️';
        return;
    }

    try {
        // Only need TinyFaceDetector to detect the social photo — selfie descriptor already computed
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);

        const socialImg = await loadImage(socialPhotoUrl);
        const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 });
        const socialDet = await faceapi
            .detectSingleFace(socialImg, opts)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (!socialDet) {
            document.getElementById('face-score-pct').textContent = 'Face not detected in social photo';
            document.getElementById('face-sig-icon').textContent  = '⚠️';
            return;
        }

        const selfieDesc = new Float32Array(storedDescriptor);
        const distance   = faceapi.euclideanDistance(socialDet.descriptor, selfieDesc);
        const score      = Math.round((1 - Math.min(distance, 1)) * 100);
        const grade      = distance < 0.4 ? 'strong' : distance < 0.6 ? 'moderate' : 'weak';

        document.getElementById('face-score-pct').textContent  = score + '%';
        document.getElementById('face-grade').textContent      = capitalise(grade);
        document.getElementById('face-sig-icon').textContent   = grade === 'strong' ? '✅' : grade === 'moderate' ? '⚠️' : '❌';
        document.getElementById('face-distance-display').textContent =
            `Euclidean distance: ${distance.toFixed(3)} (< 0.4 = strong) · ${ssdFrames} SSD frame${ssdFrames !== 1 ? 's' : ''} averaged`;

        const bar = document.getElementById('face-score-bar');
        bar.style.width = score + '%';
        if (grade === 'moderate') bar.classList.add('score-fill--warn');
        if (grade === 'weak')     bar.classList.add('score-fill--danger');

        // Overall confidence = average of name + face
        const overall = Math.round(((data._nameScorePct || 0) + score) / 2);
        document.getElementById('result-confidence').textContent  = `Overall confidence: ${overall}%`;
        document.getElementById('receipt-confidence').textContent = `${overall}%`;

        // Update overall result based on face grade
        const verifiedName = data.tier2.ocrResult.parsedName || data.tier1.claims.name || 'This person';
        const resultBox    = document.getElementById('result-box');
        const resultIcon   = document.getElementById('result-icon');
        const resultVerdict = document.getElementById('result-verdict');
        if (grade === 'weak') {
            resultBox.classList.add('result-box--fail');
            resultIcon.textContent   = '❌';
            resultVerdict.textContent = `${verifiedName} — identity mismatch flagged`;
        } else if (grade === 'moderate') {
            resultIcon.textContent   = '⚠️';
            resultVerdict.textContent = `${verifiedName} — marginal face match, review recommended`;
        }

    } catch (err) {
        document.getElementById('face-score-pct').textContent = 'Error: ' + err.message;
        document.getElementById('face-detail').textContent    = 'Face comparison failed: ' + err.message;
    }
}

// ── Verification token display ─────────────────────────────────────────────────

function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const pad = s => s + '='.repeat((4 - s.length % 4) % 4);
        return JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
    } catch (_) { return null; }
}

function renderVerificationToken(token, ssdFrames) {
    _jwtToken = token;

    const jtiEl = document.getElementById('receipt-jti');
    const payload = decodeJwtPayload(token);
    if (jtiEl && payload) jtiEl.textContent = payload.jti || '—';

    const section = document.getElementById('vc-section');
    if (!section) return;
    const truncated = token.length > 80 ? token.slice(0, 40) + '…' + token.slice(-20) : token;

    const payloadHtml = payload
        ? Object.entries(payload).map(([k, v]) =>
            `<div class="key">${esc(k)}</div><div class="val"><code>${esc(String(v ?? ''))}</code></div>`
          ).join('')
        : '<div style="color:#dc2626">Could not decode token</div>';

    section.innerHTML = `
        <div class="binding-signal">
            <div class="sig-icon">🔏</div>
            <div class="sig-body" style="width:100%">
                <div class="sig-title">Verification Credential &nbsp;<span class="badge badge--ok">HS256 · server-signed</span></div>
                <div class="sig-detail" style="margin-bottom:0.5rem;">
                    HMAC-SHA256 JWT issued by server after successful IDV &nbsp;·&nbsp;
                    descriptor averaged over <strong>${ssdFrames}</strong> SSD frame${ssdFrames !== 1 ? 's' : ''}
                </div>
                <div style="font-family:monospace; font-size:0.75rem; background:#f1f5f9; padding:0.4rem 0.6rem;
                            border-radius:4px; word-break:break-all; color:#334155; margin-bottom:0.5rem;">
                    ${esc(truncated)}
                </div>
                <details>
                    <summary style="font-size:0.82rem; cursor:pointer; color:#4b5563;">Decoded payload</summary>
                    <div class="claims-grid" style="font-size:0.80rem; margin-top:0.4rem;">${payloadHtml}</div>
                </details>
            </div>
        </div>`;
    section.classList.remove('hidden');
}

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image: ' + src));
        img.src = src;
    });
}

function capitalise(str) {
    return str ? str[0].toUpperCase() + str.slice(1) : str;
}

function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('signout-btn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = BASE + '/';
});

document.getElementById('copy-credential-btn').addEventListener('click', () => {
    if (!_jwtToken) return;
    navigator.clipboard.writeText(_jwtToken).then(() => {
        const btn = document.getElementById('copy-credential-btn');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 2000);
    });
});

loadBinding();
