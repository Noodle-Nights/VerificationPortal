'use strict';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const loginState    = document.getElementById('loginState');
const lookupState   = document.getElementById('lookupState');
const warningState  = document.getElementById('warningState');
const viewerState   = document.getElementById('viewerState');
const doneState     = document.getElementById('doneState');

const loginError        = document.getElementById('loginError');
const discordLoginBtn   = document.getElementById('discordLoginBtn');
const navUserEl         = document.getElementById('navUser');
const staffUserEl       = document.getElementById('staffUser');
const logoutBtn         = document.getElementById('logoutBtn');

const lookupForm        = document.getElementById('lookupForm');
const hashLookupInput   = document.getElementById('hashLookupInput');
const lookupError       = document.getElementById('lookupError');

const cancelWarningBtn  = document.getElementById('cancelWarningBtn');
const confirmViewBtn    = document.getElementById('confirmViewBtn');

const timerDisplay      = document.getElementById('timerDisplay');
const timerBlock        = document.getElementById('timerBlock');
const docContainer      = document.getElementById('docContainer');
const doneBtn           = document.getElementById('doneBtn');
const doneConfirmHint   = document.getElementById('doneConfirmHint');

const reviewAnotherBtn  = document.getElementById('reviewAnotherBtn');

// State
let currentHash       = null;
let viewExpiresAt     = null;
let timerInterval     = null;
let doneConfirmActive = false;
let doneConfirmTimer  = null;

// ─── Init — check if already authenticated ────────────────────────────────────
(async function init() {
  try {
    const res = await fetch('/api/staff/me');
    if (res.ok) {
      const { user } = await res.json();
      showDashboard(user);
    } else {
      location.href = '/staff/login';
    }
  } catch {
    location.href = '/staff/login';
  }
}());

// Reset to clean state if browser restores page from bfcache
window.addEventListener('pageshow', (e) => {
  if (e.persisted) location.reload();
});

// ─── Panel management ────────────────────────────────────────────────────────
function showPanel(target) {
  [loginState, lookupState, warningState, viewerState, doneState].forEach(p => {
    p.hidden = (p !== target);
  });
  // Show nav user info only when authenticated
  navUserEl.hidden = (target === loginState);
}

function showDashboard(user) {
  if (user) {
    const avatarUrl = user.avatar
      ? '/api/staff/avatar'
      : null;

    clearNode(staffUserEl);

    if (avatarUrl) {
      const img = document.createElement('img');
      img.src       = avatarUrl;
      img.className = 'staff-avatar';
      img.alt       = '';
      img.width     = 32;
      img.height    = 32;
      img.onerror = () => { img.style.display = 'none'; };
      staffUserEl.appendChild(img);
    }

    const name = document.createElement('span');
    name.textContent = user.username;
    staffUserEl.appendChild(name);

    const badge = document.createElement('span');
    badge.className   = 'staff-badge';
    badge.textContent = 'Staff';
    staffUserEl.appendChild(badge);
  }

  showPanel(lookupState);
}

// ─── OAuth error messages ─────────────────────────────────────────────────────
function oauthErrorMessage(code) {
  const messages = {
    not_configured:    'Discord auth is not configured on this server.',
    invalid_state:     'Security check failed. Please try signing in again.',
    invalid_code:      'Invalid authorisation code. Please try again.',
    token_failed:      'Could not exchange Discord token. Please try again.',
    token_missing:     'Discord did not return a token. Please try again.',
    user_fetch_failed: 'Could not retrieve your Discord profile.',
    not_in_guild:      'You must be a member of the authorised Discord server.',
    missing_role:      'You do not have the required role to access this portal.',
    member_fetch_failed: 'Could not verify your server membership. Please try again.',
    session_error:     'Session error. Please try signing in again.',
    internal_error:    'An internal error occurred. Please try again.',
    access_denied:     'Access was denied. Authorise the app to continue.',
  };
  return messages[code] || `Sign-in failed (${code}). Please try again.`;
}

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = false;
}

