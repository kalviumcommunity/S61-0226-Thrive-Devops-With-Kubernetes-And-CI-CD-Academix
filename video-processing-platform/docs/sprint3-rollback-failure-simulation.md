# Sprint #3: Rollback, Failure Simulation, and Deployment Validation

This guide demonstrates controlled production-style failure handling in Kubernetes:

- Introduce a deliberate deployment fault.
- Observe and capture failure behavior.
- Roll back safely to last known-good revision.
- Validate full recovery (pods, endpoints, traffic).

## What was added

- `video-processing-platform/scripts/rollback-drill.ps1`
- Improved `video-processing-platform/scripts/validate-k8s-release.ps1` to support Helm release names.

## Preconditions

- Kubernetes cluster is running and reachable.
- Helm release is already installed for this project.
- `kubectl` context points to the target cluster.
- Namespace and release name are known.

Quick API connectivity check:

```powershell
kubectl config current-context
kubectl cluster-info
```

If `kubectl cluster-info` fails with `dial tcp 127.0.0.1:6443 ... actively refused`, your local Kubernetes control plane is not running.

Optional baseline deployment command:

```powershell
./video-processing-platform/scripts/helm-deploy.ps1 -Environment dev -ReleaseName video-platform -Namespace default
```

## Run the rollback drill

Backend failure simulation (recommended):

```powershell
./video-processing-platform/scripts/rollback-drill.ps1 `
  -Environment dev `
  -ReleaseName video-platform `
  -Namespace default `
  -Target backend `
  -BadImageTag rollback-drill-bad `
  -ValidateIngress
```

Frontend failure simulation:

```powershell
./video-processing-platform/scripts/rollback-drill.ps1 `
  -Environment dev `
  -ReleaseName video-platform `
  -Namespace default `
  -Target frontend `
  -BadImageTag rollback-drill-bad `
  -ValidateIngress
```

## Expected failure behavior

During fault injection, the script updates deployment image tag to a non-existent tag. You should observe:

- `kubectl rollout status` timeout/failure.
- Pods in `ImagePullBackOff` or `ErrImagePull` state.
- Deployment no longer reaching desired ready replicas.

The script prints:

- Rollout history before/after failure.
- Pod list for the failed workload.
- `kubectl describe pod` evidence for the newest failing pod.

## Rollback and recovery validation

The script performs:

- `kubectl rollout undo deployment/<name>`
- Wait for rollout healthy state.
- Service endpoint validation.
- Full `validate-k8s-release.ps1` checks (rollouts, endpoints, repeated HTTP checks, optional ingress checks).

Recovery is considered successful only if:

- Target deployment returns to healthy replicas.
- Service endpoints are restored.
- HTTP checks succeed repeatedly.
- Optional ingress checks succeed for app and API hosts.

## Suggested PR description template

```markdown
## Sprint #3 - Rollback, Failure Simulation, and Deployment Validation

### Failure introduced
- Target: `<backend|frontend>` deployment
- Method: set image to non-existent tag `rollback-drill-bad`
- Observed: rollout timeout, pod image pull errors (`ImagePullBackOff`)

### Rollback performed
- Command: `kubectl rollout undo deployment/<deployment-name> -n <namespace>`
- Result: deployment returned to previous revision

### Recovery verification
- Pods healthy and ready replicas restored
- Service endpoints present
- `validate-k8s-release.ps1` passed repeated runtime checks
- Ingress traffic checks succeeded (if enabled)

### Evidence
- Terminal logs/screenshots of failure, rollback, and validation
- Video demo link
```

## Video demo checklist

Record one walkthrough that covers:

- Failure injection command and reason.
- How failure is detected from rollout/pod behavior.
- Rollback command and explanation.
- Recovery checks and why they prove safety.

Keep narration focused on operational confidence: detect, contain, recover, validate.

## Troubleshooting: local cluster unreachable (Windows + Docker Desktop)

1. Start Docker Desktop and wait until status is `Running`.
2. In Docker Desktop settings, ensure Kubernetes is enabled.
3. Validate API connectivity:

```powershell
kubectl config use-context docker-desktop
kubectl cluster-info
kubectl get nodes
```

4. If connectivity is restored but workloads are missing, redeploy:

```powershell
./video-processing-platform/scripts/helm-deploy.ps1 -Environment dev -ReleaseName video-platform -Namespace default
```

5. Re-run the rollback drill command after deployment is healthy.
