#!/usr/bin/env bash
set -euo pipefail

echo "[permissions-demo] Showing current permissions on scripts:"
ls -la scripts

echo
echo "[permissions-demo] Simulating a CI failure: removing execute bit from build.sh"
chmod 644 scripts/build.sh

echo
echo "[permissions-demo] Attempting to run ./scripts/build.sh (should fail):"
set +e
./scripts/build.sh
BUILD_EXIT_CODE=$?
set -e

echo "[permissions-demo] Exit code: ${BUILD_EXIT_CODE}"
echo "This models a CI 'permission denied' failure."

echo
echo "[permissions-demo] Fixing permissions with chmod +x scripts/build.sh"
chmod +x scripts/build.sh
ls -la scripts/build.sh

echo
echo "[permissions-demo] Demonstrating chown (requires sudo):"
echo "sudo chown root:root config/secrets.env"
echo "This models secrets owned by root with 600 permissions on a production server."

