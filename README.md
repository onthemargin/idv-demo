# Consumer Identity Verification Demo

A fully client-side demo of how consumer IDV (Identity Verification) flows work — simulated social login, document OCR scanning, and face liveness detection, all tied together into a binding analysis that issues a signed verification credential.

**Live demo:** https://app.gyatso.me/idv-demo/

> **Educational purposes only.** This is a simulation for learning how IDV pipelines work. No real OAuth credentials are used. All document scanning and face detection run entirely in the browser. No images or personal data are sent to any server or stored anywhere.

---

## What the demo shows

The demo walks through a 5-step IDV flow:

| Step | Page | What happens |
|------|------|--------------|
| 1 | Sign In | Mock OAuth login (Google, Microsoft, Facebook) — returns a simulated ID token with realistic provider-specific claims |
| 2 | Social Claims | Displays the IAL1 identity (name, email, sub, picture) from the mock token |
| 3 | Scan Document | Client-side OCR via **Tesseract.js** — scan the included test ID or upload a photo; validates ICAO 9303 check digit on the document number |
| 4 | Liveness Check | Client-side liveness via **face-api.js** — blink detection + head turn; captures a selfie descriptor using SSD MobileNet V1 |
| 5 | Binding Analysis | Compares the two identities: Jaro-Winkler name fuzzy match, Euclidean face descriptor distance (selfie vs. social profile photo), session continuity; issues a server-signed HS256 JWT as a verification credential |

The result is an **IAL1.5** assurance level — above a plain social login (IAL1), but below a full government-document IDV (IAL2).

---

## Features

- **Zero upload** — document images and camera frames never leave the browser
- **Three mock providers** — Google, Microsoft, and Facebook each return their own realistic claim schema
- **Real OCR** — Tesseract.js (WebAssembly) processes the document locally; includes ICAO check-digit validation
- **Real liveness** — blink + head-turn detection using 68-point facial landmarks; not just a selfie button
- **Fuzzy binding** — Jaro-Winkler name match and 128-dim Euclidean face descriptor distance
- **Signed credential** — server mints an HS256 JWT only after both sides pass; no JWT library required (native `crypto.createHmac`)
- **Security-first server** — Helmet CSP, HSTS, rate limiting, no database, no session persistence

---

## Tech stack

