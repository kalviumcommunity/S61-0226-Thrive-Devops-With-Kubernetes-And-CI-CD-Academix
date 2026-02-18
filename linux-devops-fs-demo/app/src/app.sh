#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${APP_ROOT}/../logs"
CONFIG_DIR="${APP_ROOT}/../config"

mkdir -p "${LOG_DIR}"

if [[ -f "${CONFIG_DIR}/app.env" ]]; then
  # shellcheck disable=SC1090
  source "${CONFIG_DIR}/app.env"
fi

PORT="${APP_PORT:-8080}"
LOG_FILE="${LOG_DIR}/app.log"

echo "[app] Starting simple HTTP server on port ${PORT}" | tee -a "${LOG_FILE}"
echo "[app] Using config from ${CONFIG_DIR}" | tee -a "${LOG_FILE}"
echo "[app] Current directory: $(pwd)" | tee -a "${LOG_FILE}"

while true; do
  RESPONSE="HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nHello from DevOps filesystem demo on port ${PORT}\n"
  echo -e "${RESPONSE}" | nc -l -p "${PORT}" >> "${LOG_FILE}" 2>&1
done

