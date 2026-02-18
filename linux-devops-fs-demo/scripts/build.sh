#!/usr/bin/env bash
set -euo pipefail

echo "[build] Current directory (pwd):"
pwd

echo
echo "[build] Listing files (ls -la):"
ls -la

echo
echo "[build] Project tree (if 'tree' is installed):"
if command -v tree >/dev/null 2>&1; then
  tree
else
  echo "tree command not found; install it with: sudo apt-get install tree"
fi

echo
echo "[build] Ensuring scripts are executable (chmod +x):"
chmod +x scripts/*.sh

echo
echo "[build] Setting secure permissions for config and secrets:"
chmod 644 config/app.env config/app.conf
chmod 600 config/secrets.env

echo
echo "[build] Showing permissions (ls -la config):"
ls -la config

echo
echo "[build] Building Docker image:"
docker build -t linux-devops-fs-demo:latest app

echo
echo "[build] Build completed successfully."

