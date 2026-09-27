#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SCANNER_RUNTIME="${SCANNER_RUNTIME:-docker}"
PROWLER_IMAGE="${PROWLER_IMAGE:-ghcr.io/prowler-cloud/prowler:4.6.0}"
KUBESCAPE_IMAGE="${KUBESCAPE_IMAGE:-quay.io/kubescape/kubescape:v3.0.26}"
PROWLER_BINARY="${PROWLER_BINARY:-prowler}"
KUBESCAPE_BINARY="${KUBESCAPE_BINARY:-kubescape}"

fail=0

check() {
  local name="$1"
  shift
  if "$@" >/tmp/cspm-preflight.out 2>/tmp/cspm-preflight.err; then
    echo "[preflight] PASS ${name}"
  else
    echo "[preflight] FAIL ${name}"
    if [[ -s /tmp/cspm-preflight.err ]]; then
      sed 's/^/[preflight]   /' /tmp/cspm-preflight.err
    elif [[ -s /tmp/cspm-preflight.out ]]; then
      sed 's/^/[preflight]   /' /tmp/cspm-preflight.out
    fi
    fail=1
  fi
}

echo "[preflight] runtime=${SCANNER_RUNTIME}"

if [[ "$SCANNER_RUNTIME" == "docker" ]]; then
  check "docker.version" command -v docker
  check "docker.daemon" docker info
  check "image.prowler" docker image inspect "$PROWLER_IMAGE"
  check "image.kubescape" docker image inspect "$KUBESCAPE_IMAGE"
else
  check "binary.prowler" command -v "$PROWLER_BINARY"
  check "binary.kubescape" command -v "$KUBESCAPE_BINARY"
fi

rm -f /tmp/cspm-preflight.out /tmp/cspm-preflight.err

if [[ "$fail" -ne 0 ]]; then
  echo "[preflight] scanner runtime not ready"
  exit 1
fi

echo "[preflight] scanner runtime ready"
