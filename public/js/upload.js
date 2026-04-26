'use strict';

// ─── DOM refs ────────────────────────────────────────────────────────────────
const fileInput   = document.getElementById('fileInput');
const dropZone    = document.getElementById('dropZone');
const dropText    = document.getElementById('dropText');
const submitBtn   = document.getElementById('submitBtn');
const uploadForm  = document.getElementById('uploadForm');
const uploadCard  = document.getElementById('uploadCard');
const uploadError = document.getElementById('uploadError');
const hashCard    = document.getElementById('hashCard');
const hashDisplay = document.getElementById('hashDisplay');
const copyBtn     = document.getElementById('copyBtn');
const expiryCountdown = document.getElementById('expiryCountdown');
const statusInput  = document.getElementById('statusInput');
const statusForm   = document.getElementById('statusForm');
const statusResult = document.getElementById('statusResult');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');

const ALLOWED = new Set(['image/jpeg', 'image/png']);
let expiryTimerInterval = null;
let pollInterval = null;
let currentHash = null;

// ─── Status form submit — normalise UUID to lowercase ───────────────────────
statusForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const hash = statusInput.value.trim().toLowerCase();
  if (hash) checkStatus(hash);
});

// ─── File selection ───────────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    dropText.textContent = file.name;
    dropZone.classList.add('has-file');
    submitBtn.disabled = false;
  }
});

// ─── Drag and drop ───────────────────────────────────────────────────────────
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  if (!ALLOWED.has(file.type)) { showUploadError('Invalid file type. Only JPEG and PNG are accepted.'); return; }
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  dropText.textContent = file.name;
  dropZone.classList.add('has-file');
  submitBtn.disabled = false;
});

// ─── Upload ───────────────────────────────────────────────────────────────────
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!fileInput.files[0]) return;

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Uploading…';
  hideUploadError();

  const formData = new FormData();
  formData.append('idImage', fileInput.files[0]);

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      showUploadError(data.error || 'Upload failed. Please try again.');
      resetSubmitBtn();
      return;
    }

    currentHash = data.hash;
    renderHashDisplay(data.hash);
    startExpiryCountdown(data.expiresAt);

    uploadCard.hidden = true;
    hashCard.hidden   = false;

    // Pre-fill status input
    statusInput.value = data.hash;

    // Advance stepper
    setStep(2);

    // Start polling
    startPoll(data.hash);

  } catch {
    showUploadError('Network error. Please check your connection.');
    resetSubmitBtn();
  }
});

function resetSubmitBtn() {
  submitBtn.disabled    = false;
  submitBtn.textContent = 'Upload for Verification';
}

function showUploadError(msg) {
  uploadError.textContent = '⚠ ' + msg;
  uploadError.hidden = false;
}

function hideUploadError() {
  uploadError.hidden = true;
  uploadError.textContent = '';
}

// ─── Hash display (UUID groups) ──────────────────────────────────────────────
function renderHashDisplay(hash) {
  while (hashDisplay.firstChild) hashDisplay.removeChild(hashDisplay.firstChild);

  // UUID v4 has 5 dash-separated groups: 8-4-4-4-12
  hash.split('-').forEach((part, i, arr) => {
    const grp = document.createElement('span');
    grp.className   = 'uuid-group';
    grp.textContent = part;
    hashDisplay.appendChild(grp);
    if (i < arr.length - 1) {
      const sep = document.createElement('span');
      sep.className   = 'uuid-sep';
      sep.textContent = '-';
      hashDisplay.appendChild(sep);
    }
  });
}

// ─── Copy button ─────────────────────────────────────────────────────────────
copyBtn.addEventListener('click', () => {
  if (!currentHash) return;
  navigator.clipboard.writeText(currentHash).catch(() => {});
  copyBtn.textContent = '✓ Copied!';
  copyBtn.classList.add('copied');
  setTimeout(() => {
    copyBtn.textContent = 'Copy Code';
    copyBtn.classList.remove('copied');
  }, 2000);
});

