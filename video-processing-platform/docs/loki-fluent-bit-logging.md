# Centralized Logging Setup: Fluent Bit + Loki

This guide configures centralized Kubernetes log collection for the video-processing platform.

## What This Adds

- Fluent Bit DaemonSet collects container logs from every node (`/var/log/containers/*.log`).
- Kubernetes metadata enrichment adds labels like namespace, pod, container, and app.
- Loki stores and indexes logs centrally in the `monitoring` namespace.
- Grafana includes a Loki datasource for query/search in one place.

## Files

- `video-processing-platform/k8s/monitoring/loki-fluent-bit.yaml`
- `video-processing-platform/k8s/monitoring/prometheus-grafana.yaml` (updated with Loki datasource)

## Deploy

Apply monitoring stack (metrics + logs):

```sh
kubectl apply -f video-processing-platform/k8s/monitoring/prometheus-grafana.yaml
kubectl apply -f video-processing-platform/k8s/monitoring/loki-fluent-bit.yaml
```

Check readiness:

```sh
kubectl get pods -n monitoring
kubectl get ds -n monitoring fluent-bit
kubectl get svc -n monitoring
```

Expected:

- `loki-*` deployment pod is `Running`
- `fluent-bit-*` pods are running on all nodes (DaemonSet)
- `grafana` and `prometheus` are `Running`

## Generate Logs From Multiple Services

Create traffic to both backend and frontend:

```sh
kubectl port-forward svc/backend-service 18000:8000
kubectl port-forward svc/frontend-service 18080:80
```

In another terminal:

```sh
curl http://127.0.0.1:18000/health
curl http://127.0.0.1:18000/api/lectures
curl http://127.0.0.1:18080/
```

## Verify In One Place (Grafana Explore)

Port-forward Grafana:

```sh
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Open `http://localhost:3000` and login with `admin/admin`.

Go to `Explore` and pick datasource `Loki`.

## Query Examples (Searchable by Labels)

All app logs from both services:

```logql
{namespace="default", app=~"video-backend|video-frontend"}
```

Only backend logs:

```logql
{namespace="default", app="video-backend"}
```

Only frontend logs:

```logql
{namespace="default", app="video-frontend"}
```

Single pod investigation:

```logql
{namespace="default", pod=~"backend-.*"}
```

Errors across services:

```logql
{namespace="default", app=~"video-backend|video-frontend"} |= "error"
```

## Command-Line Verification

Run a Loki query from inside cluster:

```sh
kubectl run -n monitoring log-query --rm -it --image=curlimages/curl --restart=Never -- \
  curl -G -s "http://loki.monitoring.svc.cluster.local:3100/loki/api/v1/query" \
  --data-urlencode 'query={namespace="default",app=~"video-backend|video-frontend"}'
```

If logs are present, Loki returns `status: success` with matching streams.

## Result Checklist

- Logs are collected centrally: Fluent Bit ships node/pod logs to Loki.
- Logs are structured/labeled meaningfully: labels include `namespace`, `pod`, `container`, and `app`.
- Logs from multiple pods/services are visible together via a single LogQL query.
- Logs are searchable/filterable with label selectors and content filters.
