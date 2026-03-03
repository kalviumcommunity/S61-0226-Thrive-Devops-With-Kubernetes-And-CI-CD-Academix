# Sprint #3 Submission Notes: Ingress and External Traffic Routing

## Why Services alone are not enough for external users

Kubernetes `Service` resources solve in-cluster service discovery and stable networking, but they do not provide complete real-world HTTP entry routing by themselves:

- `ClusterIP` is internal-only and cannot be reached directly from the internet.
- `NodePort` exposes ports on every node, but routing is coarse and not host/path aware.
- `LoadBalancer` exposes one service per public endpoint, which becomes expensive and hard to manage for multi-service apps.

For this project, we need one controlled HTTP entry that can route by host/path to the right service. That is exactly what Ingress provides.

## Ingress architecture implemented in this project

### Components and roles

1. **Ingress Controller** (NGINX)
   - Watches `Ingress` resources.
   - Programs data-plane routing rules.
   - Receives external HTTP traffic first.

2. **Ingress resource** (`k8s/ingress.yaml` or Helm template)
   - Declares host/path routing rules.
   - Maps incoming requests to Kubernetes Services.

3. **Services**
   - `frontend-service` (`ClusterIP`) for the Next.js app.
   - `backend-service` (`ClusterIP`) for the FastAPI API.

4. **Pods**
   - Deployments provide frontend/backend pods.
   - Services select pods by labels and forward traffic.

## End-to-end external traffic flow

For a browser request to this app:

1. User requests `http://app.academix.local` or `http://api.academix.local`.
2. DNS/hosts entry resolves the hostname to the Ingress Controller entrypoint.
3. Ingress Controller receives request.
4. Controller matches host/path using the Ingress resource rules.
5. Matched backend Service is selected:
   - `app.*` host → `frontend-service`
   - `api.*` host → `backend-service`
6. Service load-balances to one healthy Pod endpoint.
7. Pod processes request and response returns through the same chain.

## Routing rules used in this project

### Raw manifests (`k8s/ingress.yaml`)

- Host `app.academix.local` with path `/` routes to `frontend-service:80`.
- Host `api.academix.local` with path `/` routes to `backend-service:8000`.

### Helm chart (`charts/video-processing-platform/templates/ingress.yaml`)

Ingress is parameterized via values files:

- `ingress.enabled`
- `ingress.className`
- `ingress.annotations`
- `ingress.hosts[].host`
- `ingress.hosts[].paths[]` (path, pathType, target service, port)

This allows environment-specific hostnames without duplicating templates.

## How this applies to this project specifically

- Frontend is now internal (`ClusterIP`) and accessed externally via Ingress host `app.*`.
- Backend is now externally reachable via dedicated API host `api.*` through the same Ingress entrypoint.
- Frontend public API URL is configured to use the API host (e.g., `http://api.academix.local`) so browser-originated API calls resolve correctly outside the cluster.
- Server-side frontend calls still use internal service routing (`INTERNAL_API_URL` → backend service), preserving cluster-internal efficiency.

## Verification commands

```bash
kubectl get ingress
kubectl describe ingress video-platform-ingress
kubectl get svc
kubectl get endpoints frontend-service backend-service
```

Helm rendering verification:

```bash
helm template video-platform ./charts/video-processing-platform \
  -f ./charts/video-processing-platform/values.yaml \
  -f ./charts/video-processing-platform/values-dev.yaml
```

## Suggested PR description text

This PR introduces Ingress-based external routing for the video-processing platform and documents the full traffic path from internet to pod.

- Replaced direct frontend `LoadBalancer` exposure with `ClusterIP` + Ingress.
- Added host-based routing rules:
  - `app.<domain>` → frontend service
  - `api.<domain>` → backend service
- Added Helm-templated Ingress so routing is environment-configurable.
- Updated frontend public API endpoint configuration to align with external ingress routing.
- Added architecture documentation explaining: Ingress Controller → Ingress resource → Service → Pod flow.

## Suggested video demo outline

1. Show `k8s/ingress.yaml` and explain host/path rules.
2. Show `services.yaml` proving frontend/backend are internal (`ClusterIP`).
3. Show Helm `templates/ingress.yaml` and values-based host configuration.
4. Run `kubectl get ingress,svc,pods` and explain request path.
5. Explain the exact external flow in one sentence:
   - Internet → Ingress Controller → Ingress rule match → Service → Pod.
