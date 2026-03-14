const BASE = '/idv-demo';

const PROVIDERS = {
    google:    { endpoint: BASE + '/api/mock-google',    label: 'Google' },
    microsoft: { endpoint: BASE + '/api/mock-microsoft', label: 'Microsoft' },
    facebook:  { endpoint: BASE + '/api/mock-facebook',  label: 'Facebook' }
};

async function signIn(provider) {
    const status = document.getElementById('signin-status');

    Object.keys(PROVIDERS).forEach(p => {
        const btn = document.getElementById(p + '-btn');
        btn.disabled = true;
        btn.style.opacity = '0.5';
    });

    document.getElementById('signin-provider').textContent = PROVIDERS[provider].label;
    status.classList.remove('hidden');
    status.style.display = 'flex';

    try {
        const res = await fetch(PROVIDERS[provider].endpoint, { method: 'POST' });
        if (!res.ok) throw new Error('Login failed');
        const data = await res.json();
        sessionStorage.setItem('tier1', JSON.stringify(data));
        await new Promise(r => setTimeout(r, 1000));
        window.location.href = BASE + '/dashboard';
    } catch (e) {
        status.innerHTML = '<span style="color:red">Sign-in failed. Please try again.</span>';
        Object.keys(PROVIDERS).forEach(p => {
            const btn = document.getElementById(p + '-btn');
            btn.disabled = false;
            btn.style.opacity = '1';
        });
    }
}

Object.keys(PROVIDERS).forEach(p => {
    document.getElementById(p + '-btn').addEventListener('click', () => signIn(p));
});

