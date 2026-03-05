# Health Probes Demo (Liveness + Readiness)

This guide demonstrates observable probe behavior for the backend deployment.

## What is Configured

- `livenessProbe` checks `GET /health/liveness`
- `readinessProbe` checks `GET /health/readiness`
- Probe control endpoints (for demo):
  - `POST /api/admin/probes/liveness` with `{"enabled": false}` to force liveness failure
  - `POST /api/admin/probes/readiness` with `{"enabled": false}` to force readiness failure

## Apply Manifests

```sh
kubectl apply -f k8s/persistent-volumes.yaml
kubectl create secret generic clerk-secrets \
  --from-literal=publishable-key="<your-publishable-key>" \
  --from-literal=secret-key="<your-secret-key>"
kubectl create secret generic mongo-secrets \
  --from-literal=username="<your-mongo-username>" \
  --from-literal=password="<your-mongo-password>"
kubectl apply -f k8s/mongo-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/services.yaml
```

## 1) Demonstrate Readiness Failure (Removed from Traffic)

Open terminal A:

```sh
kubectl get pods -l app=video-backend -w
```

Open terminal B and pick one backend Pod:

```sh
kubectl get pods -l app=video-backend -o wide
```

Port-forward that Pod (replace `<pod-name>`):

```sh
kubectl port-forward pod/<pod-name> 18000:8000
```

Open terminal C and watch backend service endpoints:

```sh
kubectl get endpoints backend-service -w
```

Now force readiness failure on only that Pod:

```sh
curl -X POST http://127.0.0.1:18000/api/admin/probes/readiness \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Verify:

```sh
curl http://127.0.0.1:18000/health/readiness
# expected: HTTP 503

curl http://127.0.0.1:18000/health/liveness
# expected: HTTP 200
```

Expected observable behavior:

- Pod stays Running (no restart)
- Pod IP is removed from `backend-service` endpoints
- Traffic is routed only to ready Pods

## 2) Demonstrate Liveness Failure (Container Restart)

Keep the same port-forwarded Pod and force liveness failure:

```sh
curl -X POST http://127.0.0.1:18000/api/admin/probes/liveness \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Watch restart count increase:

```sh
kubectl get pod <pod-name> -w
kubectl get pod <pod-name> -o jsonpath='{.status.containerStatuses[0].restartCount}'
kubectl describe pod <pod-name>
```

Expected observable behavior:

- Liveness probe fails repeatedly
- Kubelet restarts the container in the same Pod
- `RESTARTS` count increases
- After restart, probe states reset to healthy on startup

## 3) Recover Readiness (Optional)

If Pod is still running and port-forward is active:

```sh
curl -X POST http://127.0.0.1:18000/api/admin/probes/readiness \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

Pod returns to service endpoints once readiness succeeds.

## PR Notes Template

In your PR description, include:

- Probe config paths (`/health/liveness`, `/health/readiness`)
- Readiness demo result: endpoint removal without restart
- Liveness demo result: container restart (`RESTARTS` increment)
- Why this improves reliability: only healthy Pods receive traffic; unhealthy containers self-heal
