const BASE = '/idv-demo';

const PROVIDER_META = {
    google: {
        label:       'Google',
        description: 'Mock Google OAuth claims (OpenID Connect) — what you\'d receive after a real sign-in.',
        claimFields: (c) => [
            ['sub',            c.sub],
            ['name',           c.name],
            ['given_name',     c.given_name],
            ['family_name',    c.family_name],
            ['email',          c.email],
            ['email_verified', String(c.email_verified)],
            ['picture',        c.picture],
            ['locale',         c.locale],
            ['hd',             c.hd === null ? 'null' : c.hd]
        ]
    },
    microsoft: {
        label:       'Microsoft',
        description: 'Mock Microsoft Identity Platform v2.0 claims — note oid as the stable identifier and tid (tenant ID).',
        claimFields: (c) => [
            ['oid',                c.oid],
            ['sub',                c.sub],
            ['name',               c.name],
            ['given_name',         c.given_name],
            ['family_name',        c.family_name],
            ['preferred_username', c.preferred_username],
            ['email',              c.email],
            ['email_verified',     String(c.email_verified)],
            ['tid',                c.tid],
            ['ver',                c.ver]
        ]
    },
    facebook: {
        label:       'Facebook',
        description: 'Mock Facebook Login claims — notice id instead of sub, verified (account status) instead of email_verified, and no given_name/family_name.',
        claimFields: (c) => [
            ['id',       c.id],
            ['sub',      c.sub],
            ['name',     c.name],
            ['email',    c.email],
            ['verified', String(c.verified)],
            ['locale',   c.locale]
        ]
    }
};

function loadClaims() {
    const raw = sessionStorage.getItem('tier1');
    if (!raw) { window.location.href = BASE + '/'; return; }
    try {
        const data = JSON.parse(raw);
        renderClaims(data);
    } catch (e) {
        document.getElementById('loading').innerHTML =
            '<p style="color:#dc2626">Failed to load claims. <a href="/idv-demo/">Return to start</a></p>';
    }
}

function renderClaims(data) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('claims-content').classList.remove('hidden');

    const provider = data.provider || 'google';
    const meta     = PROVIDER_META[provider] || PROVIDER_META.google;
    const claims   = data.claims;

    document.getElementById('provider-description').textContent = meta.description;

    document.getElementById('avatar').src = claims.picture || '';
    document.getElementById('display-name').textContent  = claims.name  || '';
    document.getElementById('display-email').textContent = claims.email || '';

    const verifiedVal = claims.email_verified;
    document.getElementById('email-verified-badge').textContent =
        verifiedVal === true  ? '✅ email_verified' :
        verifiedVal === false ? '⚠️ email not verified' :
        claims.verified === true ? '✅ account verified' : '— not provided';

    const claimsGrid = document.getElementById('claims-grid');
    claimsGrid.innerHTML = meta.claimFields(claims).map(([k, v]) => `
        <div class="key">${esc(k)}</div>
        <div class="val"><code>${esc(String(v ?? ''))}</code></div>
    `).join('');

    document.getElementById('token-meta-json').textContent =
        JSON.stringify({
            token_type: data.tokenMeta.token_type,
            scope:      data.tokenMeta.scope,
            expires_in: data.tokenMeta.expires_in
        }, null, 2);

    document.getElementById('id-token-json').textContent =
        JSON.stringify(data.tokenMeta.idTokenDecoded, null, 2);

    document.getElementById('raw-json').textContent = JSON.stringify(data, null, 2);
}

function esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.getElementById('signout-btn').addEventListener('click', () => {
    sessionStorage.clear();
    window.location.href = BASE + '/';
});

loadClaims();
