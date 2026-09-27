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

echo "[prewarm] runtime=${SCANNER_RUNTIME}"

if [[ "$SCANNER_RUNTIME" == "docker" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[prewarm] ERROR: docker not found in PATH"
    exit 1
  fi

  echo "[prewarm] pulling ${PROWLER_IMAGE}"
  docker pull "${PROWLER_IMAGE}"

  echo "[prewarm] pulling ${KUBESCAPE_IMAGE}"
  docker pull "${KUBESCAPE_IMAGE}"

  echo "[prewarm] done"
  exit 0
fi

if ! command -v "$PROWLER_BINARY" >/dev/null 2>&1; then
  echo "[prewarm] ERROR: prowler binary not found: ${PROWLER_BINARY}"
  exit 1
fi
if ! command -v "$KUBESCAPE_BINARY" >/dev/null 2>&1; then
  echo "[prewarm] ERROR: kubescape binary not found: ${KUBESCAPE_BINARY}"
  exit 1
fi

echo "[prewarm] local binaries present"
