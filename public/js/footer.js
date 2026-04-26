'use strict';
(async function () {
  try {
    const res  = await fetch('/api/build');
    const data = await res.json();
    const yearEl = document.getElementById('footerYear');
    const hashEl = document.getElementById('footerHash');
    if (yearEl) yearEl.textContent = data.year;
    if (hashEl) {
      if (data.gitHash && data.gitHash !== 'unknown') {
        const a = document.createElement('a');
        a.href        = `https://github.com/Noodle-Nights/VerificationPortal/commit/${data.gitHash}`;
        a.target      = '_blank';
        a.rel         = 'noopener noreferrer';
        a.className   = 'footer-link';
        a.textContent = data.gitHash;
        hashEl.replaceWith(a);
      } else {
        hashEl.textContent = 'dev';
      }
    }
  } catch { /* footer is non-critical, fail silently */ }
}());
