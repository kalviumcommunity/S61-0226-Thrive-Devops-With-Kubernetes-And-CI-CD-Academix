# CI Pipeline Outline for linux-devops-fs-demo

Steps:

1. Checkout code.
2. Install Docker and tree (if needed).
3. Run `./scripts/build.sh`.
4. Run `./scripts/deploy.sh`.
5. On failure, run `./scripts/inspect-processes.sh` and `./scripts/inspect-ports.sh` to collect diagnostics.

