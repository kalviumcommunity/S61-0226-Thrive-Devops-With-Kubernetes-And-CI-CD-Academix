#!/usr/bin/env bash
set -euo pipefail

echo "[inspect-ports] Listening TCP/UDP ports (ss -tuln):"
if command -v ss >/dev/null 2>&1; then
  ss -tuln | head -n 20
elif command -v netstat >/dev/null 2>&1; then
  netstat -tuln | head -n 20
else
  echo "Neither ss nor netstat found."
fi