// ─── Logout ───────────────────────────────────────────────────────────────────
logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/auth/discord/logout', { method: 'POST' });
  } finally {
    currentHash = null;
    clearNode(docContainer);
    stopTimer();
    location.href = '/staff/login';
  }
});

// ─── Lookup form ─────────────────────────────────────────────────────────────────────
lookupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const hash = hashLookupInput.value.trim().toLowerCase();
  if (!hash) return;

  hideLookupError();

  const submitBtn = lookupForm.querySelector('button[type="submit"]');
  submitBtn.disabled    = true;
  submitBtn.textContent = 'Looking up…';

  try {
    const res  = await fetch('/api/staff/lookup', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ hash }),
    });
    const data = await res.json();

    submitBtn.disabled    = false;
    submitBtn.textContent = 'Look Up';

    if (res.status === 401) { handleUnauth(); return; }

    if (!res.ok) {
      showLookupError(data.error || 'Lookup failed. Please try again.');
      return;
    }

    // Document claimed — show one-time view warning
    currentHash   = hash;
    viewExpiresAt = data.viewExpiresAt;
    showPanel(warningState);

  } catch {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Look Up';
    showLookupError('Network error. Please try again.');
  }
});

function showLookupError(msg) {
  lookupError.textContent = '⚠ ' + msg;
  lookupError.hidden = false;
}
function hideLookupError() {
  lookupError.hidden = true;
  lookupError.textContent = '';
}

// ─── Warning state ────────────────────────────────────────────────────────────
cancelWarningBtn.addEventListener('click', () => {
  // Staff cancelled — do NOT call /done because they haven't viewed anything.
  // The document remains claimed for up to 15 min before auto-purge.
  // This is intentional — claiming is irreversible to prevent replay attacks.
  currentHash = null;
  showPanel(lookupState);
  hashLookupInput.value = '';
});

confirmViewBtn.addEventListener('click', () => {
  if (!currentHash) return;
  confirmViewBtn.disabled    = true;
  confirmViewBtn.textContent = 'Loading…';
  openViewer(currentHash);
});

// ─── Viewer ───────────────────────────────────────────────────────────────────
function openViewer(hash) {
  clearNode(docContainer);
  renderImage(hash);
  showPanel(viewerState);
  startTimer(viewExpiresAt || (Date.now() + 15 * 60_000));
}

function renderImage(hash) {
  const img = document.createElement('img');
  img.className = 'doc-img';
  img.alt       = 'Identity document';
  img.src       = `/api/staff/image/${encodeURIComponent(hash)}`;
  img.onerror   = () => {
    clearNode(docContainer);
    appendError(docContainer, 'Failed to load document. The 15-minute viewing window may have expired.');
  };
  docContainer.appendChild(img);
}

