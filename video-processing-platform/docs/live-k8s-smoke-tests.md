# Live Kubernetes Smoke Tests

## Critical API endpoints

These endpoints were selected because they prove the backend is running, ready, serving domain data, and exposing operational telemetry:

- `GET /health`: global service health (`healthy`, `video-api`, liveness/readiness state).
- `GET /health/readiness`: readiness probe used by Kubernetes for traffic gating.
- `GET /api/lectures`: core product API used by the frontend and users.
- `GET /observability/metrics-snapshot`: app-level runtime counters and latency snapshot.
- `GET /metrics`: Prometheus-format metrics for monitoring stack ingestion.

## Smoke test script

Script path:

- `video-processing-platform/scripts/smoke-test-live.ps1`

Run from repo root:

```powershell
./video-processing-platform/scripts/smoke-test-live.ps1
```

Optional parameters:

```powershell
./video-processing-platform/scripts/smoke-test-live.ps1 `
  -BaseUrl "http://localhost" `
  -ApiHost "api.dev.academix.local" `
  -TimeoutSeconds 20
```

## Live execution result (2026-03-10)

Environment checked:

- Kubernetes context: `docker-desktop`
- Ingress host under test: `api.dev.academix.local`
- Ingress address: `localhost`

Result summary:

- `GET /health` -> `200` with expected payload fields.
- `GET /health/readiness` -> `200` with `status=ready`.
- `GET /api/lectures` -> `200` with non-empty lecture array.
- `GET /observability/metrics-snapshot` -> `200` with `service=video-api` and counters.
- `GET /metrics` -> `200` containing `video_api_http_requests_total`.

Status: all smoke checks passed for the live Kubernetes deployment endpoint above.
