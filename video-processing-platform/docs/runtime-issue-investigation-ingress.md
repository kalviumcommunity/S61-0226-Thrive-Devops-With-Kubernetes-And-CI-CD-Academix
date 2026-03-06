# Runtime Issue Investigation Report (Kubernetes)

## Scope

This report documents a runtime issue investigation for a deployed Kubernetes workload using `kubectl` commands.

Target workload investigated:

- Namespace: `ingress-nginx`
- Pod: `ingress-nginx-controller-74fdcbccdc-db9wd` (old pod)
- Replacement pod after recovery: `ingress-nginx-controller-66c985c5f5-q7vpq`

## Commands Used

Resource state:

```bash
kubectl get pods -n ingress-nginx -o wide
kubectl get deploy -n ingress-nginx
kubectl get pods -A
```

Detailed inspection:

```bash
kubectl describe pod -n ingress-nginx ingress-nginx-controller-74fdcbccdc-db9wd
kubectl describe pod -n ingress-nginx ingress-nginx-controller-66c985c5f5-q7vpq
```

Logs:

```bash
kubectl logs -n ingress-nginx ingress-nginx-controller-66c985c5f5-q7vpq --tail=80
```

Events timeline:

```bash
kubectl get events -A --sort-by=.lastTimestamp \
  | grep -E "Rebooted|SandboxChanged|Unhealthy|FailedMount" \
  | tail -n 60
```

## Observed Symptom

1. Ingress controller experienced repeated instability before recovery:
- Old pod restart history showed multiple restarts (`RESTARTS: 6+`).
- `describe` events showed health probe failures:
  - `Readiness probe failed ... connect: connection refused`
  - `Liveness probe failed ... connect: connection refused`

2. During investigation window, old pod was replaced:
- Old pod moved to `Terminating`.
- New controller pod came up and reached `1/1 Running`.

3. Temporary startup warning also observed in old history:
- `FailedMount ... secret "ingress-nginx-admission" not found` (historical event).
- Secret exists now and is healthy:
  - `kubectl get secret -n ingress-nginx ingress-nginx-admission` returned `Opaque` with data.

## Underlying Root Cause

Root cause is transient infrastructure instability on local Docker Desktop Kubernetes node, not an application image/configuration defect.

Evidence:

1. Node reboot events:
- `Warning Rebooted node/docker-desktop`

2. Cluster-wide pod sandbox recreation at same timestamps:
- Multiple `Normal SandboxChanged` events across namespaces (`default`, `kube-system`, `monitoring`, `ingress-nginx`).

3. Probe failures align with node churn period:
- Ingress and CoreDNS emitted `Unhealthy` events immediately around the reboot/sandbox events.

This sequence indicates brief control-plane/node churn causing transient endpoint unavailability and probe failures.

## Recovery Actions Performed

1. Observed rollout/replacement of ingress controller pod.
2. Verified new pod health:
- `1/1 Running`
- `Ready: True`
- `Restart Count: 0`
3. Verified full-cluster health:
- `kubectl get pods -A` showed all key workloads in `Running` state.

## Current Status

Recovered and stable at time of verification.

- New ingress controller pod is healthy.
- Application workloads (`backend`, `frontend`, `mongo`) are running.
- Monitoring stack (`prometheus`, `grafana`, `loki`, `fluent-bit`) is running.

## Preventive Recommendations (Local Cluster)

1. Keep Docker Desktop running during demos/deployments; avoid host sleep/restart.
2. Increase Docker Desktop resources (CPU/RAM) to reduce node pressure.
3. Keep at least 2 replicas for critical workloads where feasible.
4. Use slightly more tolerant probe timings in local/dev environments.
5. For high reliability CI/CD, deploy to a remote managed cluster or stable self-hosted environment.

## Final Conclusion

The investigated runtime issue was real and observable (probe failures + restarts), but the underlying cause was infrastructure-level node reboot/sandbox recreation. The workload recovered after pod replacement, confirming it was a transient platform event rather than an application image/configuration bug.
