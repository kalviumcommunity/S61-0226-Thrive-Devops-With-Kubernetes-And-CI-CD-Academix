# Secrets and Environment Variables in CI/CD

This project treats secrets as runtime-only security assets.

## Sensitive values used by pipeline

The CI/CD workflows use sensitive values that must never be committed:

- `KUBE_CONFIG`
- `DOCKER_HUB_TOKEN`
- `CLERK_SECRET_KEY`
- `MONGO_USERNAME`
- `MONGO_PASSWORD`
- `GOOGLE_API_KEY` (application runtime)

## Configuration vs secret

Configuration values are non-sensitive defaults and metadata, for example:

- `DEPLOY_ENV` (GitHub variable)
- `K8S_NAMESPACE` (default namespace or non-sensitive override)
- image tags and chart version

Sensitive credentials are stored in GitHub **Repository Secrets** and injected only at runtime.

## Runtime injection pattern (implemented)

In both workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-k8s.yml`

we create/update Kubernetes secrets during the job using `kubectl create secret ... --dry-run=client -o yaml | kubectl apply -f -`.

This means:

- no plaintext credentials in repository manifests
- no static secret file required in source control
- deployment always uses current values from GitHub Secrets

## Required GitHub repository secrets

Create these in repository settings before running deployment workflows:

- `KUBE_CONFIG`
- `DOCKER_HUB_USERNAME`
- `DOCKER_HUB_TOKEN`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `MONGO_USERNAME`
- `MONGO_PASSWORD`

Optional:

- `K8S_NAMESPACE` (if you want a secret-based namespace override in `ci.yml`)

## Why this is secure

- Secrets are encrypted at rest by GitHub Secrets Manager.
- Secrets are available only to workflow runtime and only for the job context.
- Workflow steps validate required secrets without printing secret values.
- Kubernetes receives secrets via API calls from CI runner, not from committed files.

## Local development guidance

Use local `.env` files with placeholders in repo and real values only in untracked local files.

- `video-processing-platform/.env`
- `video-processing-platform/backend/.env`
- `video-processing-platform/frontend/.env`

The committed files now contain placeholder values only.
