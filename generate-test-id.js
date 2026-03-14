/**
 * One-time script: generates test-id.svg (fictional sample driver's license)
 * with persona-face.jpg embedded as base64. No native deps needed.
 * Run: node generate-test-id.js
 */

const fs   = require('fs');
const path = require('path');

const faceJpgPath = path.join(__dirname, 'app/src/public/assets/persona-face.jpg');
const outPath     = path.join(__dirname, 'app/src/public/assets/test-id.svg');

if (!fs.existsSync(faceJpgPath)) {
    console.error('persona-face.jpg not found at:', faceJpgPath);
    process.exit(1);
}

const faceB64 = fs.readFileSync(faceJpgPath).toString('base64');
const faceDataUrl = `data:image/jpeg;base64,${faceB64}`;

// SVG dimensions — standard DL size ratio (3.375" x 2.125" = ~1.59:1)
const W = 640, H = 400;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="#f0f4ff" rx="12"/>

  <!-- Top bar -->
  <rect width="${W}" height="52" fill="#1a3a6b" rx="12"/>
  <rect y="40" width="${W}" height="12" fill="#1a3a6b"/>

  <!-- State name -->
  <text x="${W/2}" y="32" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="22" font-weight="bold"
        fill="white" letter-spacing="4">WASHINGTON</text>
  <text x="${W/2}" y="48" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="10" fill="#a0c0ff"
        letter-spacing="2">DRIVER LICENSE</text>

  <!-- Bottom bar -->
  <rect y="${H - 36}" width="${W}" height="36" fill="#1a3a6b" rx="12"/>
  <rect y="${H - 48}" width="${W}" height="12" fill="#1a3a6b"/>
  <text x="${W/2}" y="${H - 14}" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="9" fill="#7090cc"
        letter-spacing="1">NOT FOR FEDERAL IDENTIFICATION · FOR DEMO PURPOSES ONLY</text>

  <!-- Photo placeholder background -->
  <rect x="16" y="64" width="140" height="175" fill="#c8d8f0" rx="4"/>

  <!-- Embedded face photo -->
  <image x="16" y="64" width="140" height="175" rx="4"
         href="${faceDataUrl}"
         preserveAspectRatio="xMidYMid slice"/>

  <!-- Photo border -->
  <rect x="16" y="64" width="140" height="175" fill="none"
        stroke="#1a3a6b" stroke-width="2" rx="4"/>

  <!-- Signature line -->
  <line x1="16" x2="156" y1="255" y2="255" stroke="#1a3a6b" stroke-width="1"/>
  <text x="16" y="268" font-family="Arial, sans-serif" font-size="8" fill="#555">SIGNATURE</text>

  <!-- Field area (right of photo) -->
  <g font-family="Arial, sans-serif">

    <!-- Name -->
    <text x="172" y="82" font-size="9" fill="#666">NAME</text>
    <text x="172" y="98" font-size="15" font-weight="bold" fill="#1a1a2e">Jane Elizabeth Smith</text>

    <!-- DOB -->
    <text x="172" y="120" font-size="9" fill="#666">DATE OF BIRTH</text>
    <text x="172" y="136" font-size="13" font-weight="bold" fill="#1a1a2e">03/15/1990</text>

    <!-- DL Number (with ICAO check digit appended) -->
    <text x="172" y="158" font-size="9" fill="#666">DL NUMBER</text>
    <text x="172" y="174" font-size="13" font-weight="bold" fill="#1a1a2e">D1234567WA9</text>

    <!-- Address -->
    <text x="172" y="196" font-size="9" fill="#666">ADDRESS</text>
    <text x="172" y="210" font-size="11" fill="#1a1a2e">4521 Maple Ave NW</text>
    <text x="172" y="224" font-size="11" fill="#1a1a2e">Seattle, WA 98103</text>

    <!-- Sex / Eyes / Ht -->
    <text x="172" y="248" font-size="9" fill="#666">SEX</text>
    <text x="172" y="262" font-size="11" fill="#1a1a2e">F</text>

    <text x="220" y="248" font-size="9" fill="#666">EYES</text>
    <text x="220" y="262" font-size="11" fill="#1a1a2e">BRN</text>

    <text x="268" y="248" font-size="9" fill="#666">HT</text>
    <text x="268" y="262" font-size="11" fill="#1a1a2e">5-05</text>

    <!-- Expiry -->
    <text x="360" y="248" font-size="9" fill="#666">EXPIRES</text>
    <text x="360" y="262" font-size="11" fill="#1a1a2e">03/15/2029</text>

    <!-- Class -->
    <text x="460" y="248" font-size="9" fill="#666">CLASS</text>
    <text x="460" y="262" font-size="11" fill="#1a1a2e">C</text>

    <!-- Issue date -->
    <text x="360" y="156" font-size="9" fill="#666">ISSUED</text>
    <text x="360" y="170" font-size="11" fill="#1a1a2e">03/15/2024</text>

  </g>

  <!-- Barcode placeholder (bottom area) -->
  <rect x="172" y="272" width="250" height="48" fill="#222" rx="2"/>
  <text x="297" y="302" text-anchor="middle" font-family="monospace"
        font-size="8" fill="#555">█ ▌█▌ ▌█ ▌▌█ ▌█▌ █ ▌█▌ ▌█</text>
  <text x="297" y="314" text-anchor="middle" font-family="monospace"
        font-size="7" fill="#666">D1234567WA9 19900315</text>

  <!-- SAMPLE watermark — diagonal, prominent -->
  <g opacity="0.22" transform="rotate(-32, ${W/2}, ${H/2})">
    <text x="${W/2}" y="${H/2 + 10}" text-anchor="middle"
          font-family="Arial Black, Arial, sans-serif" font-size="68"
          font-weight="900" fill="#cc0000" letter-spacing="6">SAMPLE</text>
    <text x="${W/2}" y="${H/2 + 68}" text-anchor="middle"
          font-family="Arial, sans-serif" font-size="18"
          font-weight="bold" fill="#cc0000" letter-spacing="2">NOT A REAL DOCUMENT</text>
  </g>

</svg>`;

fs.writeFileSync(outPath, svg, 'utf8');
console.log('Generated:', outPath);
console.log('Size:', Math.round(fs.statSync(outPath).size / 1024) + 'KB');
