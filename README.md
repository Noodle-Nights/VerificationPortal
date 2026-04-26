# Noodle Nights Verification Portal

A secure, privacy-first age verification platform. Users upload a photo ID; a staff member verifies the date of birth via a one-time-view flow. **Nothing is ever written to disk** — all documents live in RAM and are cryptographically wiped after review or expiry.

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## How it works

1. **User** uploads their ID at `/` and receives a UUID verification code (e.g. `a3b7f2c1-d4e5-4f6a-b7c8-d9e0f1a2b3c4`).
2. **User** shares the code with a staff member via Discord DM.
3. **Staff** signs in to `/staff` with Discord OAuth (guild + role gated).
4. **Staff** pastes the code — a mandatory one-time-view warning appears.
5. **Staff** confirms, sees the document for up to 15 minutes, then clicks **Done**.
6. The buffer is **zeroed in memory** and deleted. The document cannot be recovered.

---

## Security design

| Property | Detail |
|---|---|
| Storage | RAM only — `multer` `memoryStorage()`, zero disk writes |
| Authentication | Discord OAuth2 — must be in specific guild + hold a specific role |
| Session hardening | `session.regenerate()` on login; `httpOnly`, `sameSite: lax`, `secure` in production |
| CSRF protection | Random 16-byte hex state token; deleted before comparison to prevent reuse on retry |
| Submission IDs | UUID v4 (122 bits entropy) via `crypto.randomUUID()` |
| TTLs | Pending: 24 h · Claimed: 15 min · Reviewed: 1 h |
| Capacity cap | `MAX_PENDING = 500` — rejects uploads when the pending store is full (prevents RAM exhaustion) |
| Wipe | `Buffer.fill(0)` before GC on review, expiry, or cleanup tick |
| Staff access | Hash-only lookup — staff cannot browse submissions |
| Ownership | Image and done routes verify the claiming staff member's Discord ID before serving |
| One-time view | Document claimed on first lookup; second lookup returns 409 |
| File validation | MIME allowlist (JPEG, PNG) + magic byte check — guards against MIME spoofing |
| Avatar proxy | Discord CDN avatar served via `/api/staff/avatar` (same-origin) — satisfies strict CSP; SSRF-safe via snowflake + hash regex |
| Discord API | Token revoked immediately after OAuth; all external calls timeout after 5 s |
| Session values | Discord API values (ID, avatar hash) validated against regex before storing in session |
| Headers | Helmet strict CSP (`defaultSrc/imgSrc/scriptSrc/styleSrc: 'self'`, `objectSrc/frameSrc: 'none'`), COEP, `no-store` cache on image route |
| Rate limiting | Upload: 5/15 min · Status: 40/5 min · Auth: 25/15 min · Staff: 20/5 min · Build: 30/1 min |

---

## Requirements

- **Node.js ≥ 18** (uses built-in `fetch` and `crypto.randomUUID`)
- A Discord application with OAuth2 configured
- (Production) nginx for SSL termination — see [`nginx.conf`](nginx.conf)

---

## Setup

### 1. Clone & install

```bash
git clone https://github.com/Noodle-Nights/VerificationPortal
cd VerificationPortal
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all values (see inline comments in `.env.example`):

| Variable | Description |
|---|---|
| `DISCORD_CLIENT_ID` | OAuth2 app client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 app client secret |
| `DISCORD_REDIRECT_URI` | Must match exactly what's set in the Discord developer portal |
| `DISCORD_GUILD_ID` | Server ID staff must be a member of |
| `DISCORD_REQUIRED_ROLE_ID` | Role ID staff must hold |
| `SESSION_SECRET` | Long random string — generate with `npm run secret` |
| `PORT` | HTTP port (default: `3000`) |
| `NODE_ENV` | `development` or `production` |

### 3. Create a Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** → give it a name
3. **OAuth2 → General**: copy **Client ID** and **Client Secret**
4. **OAuth2 → Redirects**: add your redirect URI (e.g. `http://localhost:3000/auth/discord/callback`)
5. Copy your **Guild (server) ID** and **Role ID** from Discord (requires Developer Mode)

### 4. Generate a session secret

```bash
npm run secret
# Copy the output SESSION_SECRET=... line into your .env
```

### 5. Run

```bash
npm start          # production
npm run dev        # development (auto-reload with nodemon)
```

The server starts at `http://localhost:3000`.

---

## Routes

| Route | Description |
|---|---|
| `GET /` | User upload portal |
| `GET /staff` | Staff portal (Discord login) |
| `GET /auth/discord` | Initiates Discord OAuth flow |
| `GET /auth/discord/callback` | OAuth callback — validates guild + role |
| `POST /auth/discord/logout` | Destroys session |
| `POST /api/upload` | Upload ID image, returns UUID |
| `GET /api/status/:uuid` | Poll verification status |
| `GET /api/staff/me` | Returns authenticated staff user |
| `POST /api/staff/lookup` | Claim a document by UUID |
| `GET /api/staff/image/:uuid` | Serve document buffer (staff only, no-cache) |
| `POST /api/staff/done/:uuid` | Wipe document and mark reviewed |
| `GET /api/build` | Returns `{ year, gitHash }` for footer |

---

## Production deployment

1. Set `NODE_ENV=production` in `.env`
2. Configure [`nginx.conf`](nginx.conf) — replace `yourdomain.com` with your domain and set Certbot cert paths
3. Move the two `limit_req_zone` lines in `nginx.conf` into your global nginx `http {}` block
4. `sudo nginx -t && sudo systemctl reload nginx`
5. Run the Node app with a process manager:

```bash
npm install -g pm2
pm2 start server.js --name verification-portal
pm2 save
```

---

## File structure

```
├── server.js           # Express server — all routes and business logic
├── generate-hash.js    # Utility: generate SESSION_SECRET
├── nginx.conf          # Nginx reverse proxy config (template)
├── .env.example        # Environment variable reference
└── public/
    ├── index.html      # User upload portal
    ├── staff.html      # Staff portal
    ├── css/style.css   # Glassmorphism UI design system
    └── js/
        ├── upload.js   # User portal logic
        ├── staff.js    # Staff portal logic
        ├── footer.js   # Footer build info (year + git hash)
        └── no-save.js  # Right-click / drag / keyboard save prevention
```

---

## License

MIT © Noodle Nights

