# CI/CD Pipeline Design for Video Processing Platform (Sprint #3)

This document defines the intended CI/CD design for this project and maps it to the current repository workflows. The goal is to show intentional pipeline structure and boundaries, even before full enterprise-grade automation is introduced.

## 1) Pipeline Stages and Ordering

### Stage 0: Trigger and Source Control Context
- Trigger events: `pull_request`, `push` to `main`, and `workflow_dispatch`.
- Scope filters: backend/frontend/workflow path filters to avoid unnecessary runs.
- Purpose: start the pipeline only when relevant code changes.

### Stage 1: CI - Checkout and Environment Setup
- Checkout repository source.
- Set up runtime for each service:
	- Backend: Python 3.11
	- Frontend: Node.js 20
- Install dependencies with lock-aware install commands.
- Purpose: create deterministic, reproducible build/test environments.

### Stage 2: CI - Quality and Validation
- Backend quality gates:
	- Static checks (`flake8` F-series errors)
	- Unit/API tests (`pytest`)
- Frontend quality gates:
	- Lint (`npm run lint`)
	- Production build verification (`npm run build`)
- Purpose: prevent invalid code from progressing into artifact and deployment stages.

### Stage 3: CD - Artifact Creation and Publication
- Build versioned Docker images for backend and frontend.
- Tag images with hybrid semantic/build/commit tags and optional moving tag (`latest`).
- Push artifacts to container registry (Docker Hub in this project).
- Purpose: create deployable, traceable artifacts independent of source code.

#### Implemented Tag Format
- CI validation images (not pushed): `ci-<run-number>-sha.<short-sha>`
- CD release images (pushed): `<chart-version>-build.<run-number>-sha.<short-sha>`
- Example: `0.1.0-build.142-sha.a1b2c3d`

Tag inputs:
- `<chart-version>` from `video-processing-platform/charts/video-processing-platform/Chart.yaml`
- `<run-number>` from GitHub Actions `run_number`
- `<short-sha>` from the current commit SHA

### Stage 4: CD - Deployment
- Resolve deployment environment (`dev` or `prod`).
- Configure cluster credentials and validate required secrets/values.
- Deploy via Helm (`helm upgrade --install`) using base + env values.
- Purpose: release built artifacts to Kubernetes in a controlled manner.

### Stage 5: CD - Post-Deploy Verification
- Validate rollout status for backend and frontend Deployments.
- Confirm workload health after deployment.
- Purpose: detect failed rollouts quickly and enable rollback readiness.

---

## 2) CI vs CD Boundary (Explicit)

### CI responsibilities
- Integrate code changes safely.
- Run static checks, linting, tests, and build validation.
- Ensure merge confidence and fail fast on quality issues.

### CD responsibilities
- Convert verified code into deployable artifacts.
- Publish artifacts to registry.
- Deploy to target environment and verify rollout.

### Boundary definition used in this project
- **CI ends after quality validation gates pass (test/lint/build checks).**
- **CD begins at artifact packaging and continues through deploy + verification.**

This boundary is intentional: CI answers "is this change safe and valid?" while CD answers "can this validated change be released reliably?"

---

## 3) Project Workflow Mapping (Commit to Deployment)

```text
Developer commit/PR
	-> CI stage: setup + checks + tests/build validation
	-> CD stage: build/push backend + frontend Docker artifacts
	-> CD stage: Helm deployment to Kubernetes
	-> CD stage: rollout verification
```

### What runs on every commit/PR
- Service-specific CI workflows:
	- `.github/workflows/backend-ci.yml`
	- `.github/workflows/frontend-ci.yml`

### What runs on merge to main or manual promotion
- Deployment workflow:
	- `.github/workflows/deploy-k8s.yml`
- Default automated environment: `dev`.
- Optional manual selection: `dev` or `prod` via `workflow_dispatch` input.

### Approval and condition points
- Production promotion should be controlled by environment protection rules in GitHub Environments (`prod` approval gate).
- Deployment requires configured secrets (kubeconfig, registry credentials, app secrets).

---

## 4) Why This Stage Separation Improves Reliability, Speed, and Safety

- **Reliability:** Defects are blocked in CI before artifact creation and deployment.
- **Speed:** Path filters reduce unnecessary runs; parallel backend/frontend flows shorten feedback time.
- **Safety:** CD deployment consumes immutable image tags (`sha`) and verifies rollout status before considering release successful.
- **Traceability:** A deployed version maps directly to a Git commit hash through image tags.

### Traceability Demonstration Path
For each deployment run:
- Workflow calculates one shared release tag for backend/frontend.
- Images are pushed with:
	- Release tag (`<chart-version>-build.<run-number>-sha.<short-sha>`)
	- Short SHA tag (`<short-sha>`)
	- `latest` (moving pointer)
- OCI labels embed revision/version metadata:
	- `org.opencontainers.image.revision=<full commit sha>`
	- `org.opencontainers.image.version=<release tag>`
- Helm deploy uses exactly that release tag.

Result: given a running image tag, you can directly identify the originating commit and pipeline run.

---

## 5) Real-World Alignment and Scale Path

This design is suitable for the current monorepo-style project with backend/frontend services and Kubernetes deployment.

As the project grows, the same stage model scales by adding:
- Matrix test jobs (Python versions, Node versions)
- Security stages (SAST, dependency scanning, container scanning)
- Artifact signing and SBOM publication
- Staging-to-production promotion using approvals and release tags
- Automatic rollback policies on failed verification checks

The stage contract remains stable even as tool depth increases.

---

## 6) Current Workflow File Mapping

- CI (Backend): `.github/workflows/backend-ci.yml`
- CI (Frontend): `.github/workflows/frontend-ci.yml`
- CD (Artifact + Deploy + Verify): `.github/workflows/deploy-k8s.yml`

This mapping is the concrete implementation basis for Sprint #3 pipeline design submission.
