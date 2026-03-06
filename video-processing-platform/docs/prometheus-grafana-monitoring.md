# Monitoring Setup: Prometheus + Grafana (Sprint #3)

This guide implements working metric collection and visualization for the Kubernetes workloads in this project.

## Architecture

Metric flow in this setup:

1. Backend exposes Prometheus metrics at `GET /metrics`.
2. Prometheus scrapes `backend-service.default.svc.cluster.local:8000/metrics` every 15 seconds.
3. Grafana uses Prometheus as a provisioned data source.
4. Grafana auto-loads a dashboard with request rate, error rate, latency, and in-flight requests.

## Files Added

- `video-processing-platform/k8s/monitoring/prometheus-grafana.yaml`
- `video-processing-platform/docs/prometheus-grafana-monitoring.md`

Related centralized logging guide:

- `video-processing-platform/docs/loki-fluent-bit-logging.md`

Backend instrumentation:

- `video-processing-platform/backend/main.py`
- `video-processing-platform/backend/requirements.txt`

## Deploy Prerequisites

- Kubernetes cluster is running
- Core app workloads are deployed:
  - backend
  - frontend
  - services

## Deploy Monitoring Stack

```sh
kubectl apply -f video-processing-platform/k8s/monitoring/prometheus-grafana.yaml
kubectl get pods -n monitoring
kubectl get svc -n monitoring
```

Expected pods:

- `prometheus-*` (Running)
- `grafana-*` (Running)

## Verify Prometheus Scraping

Port-forward Prometheus:

```sh
kubectl port-forward -n monitoring svc/prometheus 9090:9090
```

Open:

- `http://localhost:9090/targets`

Verify target `video-backend` is `UP`.

Quick query examples in Prometheus UI:

- `sum(rate(video_api_http_requests_total[5m]))`
- `sum(rate(video_api_http_request_errors_total[5m]))`
- `histogram_quantile(0.95, sum(rate(video_api_http_request_duration_seconds_bucket[5m])) by (le))`

## Verify Grafana Visualization

Port-forward Grafana:

```sh
kubectl port-forward -n monitoring svc/grafana 3000:3000
```

Open:

- `http://localhost:3000`
- Login: `admin` / `admin`

The dashboard should already be provisioned:

- `Video Platform - Backend Monitoring`

Panels included:

- Request Rate (req/s)
- Error Rate (%)
- P95 Latency (seconds)
- In-Flight Requests
- Request Rate by Path (top)

## Generate Live Traffic (for demo)

Use these commands while dashboards are open:

```sh
kubectl port-forward svc/backend-service 18000:8000
curl http://127.0.0.1:18000/health
curl http://127.0.0.1:18000/api/lectures
curl http://127.0.0.1:18000/metrics
```

Then refresh Grafana and observe panel movement.

## Why This Matters in Production

- Prometheus continuously stores time-series metrics for historical analysis and alerting.
- Grafana converts raw metrics into operational dashboards for quick diagnosis.
- Operators can detect rising latency, error spikes, and load patterns before outages.

## PR Notes Template Snippet

```markdown
### Monitoring Implementation
- Added Prometheus + Grafana manifests under `k8s/monitoring/`.
- Exposed backend Prometheus metrics at `/metrics`.
- Configured Prometheus scraping for `backend-service`.
- Provisioned Grafana datasource and dashboard.

### Verification
- Prometheus target `video-backend` is UP.
- Grafana dashboard displays live request/error/latency data.
```
