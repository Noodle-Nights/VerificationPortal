'use strict';
(async function () {
  try {
    const res  = await fetch('/api/build');
    const data = await res.json();
    const yearEl = document.getElementById('footerYear');
    const hashEl = document.getElementById('footerHash');
    if (yearEl) yearEl.textContent = data.year;
    if (hashEl) hashEl.textContent = data.gitHash;
  } catch { /* footer is non-critical, fail silently */ }
}());
