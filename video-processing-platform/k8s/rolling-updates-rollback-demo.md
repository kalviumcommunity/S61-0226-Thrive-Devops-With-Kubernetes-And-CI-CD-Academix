# Rolling Updates and Rollbacks Demo

This guide demonstrates both a successful rolling update and a controlled rollback using the existing `backend` Deployment.

## Why This Matters

- Rolling updates let Kubernetes replace old Pods gradually while keeping traffic available.
- Rollbacks let you quickly recover to a known-good version when a release is bad.
- Deployment revisions provide traceability for what changed and when.

## Preconditions

- Docker Desktop Kubernetes is running.
- You are in the `video-processing-platform` folder.
- Backend is already deployed from `k8s/backend-deployment.yaml`.

## Verify Baseline

```sh
kubectl get deployment backend
kubectl get pods -l app=video-backend -o wide
kubectl rollout history deployment/backend
```

## 1) Build and Apply a Good Update (No Downtime)

Build a new local image tag:

```sh
docker build --no-cache -t video-processing-platform-backend:v2 backend
```

Trigger rolling update:

```sh
kubectl set image deployment/backend backend=video-processing-platform-backend:v2
kubectl rollout status deployment/backend --timeout=180s
```

Observe rolling behavior:

```sh
kubectl get pods -l app=video-backend -w
kubectl get endpoints backend-service -w
```

Expected:

- New Pods are created first (`maxSurge: 1`).
- Old Pods terminate only after new Pods become Ready (`maxUnavailable: 0`).
- Service endpoints remain available throughout update.

## 2) Trigger a Bad Update

Set an invalid image tag to simulate a failed release:

```sh
kubectl set image deployment/backend backend=video-processing-platform-backend:bad-release
kubectl rollout status deployment/backend --timeout=90s
```

Inspect failure:

```sh
kubectl get pods -l app=video-backend
kubectl describe deployment/backend
kubectl rollout history deployment/backend
```

Expected:

- New ReplicaSet fails to become healthy (image pull/start failure).
- Previous stable Pods continue serving traffic.

## 3) Roll Back to Stable Revision

Rollback to previous good revision:

```sh
kubectl rollout undo deployment/backend
kubectl rollout status deployment/backend --timeout=180s
```

Verify recovery:

```sh
kubectl get pods -l app=video-backend -o wide
kubectl get endpoints backend-service
kubectl rollout history deployment/backend
```

Expected:

- Deployment returns to previous stable image revision.
- All backend Pods become Ready again.

## Optional: Roll Back to a Specific Revision

```sh
kubectl rollout history deployment/backend
kubectl rollout undo deployment/backend --to-revision=<revision-number>
```

## PR Evidence Checklist

Include in your PR description:

- What update was made (for example `v1` to `v2` image).
- Proof of successful rolling update (`kubectl rollout status`, Pods rotating gradually).
- Proof of failed/undesirable update (bad tag and rollout failure output).
- Proof of rollback success (`kubectl rollout undo` and healthy Pods/endpoints).
- Short explanation of why this improves production reliability.