// ─── Timer ───────────────────────────────────────────────────────────────────
function startTimer(expiresAt) {
  stopTimer();

  function tick() {
    const rem = expiresAt - Date.now();
    if (rem <= 0) {
      timerDisplay.textContent = '00:00';
      timerBlock.className = 'timer-block timer-danger';
      stopTimer();
      // Auto-submit Done when timer expires
      finaliseDone();
      return;
    }
    const m = Math.floor(rem / 60_000);
    const s = Math.floor((rem % 60_000) / 1000);
    timerDisplay.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    if (rem < 2 * 60_000) timerBlock.className = 'timer-block timer-danger';
    else if (rem < 5 * 60_000) timerBlock.className = 'timer-block timer-warn';
    else timerBlock.className = 'timer-block';
  }

  tick();
  timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ─── Done button (double-confirm pattern) ────────────────────────────────────
doneBtn.addEventListener('click', () => {
  if (doneConfirmActive) {
    // Second click — finalise
    clearTimeout(doneConfirmTimer);
    doneConfirmActive = false;
    doneConfirmHint.hidden = true;
    doneBtn.textContent = 'Destroying…';
    doneBtn.disabled = true;
    finaliseDone();
    return;
  }

  // First click — arm the confirm
  doneConfirmActive = true;
  doneBtn.textContent = 'Click again to confirm';
  doneBtn.classList.add('btn-done-confirm');
  doneConfirmHint.hidden = false;

  doneConfirmTimer = setTimeout(() => {
    doneConfirmActive = false;
    doneBtn.textContent = 'Mark as Done — Destroy Document';
    doneBtn.classList.remove('btn-done-confirm');
    doneConfirmHint.hidden = true;
  }, 3000);
});

async function finaliseDone() {
  if (!currentHash) return;

  stopTimer();
  clearNode(docContainer); // free image from browser memory

  try {
    const res = await fetch(`/api/staff/done/${encodeURIComponent(currentHash)}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 401) { handleUnauth(); return; }
    // Regardless of response, show done state — the server either wiped it or it expired
  } catch { /* network error — still show done, server auto-purges on expiry */ }

  currentHash = null;
  showPanel(doneState);

  // Reset done button
  doneBtn.disabled    = false;
  doneBtn.textContent = 'Mark as Done — Destroy Document';
  doneBtn.classList.remove('btn-done-confirm');
  doneConfirmHint.hidden = true;
}

// ─── Review another ───────────────────────────────────────────────────────────
reviewAnotherBtn.addEventListener('click', () => {
  hashLookupInput.value = '';
  hideLookupError();
  showPanel(lookupState);
});

// ─── Auth loss ────────────────────────────────────────────────────────────────
function handleUnauth() {
  stopTimer();
  clearNode(docContainer);
  currentHash = null;
  location.href = '/staff/login';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clearNode(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function appendError(container, msg) {
  const p = document.createElement('p');
  p.className   = 'doc-error';
  p.textContent = msg;
  container.appendChild(p);
}

// ─── Patch lookup to capture expiry ─────────────────────────────────────────
// We override the submit handler so viewExpiresAt is set when we enter warningState.
// This is done by intercepting the fetch response inside the handler above.
// To keep the code readable, we modify the lookup form submit listener inline:
(function patchLookup() {
  // Remove existing listener and re-add with mimeType capture
  const form = document.getElementById('lookupForm');

  // Clone to remove all existing listeners
  const fresh = form.cloneNode(true);
  form.parentNode.replaceChild(fresh, form);

  // Update refs after clone
  const newForm        = document.getElementById('lookupForm');
  const newHashInput   = document.getElementById('hashLookupInput');
  const newLookupError = document.getElementById('lookupError');

  // (re-added below in patchLookup IIFE without auto-format)

  newForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hash = newHashInput.value.trim().toLowerCase();
    if (!hash) return;

    newLookupError.hidden = true;
    newLookupError.textContent = '';

    const btn = newForm.querySelector('button[type="submit"]');
    btn.disabled    = true;
    btn.textContent = 'Looking up…';

    try {
      const res  = await fetch('/api/staff/lookup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ hash }),
      });
      const data = await res.json();

      btn.disabled    = false;
      btn.textContent = 'Look Up';

      if (res.status === 401) { handleUnauth(); return; }

      if (!res.ok) {
        newLookupError.textContent = '⚠ ' + (data.error || 'Lookup failed.');
        newLookupError.hidden = false;
        return;
      }

      // Capture expiry
      currentHash   = hash;
      viewExpiresAt = data.viewExpiresAt;

      showPanel(warningState);
      confirmViewBtn.disabled    = false;
      confirmViewBtn.textContent = 'I Understand — View Document';

    } catch {
      btn.disabled    = false;
      btn.textContent = 'Look Up';
      newLookupError.textContent = '⚠ Network error. Please try again.';
      newLookupError.hidden = false;
    }
  });
}());

