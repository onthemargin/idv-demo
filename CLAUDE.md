# IDV Demo

Consumer Identity Verification flow demo — document OCR, face liveness, credential binding.

## Tech Stack
- Node.js + Express (port 3002)
- Tesseract.js (OCR), @vladmandic/face-api (liveness)
- Jaro-Winkler fuzzy matching
- Zero-upload: all processing happens in-browser

## Key Files
- `app/src/server.js` — backend
- `app/src/public/` — frontend (HTML, JS, CSS)
- Face-api WASM models bundled

## Flow
Mock OAuth -> social claims -> document scan -> liveness check -> binding analysis -> signed JWT credential

## Rules
- Never read or display .env files or secrets
- Do not push to main without /deploy
