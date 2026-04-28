#!/usr/bin/env bash
# SSH hardening for AlmaLinux 10.1 (Hetzner CX-series)
# Assumptions:
#   - Root login via SSH key is kept (Hetzner firewall restricts source IPs)
#   - Password authentication is disabled entirely
#   - Run as root

set -euo pipefail

SSHD_CONFIG="/etc/ssh/sshd_config"
BACKUP="${SSHD_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  echo "ERROR: Run as root." >&2
  exit 1
fi

if [[ ! -f /root/.ssh/authorized_keys ]] || [[ ! -s /root/.ssh/authorized_keys ]]; then
  echo "ERROR: /root/.ssh/authorized_keys is missing or empty."
  echo "       Add your public key before running this script or you will be locked out."
  exit 1
fi

# ── Backup ────────────────────────────────────────────────────────────────────
cp "$SSHD_CONFIG" "$BACKUP"
echo "Backed up sshd_config → $BACKUP"

# ── Apply hardened config (drop-in override) ──────────────────────────────────
# Writing to /etc/ssh/sshd_config.d/ keeps the main file untouched and
# survives openssh package updates on AlmaLinux 9/10.
DROPIN="/etc/ssh/sshd_config.d/99-hardened.conf"

cat > "$DROPIN" << 'EOF'
# ── Authentication ────────────────────────────────────────────────────────────
PermitRootLogin             prohibit-password   # key-only root; no password
PubkeyAuthentication        yes
AuthorizedKeysFile          .ssh/authorized_keys
PasswordAuthentication      no
PermitEmptyPasswords        no
KbdInteractiveAuthentication no
UsePAM                      yes                 # keep PAM for account/session modules

# ── Unused auth methods ───────────────────────────────────────────────────────
GSSAPIAuthentication        no
HostbasedAuthentication     no
IgnoreRhosts                yes

# ── Session hardening ─────────────────────────────────────────────────────────
LoginGraceTime              20                  # seconds to authenticate
MaxAuthTries                3
MaxSessions                 5
MaxStartups                 5:30:10             # throttle unauthenticated connections

# ── Connection ────────────────────────────────────────────────────────────────
ClientAliveInterval         300                 # send keepalive every 5 min
ClientAliveCountMax         2                   # disconnect after 2 missed keepalives
TCPKeepAlive                no                  # rely on ClientAlive, not TCP-level keepalive

# ── Subsystems ────────────────────────────────────────────────────────────────
# SFTP kept — comment out if not needed
Subsystem sftp /usr/libexec/openssh/sftp-server

# ── Crypto (OpenSSH 9.x defaults on AlmaLinux 10 are already good; explicit for auditability) ──
KexAlgorithms               sntrup761x25519-sha512@openssh.com,curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group18-sha512,diffie-hellman-group16-sha512
Ciphers                     chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs                        hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
HostKeyAlgorithms           ssh-ed25519,sk-ssh-ed25519@openssh.com,rsa-sha2-512,rsa-sha2-256

# ── Misc ──────────────────────────────────────────────────────────────────────
X11Forwarding               no
AllowAgentForwarding        no
AllowTcpForwarding          no
PermitTunnel                no
PrintLastLog                yes
Banner                      none
EOF

# ── Patch main sshd_config — override any explicit values set after the Include ──
# AlmaLinux 10 sets PermitRootLogin yes explicitly after the Include line;
# first-match-wins means it would override our drop-in.
sed -i 's/^PermitRootLogin yes/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/'  "$SSHD_CONFIG"

# ── Disable conflicting drop-ins from other packages ─────────────────────────
# RHEL/AlmaLinux may ship drop-ins (e.g. 50-redhat.conf) that set
# PasswordAuthentication yes before our 99-hardened.conf is loaded.
for f in /etc/ssh/sshd_config.d/*.conf; do
  [[ "$f" == "$DROPIN" ]] && continue
  if grep -q "^PasswordAuthentication yes" "$f" 2>/dev/null; then
    sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' "$f"
    echo "Patched $f"
  fi
done

echo "Written $DROPIN"

# ── Validate & reload ─────────────────────────────────────────────────────────
echo "Validating sshd config…"
if ! sshd -t; then
  echo "ERROR: sshd config validation failed. Reverting drop-in." >&2
  rm -f "$DROPIN"
  exit 1
fi

echo "Restarting sshd…"
systemctl restart sshd

echo ""
echo "Done. SSH is hardened:"
echo "  ✓ Root login: key-only (prohibit-password)"
echo "  ✓ Password auth: disabled"
echo "  ✓ Grace time: 20s, MaxAuthTries: 3"
echo "  ✓ Weak KEX/ciphers/MACs: removed"
echo ""
echo "Keep this session open and test login in a NEW terminal before closing."
