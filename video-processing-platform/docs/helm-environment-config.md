# Sprint #3 Submission Notes: Environment-Specific Helm Configuration

## What was added

- `charts/video-processing-platform/values-dev.yaml`
- `charts/video-processing-platform/values-prod.yaml`
- `scripts/helm-deploy.ps1`
- Chart template enhancements to read environment values and feature flags from values files.

## How configuration is separated from deployment logic

The same chart templates are reused for all environments.

- Deployment logic lives in chart templates under `charts/video-processing-platform/templates/`.
- Environment configuration lives in values files (`values-dev.yaml`, `values-prod.yaml`).
- Helm merges values in this order:
  1. `values.yaml`
  2. environment override file (`values-dev.yaml` or `values-prod.yaml`)

No template duplication is required.

## Environment differences implemented

- Replica count differs per environment.
- Image tags differ per environment (`dev` vs `stable`).
- Resource requests/limits differ per environment.
- Feature flags differ per environment (`ENABLE_AI_SUMMARY`, `ENABLE_LIVE_SUMMARY`, `NEXT_PUBLIC_ENABLE_ADVANCED_INSIGHTS`).
- Environment variables differ per environment (`MONGO_DB_NAME`, `MAX_UPLOAD_BYTES`).
- MongoDB storage differs per environment.

## Install / Upgrade examples

```powershell
# Dev
helm upgrade --install video-platform ./charts/video-processing-platform `
  --namespace dev --create-namespace `
  -f ./charts/video-processing-platform/values.yaml `
  -f ./charts/video-processing-platform/values-dev.yaml

# Prod
helm upgrade --install video-platform ./charts/video-processing-platform `
  --namespace prod --create-namespace `
  -f ./charts/video-processing-platform/values.yaml `
  -f ./charts/video-processing-platform/values-prod.yaml
```

## Suggested video demo flow

1. Show `values-dev.yaml` and `values-prod.yaml` side-by-side.
2. Explain key differences (replicas, tags, resources, flags).
3. Run `helm upgrade --install` for dev using the same chart.
4. Run `helm upgrade --install` for prod using the same chart.
5. Use `helm get values` / `kubectl get deploy -o yaml` to verify differences.
6. Explain why this is safer than duplicated manifests:
   - Single source of deployment logic
   - Reduced drift between environments
   - Easier review and rollback