**Client-side (all in-browser, no upload)**
- [Tesseract.js v5](https://github.com/naptha/tesseract.js) — WebAssembly OCR engine
- [@vladmandic/face-api](https://github.com/vladmandic/face-api) — TinyFaceDetector for liveness loop, SSD MobileNet V1 for face descriptor averaging, Face Landmark 68 for blink/head detection
- Jaro-Winkler fuzzy string match (inline, no library)
- Canvas preprocessing pipeline: grayscale → contrast stretch → sharpen kernel

**Server-side**
- Node.js 18+ + Express
- `helmet` for security headers and CSP
- `express-rate-limit` for rate limiting
- `crypto.createHmac` (built-in) for HS256 JWT minting — no JWT library
- No database, no session persistence, no external APIs

---

## Project structure

```
idv-demo/
├── app/
│   ├── package.json
│   ├── .env.example            # Environment variable template
│   └── src/
│       ├── server.js           # Express routes, mock personas, JWT minting
│       ├── security.js         # Helmet CSP, rate limiters, request logging
│       └── public/
│           ├── app.css         # All styles
│           ├── intro.html      # Landing/explanation page
│           ├── index.html      # Step 1: Sign In
│           ├── landing.js
│           ├── dashboard.html  # Step 2: Social Claims
│           ├── dashboard.js
│           ├── idv.html        # Step 3: Scan Document
│           ├── idv.js
│           ├── liveness.html   # Step 4: Liveness Check
│           ├── liveness.js
│           ├── binding.html    # Step 5: Binding Analysis
│           ├── binding.js
│           ├── error.html
│           ├── assets/
│           │   ├── persona-face.jpg   # AI-generated face (thispersondoesnotexist.com)
│           │   └── test-id.svg        # Generated test driver's license
│           └── models/                # face-api.js model weights (~13 MB)
│               ├── tiny_face_detector_model.bin
│               ├── face_landmark_68_model.bin
│               ├── face_recognition_model.bin
│               └── ssd_mobilenetv1_model.bin
├── generate-test-id.js         # Utility: regenerate test-id.svg
├── LICENSE
└── README.md
```

---

## Local development

### Prerequisites

- **Node.js 18+** — [nodejs.org](https://nodejs.org/) or via a version manager:
  ```bash
  # macOS/Linux (nvm)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  nvm install 18
  nvm use 18

  # macOS (Homebrew)
  brew install node
  ```
- **npm** — included with Node.js
- A **modern browser** with camera access (Chrome, Firefox, Safari, Edge) for the liveness step

### Install and run

```bash
git clone https://github.com/onthemargin/idv-demo.git
cd idv-demo/app
npm install
node src/server.js
```

Open http://localhost:3002/idv-demo/

The server reads `SESSION_SECRET` from a `.env` file (or environment). A random secret is used if not set — fine for local dev.

```bash
# app/.env (optional for local dev)
SESSION_SECRET=your-secret-here
PORT=3002
BASE_PATH=/idv-demo
```

### Regenerating the test ID

```bash
node generate-test-id.js
```

Rewrites `app/src/public/assets/test-id.svg` — pure Node.js, no native dependencies.

### Refreshing face-api model weights

The `models/` directory contains binary weights from [`@vladmandic/face-api`](https://github.com/vladmandic/face-api/tree/master/model). To refresh them:

```bash
cd app/src/public/models
BASE=https://github.com/vladmandic/face-api/raw/master/model
for f in tiny_face_detector_model face_landmark_68_model face_recognition_model ssd_mobilenetv1_model; do
  curl -L "$BASE/$f-weights_manifest.json" -o "$f-weights_manifest.json"
  curl -L "$BASE/$f.bin" -o "$f.bin"
done
```

---

## Self-hosting

The demo runs as a single Node process behind nginx. The server expects:

| Env var | Default | Notes |
|---------|---------|-------|
| `SESSION_SECRET` | random | Used for HS256 JWT signing — set a real value in production |
| `PORT` | `3002` | |
| `BASE_PATH` | `/idv-demo` | URL prefix for all routes |
| `NODE_ENV` | `development` | Set to `production` in production |
| `ALLOWED_ORIGINS` | (any) | Comma-separated CORS origins |

**systemd service example:**

```ini
[Unit]
Description=IDV Demo
After=network.target

[Service]
Type=simple
User=idv-demo
WorkingDirectory=/path/to/idv-demo/app
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
Environment=NODE_ENV=production
EnvironmentFile=/etc/idv-demo/.env

[Install]
WantedBy=multi-user.target
```

**nginx proxy example:**

```nginx
location /idv-demo/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_valid 200 1h;
    add_header Cache-Control "public, max-age=3600";
}
```

---

## Privacy & security notes

- **No data leaves the browser** — document images and camera frames are processed locally via WebAssembly and never uploaded
- **One server call** — after liveness passes, a single `POST /api/idv/complete` mints an HS256 JWT containing only the OCR-extracted name and document number (no images, no biometrics)
- **Session storage only** — identity data lives in `sessionStorage` and is cleared after the binding step
- **AI-generated test assets** — the mock persona face is from [thispersondoesnotexist.com](https://thispersondoesnotexist.com), not a real person; the test ID is fictional

---

## Disclaimer

This project is for **educational and demonstration purposes only**. It is not a production identity verification system and should not be used to make real identity decisions. The IAL assurance levels described are illustrative — they do not represent a certified compliance with NIST SP 800-63 or any other identity standard.

---

## Built with

[![Built with Claude Code](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet?logo=anthropic)](https://claude.ai/claude-code)

Developed with [Claude Code](https://claude.ai/claude-code) by Anthropic.

---

## License

MIT — see [LICENSE](LICENSE)
