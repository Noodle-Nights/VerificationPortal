'use strict';
// ─── Prevent casual saving of sensitive content ───────────────────────────────
// These are deterrents for well-intentioned users, not hard security controls.
// Real security is enforced server-side (buffer wipe, no-cache headers, TTLs).

// Disable right-click everywhere EXCEPT form controls (staff need paste)
document.addEventListener('contextmenu', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
  e.preventDefault();
});

// Disable drag-start (prevents drag-to-desktop of images)
document.addEventListener('dragstart', (e) => {
  e.preventDefault();
});

// Disable keyboard shortcuts that reveal or save page content
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  // Ctrl+S  — Save page
  // Ctrl+U  — View page source
  // Ctrl+P  — Print (could capture document image)
  if (ctrl && ['s', 'u', 'p'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    return;
  }

  // F12 / Ctrl+Shift+I — DevTools (browsers may ignore this, but attempt it)
  if (e.key === 'F12' || (ctrl && e.shiftKey && e.key.toLowerCase() === 'i')) {
    e.preventDefault();
  }
});
