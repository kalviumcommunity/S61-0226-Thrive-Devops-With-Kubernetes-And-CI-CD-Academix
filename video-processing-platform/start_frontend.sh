#!/bin/bash
# Bash script to launch frontend with clean state
cd "$(dirname "$0")/frontend"
# ensure no lingering process on 3000
if lsof -i :3000 >/dev/null 2>&1; then
  PID=$(lsof -i :3000 -t)
  kill -9 $PID
fi
rm -rf .next
npm run dev -- --turbo=false
