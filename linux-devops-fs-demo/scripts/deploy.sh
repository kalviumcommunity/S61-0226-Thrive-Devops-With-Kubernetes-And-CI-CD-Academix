#!/usr/bin/env bash
set -euo pipefail

APP_NAME="linux-devops-fs-demo"
APP_PORT="${APP_PORT:-8080}"

echo "[deploy] Stopping any existing container:"
docker rm -f "${APP_NAME}" >/dev/null 2>&1 || true

echo
echo "[deploy] Starting container on port ${APP_PORT}:"
docker run -d --name "${APP_NAME}" -p "${APP_PORT}:8080" "${APP_NAME}:latest"

echo
echo "[deploy] Waiting for app to start..."
sleep 3

echo
echo "[deploy] Checking processes inside the container (ps aux):"
docker exec "${APP_NAME}" ps aux

echo
echo "[deploy] Checking listening ports inside the container (ss -tuln):"
if docker exec "${APP_NAME}" command -v ss >/dev/null 2>&1; then
  docker exec "${APP_NAME}" ss -tuln
elif docker exec "${APP_NAME}" command -v netstat >/dev/null 2>&1; then
  docker exec "${APP_NAME}" netstat -tuln
else
  echo "[deploy] Neither ss nor netstat found inside container."
fi

echo
echo "[deploy] Curling localhost from the host:"
curl -v "http://localhost:${APP_PORT}" || true

echo
echo "[deploy] Deployment script completed."

