# Noodle Nights Verification Portal — Technical Documentation

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

> For a plain-English overview aimed at end users, see [README.md](README.md).

---

## Architecture overview

- **Runtime**: Node.js 22 LTS (via NodeSource RPM)
- **Framework**: Express 4.x
- **Session store**: `express-session` (in-process, no external store)
- **File handling**: `multer` `memoryStorage()` — uploads never touch the filesystem
- **Auth**: Discord OAuth2 (guild + role gated)
- **Reverse proxy**: nginx 1.26 with Cloudflare Origin CA (Full Strict SSL)
- **Process manager**: systemd service running as a dedicated `nodeapp` system user
- **Host**: Hetzner CX33 (8 GB RAM) — AlmaLinux 10.1

---

## How it works

1. **User** uploads their ID at `/` — receives a UUID v4 verification code.
2. **User** shares the code with a staff member via Discord DM.
3. **Staff** signs in to `/staff` with Discord OAuth2 (guild + role validated server-side).
4. **Staff** pastes the code — a mandatory one-time-view warning appears before the image is shown.
5. **Staff** confirms → sees the document for up to 15 minutes → clicks **Done**.
6. `Buffer.fill(0)` zeroes the memory, then the entry is deleted. The image is unrecoverable.

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

## Local setup

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

---

## API routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/` | GET | — | User upload portal |
| `/staff` | GET | — | Staff portal (Discord login) |
| `/auth/discord` | GET | — | Initiates Discord OAuth2 flow |
| `/auth/discord/callback` | GET | — | OAuth callback — validates guild + role |
| `/auth/discord/logout` | POST | Staff session | Destroys session |
| `/api/upload` | POST | — | Upload ID image, returns UUID |
| `/api/status/:uuid` | GET | — | Poll verification status |
| `/api/staff/me` | GET | Staff session | Returns authenticated staff user |
| `/api/staff/lookup` | POST | Staff session | Claim a document by UUID |
| `/api/staff/image/:uuid` | GET | Staff session + ownership | Serve document buffer (no-cache) |
| `/api/staff/done/:uuid` | POST | Staff session + ownership | Zero memory, mark reviewed |
| `/api/build` | GET | — | Returns `{ year, gitHash }` for footer |

---

## Production deployment

### Server provisioning

A [`hetzner-cloud-init.yaml`](hetzner-cloud-init.yaml) file is included to fully automate server provisioning on Hetzner with AlmaLinux 10. It installs Node.js 22, nginx, PM2, creates the `nodeapp` system user, writes the systemd service unit, and starts everything on boot.

The complete server setup session was recorded and published:

**[Watch the server setup recording on asciinema →](https://asciinema.org/a/983758)**

> The only information removed from this recording before publishing is the server's IP addresses, SSH host keys/fingerprints/randomart, and SSL certificate + private key. All commands, output, configuration, and timing are shown exactly as they happened.

### Manual steps after provisioning

1. Set `NODE_ENV=production` and all Discord variables in `/opt/secure-id-process/.env`
2. Place your Cloudflare Origin CA certificate and private key at `/var/ssl/noodlenights/fullchain.pem` and `privkey.pem`
3. Copy [`nginx.conf`](nginx.conf) to `/etc/nginx/nginx.conf` and place the vhost config in `/etc/nginx/conf.d/`
4. `nginx -t && systemctl restart nginx`
5. `systemctl start verification-portal`

### SSH hardening

[`scripts/harden-ssh.sh`](scripts/harden-ssh.sh) is provided for AlmaLinux 10. It:
- Writes a drop-in to `/etc/ssh/sshd_config.d/99-hardened.conf`
- Patches the main `sshd_config` to override any `PermitRootLogin yes` set after the `Include` line
- Patches other drop-ins (e.g. `50-cloud-init.conf`) that re-enable password authentication
- Validates config with `sshd -t` before restarting — reverts automatically on failure
- Disables: password auth, weak KEX, weak ciphers, weak MACs, X11 forwarding
- Keeps root login available via key only (`prohibit-password`)

### systemd service

The service unit (written by cloud-init) runs as `nodeapp` with:

```ini
User=nodeapp
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/opt/secure-id-process
```

### Firewall

Inbound rules (managed at Hetzner cloud level):
- **Port 22** — SSH, restricted to your own IP only
- **Port 443** — HTTPS, Cloudflare IP ranges only (IPv4 + IPv6)
- **Port 80** — closed (Cloudflare handles HTTP → HTTPS redirect before it reaches the origin)

---

## File structure

```
├── server.js                     # Express server — all routes and business logic
├── generate-hash.js              # Utility: generate SESSION_SECRET
├── nginx.conf                    # nginx reverse proxy config
├── hetzner-cloud-init.yaml       # Cloud-init for automated server provisioning
├── setup.cast                    # Asciinema recording of server setup (sanitized)
├── .env.example                  # Environment variable reference
├── scripts/
│   └── harden-ssh.sh             # SSH hardening script for AlmaLinux 10
├── docs/
│   └── portal-firewall.png       # Hetzner firewall rule screenshot
└── public/
    ├── index.html                # User upload portal
    ├── staff.html                # Staff portal
    ├── css/style.css             # Glassmorphism UI design system
    └── js/
        ├── upload.js             # User portal logic
        ├── staff.js              # Staff portal logic
        ├── footer.js             # Footer build info (year + git hash)
        └── no-save.js            # Right-click / drag / keyboard save prevention
```

---

## License

MIT © Noodle Nights