// ─── Expiry countdown ─────────────────────────────────────────────────────────
function startExpiryCountdown(expiresAt) {
  clearInterval(expiryTimerInterval);

  function update() {
    const diff = expiresAt - Date.now();
    if (diff <= 0) {
      expiryCountdown.textContent = 'Expired';
      expiryCountdown.parentElement.classList.add('expired');
      clearInterval(expiryTimerInterval);
      return;
    }
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);

    expiryCountdown.textContent = `${h}h ${String(m).padStart(2, '0')}m`;

    const el = document.getElementById('expiryBanner');
    el.className = 'expiry-banner' + (h < 2 ? ' expiry-warn' : '');
  }

  update();
  expiryTimerInterval = setInterval(update, 30_000);
}

// ─── Status polling ───────────────────────────────────────────────────────────
function startPoll(hash) {
  clearInterval(pollInterval);
  pollInterval = setInterval(() => checkStatus(hash), 30_000);
}

// ─── Status check form ────────────────────────────────────────────────────────
statusForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const hash = statusInput.value.trim().toUpperCase();
  if (hash) checkStatus(hash);
});

async function checkStatus(hash) {
  try {
    const res  = await fetch(`/api/status/${encodeURIComponent(hash)}`);
    const data = await res.json();
    renderStatus(res.status, data, hash);
  } catch {
    renderStatusText('error', 'Network error — please try again.');
  }
}

function renderStatus(httpStatus, data, hash) {
  if (httpStatus === 400) { renderStatusText('error', 'Invalid code format. Expected XXXX-XXXX.'); return; }

  if (httpStatus === 404 || data.status === 'not_found') {
    renderStatusText('not-found',
      'Code not found — it may have expired after 24 hours or been entered incorrectly.');
    return;
  }

  const s = data.status;

  if (s === 'pending') {
    const expiresIn = data.expiresAt
      ? `Expires in ${formatDuration(data.expiresAt - Date.now())}.`
      : '';
    renderStatusRich('pending', '⏳', 'Waiting for staff',
      `Your document is in the queue. Share your code (${hash}) with a staff member via Discord DM. ${expiresIn}`);
    setStep(2);
  } else if (s === 'reviewing') {
    renderStatusRich('reviewing', '👁', 'Being reviewed now',
      'A staff member is currently viewing your document. It will be permanently destroyed once they finish.');
    setStep(3);
    clearInterval(pollInterval);
  } else if (s === 'reviewed') {
    const when = data.reviewedAt ? new Date(data.reviewedAt).toLocaleTimeString() : '';
    renderStatusRich('reviewed', '✅', 'Review complete',
      `Your document was reviewed${when ? ' at ' + when : ''}. Check with the staff member for their decision. The document has been permanently destroyed.`);
    setStep(3);
    clearInterval(pollInterval);
  }
}

function renderStatusRich(type, icon, title, body) {
  clearNode(statusResult);
  statusResult.className = `status-result status-${type}`;

  const iconEl  = document.createElement('span');
  iconEl.className   = 'sr-icon';
  iconEl.textContent = icon;

  const titleEl = document.createElement('strong');
  titleEl.textContent = title;

  const bodyEl  = document.createElement('p');
  bodyEl.textContent = body;

  statusResult.append(iconEl, titleEl, bodyEl);
}

function renderStatusText(type, text) {
  clearNode(statusResult);
  statusResult.className = `status-result status-${type}`;
  const p = document.createElement('p');
  p.textContent = text;
  statusResult.appendChild(p);
}

// ─── Step indicator ───────────────────────────────────────────────────────────
function setStep(n) {
  [step1, step2, step3].forEach((el, i) => {
    el.classList.toggle('active',    i + 1 === n);
    el.classList.toggle('complete',  i + 1 < n);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function clearNode(el) { while (el.firstChild) el.removeChild(el.firstChild); }

function formatDuration(ms) {
  if (ms <= 0) return '0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

