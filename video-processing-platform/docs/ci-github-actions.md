# GitHub Actions CI Implementation (Sprint #3)

This document explains the working Continuous Integration and Continuous Deployment setup implemented for this repository.

## Workflow File
- `.github/workflows/ci.yml`

Primary automated CI is centralized in `ci.yml` to avoid duplicate runs. Existing service-specific workflow files remain available for manual checks (`workflow_dispatch`).

## What This CI Workflow Does
This workflow runs gated stages for both services in this order:

**Build -> Test/Checks -> Docker Image Build -> Deploy**

1. **Backend stages**
   - Build stage: Python compile sanity check
   - Checks out code
   - Sets up Python 3.11
   - Installs dependencies
   - Test stage: lint (`flake8`) + tests (`pytest`)
   - Image stage: builds backend Docker image using `Dockerfile`

2. **Frontend stages**
   - Build stage: production app build (`npm run build`)
   - Checks out code
   - Sets up Node.js 20
   - Installs dependencies
   - Test/check stage: lint (`npm run lint`)
   - Image stage: builds frontend Docker image using `Dockerfile`

3. **Deploy stage (main branch only)**
   - Configures `kubectl` and `helm`
   - Loads kubeconfig securely from GitHub secret
   - Runs `helm upgrade --install --atomic --wait`
   - Deploys backend and frontend using the newly built image tag
   - Verifies rollout status for both deployments

Docker image steps use `docker/build-push-action` to build on all triggers and **push to GHCR on `push` to `main`**.

## Image Tagging Strategy (Implemented)
We use a **hybrid tag strategy** so every image is traceable to code and pipeline context:

- CI validation builds (`.github/workflows/ci.yml`):
   - `<chart-version>-build.<run-number>-sha.<short-sha>`
   - Example: `0.1.0-build.142-sha.a1b2c3d`
- Manual fallback CD (`.github/workflows/deploy-k8s.yml`, `workflow_dispatch` only):
   - Uses the same tag format when run manually

This combines:
- semantic version context from Helm Chart version,
- CI build number for uniqueness/order,
- commit SHA for immutable source traceability.

Both backend and frontend are deployed with the same computed tag for release consistency.

## How Tag Traceability Works
- The workflow computes image tags from:
   - `Chart.yaml` version
   - `github.run_number`
   - `github.sha` (short SHA)
- OCI labels are added to images:
   - `org.opencontainers.image.revision=<full commit sha>`
   - `org.opencontainers.image.version=<computed image tag>`
- Deployment uses the same computed tag for backend + frontend Helm values.
- GitHub Actions run summary includes commit, tag format, and final pushed image names.

## Container Registry and Secure Authentication
- Container registry selected: **GitHub Container Registry** (`ghcr.io`)
- CI uses secure authentication via:
   - `username: ${{ github.actor }}`
   - `password: ${{ secrets.GITHUB_TOKEN }}`
- Workflow permissions include `packages: write` and `contents: read`.
- No registry credentials are hardcoded in repo files.

## Kubernetes Access from CI (Secure Setup)
Required GitHub repository secrets:

- `KUBE_CONFIG`: kubeconfig content (raw or base64-encoded) for a least-privilege Kubernetes service account
- `K8S_NAMESPACE` (optional): target namespace override, defaults to `default`

Reference manifest for least-privilege access:

- `video-processing-platform/k8s/ci-deployer-rbac.yaml`

Optional GitHub repository variable:

- `DEPLOY_ENV`: `dev` or `prod` (defaults to `dev`)

## Push and Verification Behavior
- On `push` to `main`:
   - CI logs in to GHCR.
   - Pushes versioned backend/frontend images.
   - Adds SHA and `latest` tags.
   - Verifies pushes using `docker buildx imagetools inspect <image:tag>`.
   - Deploys to Kubernetes automatically using Helm.
   - Verifies deployment rollout status.
- On `pull_request`:
   - CI builds images without pushing.
   - CI builds and validates images without pushing or deploying.

This ensures credentials are managed through GitHub secrets and image push/deploy success is explicitly validated in pipeline logs.

## Trigger Conditions
The workflow runs automatically on:
- `pull_request` to `main` (for early validation before merge)
- `push` to `main` (for integration validation after merge)
- `workflow_dispatch` (manual run for demos/debugging)

It is path-filtered to run when backend/frontend code or the workflow itself changes.
It also runs when Helm chart files change.

## Why These Triggers
- **pull_request:** catches issues before code is merged.
- **push:** ensures the default branch remains healthy.
- **workflow_dispatch:** helps reproduce and demonstrate CI runs.

## CI Execution Evidence for PR
In your PR description, include:
- Link to at least one successful run from the Actions tab.
- Optional: one failed run + fix commit (recommended).
- Short note that CI runs automatically, without manual intervention.
- Mention that if **build** or **test/check** fails, image build stages do not run (stage gating with job dependencies).

## Suggested PR Description Snippet
```markdown
### CI Workflow Added
- Added `.github/workflows/ci.yml` for automated CI.
- Triggered on `pull_request` and `push` to `main`.
- Runs staged pipeline: build -> test/check -> docker image build for backend and frontend.

### CI Run Evidence
- Successful run: <paste GitHub Actions run URL>
```
# ci test Thu, Mar  5, 2026 10:23:39 AM
