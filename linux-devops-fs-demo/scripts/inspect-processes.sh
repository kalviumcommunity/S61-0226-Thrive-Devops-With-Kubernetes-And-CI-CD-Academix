#!/usr/bin/env bash
set -euo pipefail

echo "[inspect-processes] Top 5 CPU processes (ps aux | sort):"
ps aux --sort=-%cpu | head -n 6

echo
echo "[inspect-processes] One-shot top (top -b -n 1 | head):"
if command -v top >/dev/null 2>&1; then
  top -b -n 1 | head -n 10
else
  echo "top command not found."
fi

