#!/usr/bin/env bash
# Idempotent repository bootstrap for MKPK Inventaire Cloud Agents.
# Installs the toolchain needed to run a fully local, self-contained stack:
#   - Docker (used by the Supabase CLI local stack)
#   - Supabase CLI + postgresql-client
#   - Node dependencies
# Per-boot runtime (dockerd, `supabase start`, dev server) lives in start.sh / terminals.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

SUPABASE_CLI_VERSION="v2.117.0"

echo "==> Installing system packages (docker, fuse-overlayfs, postgresql-client)"
# Pre-seed fuse.conf so the fuse3 postinst does not block on a conffile prompt.
if [ ! -f /etc/fuse.conf ]; then
  echo 'user_allow_other' | sudo tee /etc/fuse.conf >/dev/null
fi
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq -o Dpkg::Options::=--force-confold \
  docker.io fuse-overlayfs fuse3 uidmap postgresql-client

echo "==> Configuring Docker daemon to use fuse-overlayfs (works inside the Cloud Agent VM)"
sudo mkdir -p /etc/docker
echo '{
  "storage-driver": "fuse-overlayfs"
}' | sudo tee /etc/docker/daemon.json >/dev/null

echo "==> Installing Supabase CLI ${SUPABASE_CLI_VERSION}"
if ! command -v supabase >/dev/null 2>&1 || [ "$(supabase --version 2>/dev/null)" != "${SUPABASE_CLI_VERSION#v}" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://github.com/supabase/cli/releases/download/${SUPABASE_CLI_VERSION}/supabase_linux_amd64.tar.gz" \
    -o "$tmp/supabase.tar.gz"
  tar -xzf "$tmp/supabase.tar.gz" -C "$tmp"
  sudo install -m 0755 "$tmp/supabase" /usr/local/bin/supabase
  rm -rf "$tmp"
fi
supabase --version

echo "==> Installing Node dependencies (npm ci)"
npm ci

echo "==> install.sh complete"
