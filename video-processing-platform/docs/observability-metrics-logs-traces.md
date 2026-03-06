# Understanding Observability: Metrics, Logs, and Traces

This document captures Sprint #3 observability understanding for the video processing platform. It focuses on conceptual clarity and project-level application, not tool installation.

## What Observability Means

Observability is the ability to understand what a system is doing internally by using the signals it emits.

Monitoring answers: "Is the system up or down?"
Observability answers: "Why is this behavior happening right now, and where is it happening?"

In production, incidents are rarely simple. We need multiple signals together to move from symptom to root cause.

## The Three Pillars

## 1) Metrics

Metrics are numeric measurements over time.

Typical examples:
- request count
- error rate
- latency percentiles (for example p95)
- queue depth

Metrics are best for:
- trend detection
- alerting thresholds
- capacity and performance tracking

Questions metrics answer:
- Is API latency rising?
- Is error rate above normal?
- Is throughput dropping?

Project mapping:
- Backend exposes health probe states (`/health`, `/health/liveness`, `/health/readiness`).
- Backend now includes a lightweight metrics snapshot endpoint: `/observability/metrics-snapshot`.
- Snapshot includes request totals, error totals, status-code counts, top request paths, and latency summary.

## 2) Logs

Logs are timestamped event records.

Typical examples:
- request completed
- upload failed due to size/content type
- AI summary generation fallback
- DB or subprocess failures

Logs are best for:
- debugging specific failures
- understanding exact event sequence
- collecting context fields around an incident

Questions logs answer:
- Which request failed and with what status?
- What happened immediately before the failure?
- Which code path emitted the warning/error?

Project mapping:
- Existing backend logs already capture upload/transcoding/AI fallback events.
- Added request completion/failure logs with:
  - `request_id`
  - `method`
  - `path`
  - `status`
  - `latency_ms`
- `X-Request-ID` response header is set so client and server logs can be correlated.

## 3) Traces

Traces represent end-to-end request journeys across components.

A trace is composed of spans, where each span is one step in a request path.

Traces are best for:
- identifying where latency is spent across services
- understanding dependency boundaries
- debugging multi-hop requests

Questions traces answer:
- Which hop in the flow is slow?
- Did delay happen in frontend, API, DB, or external AI call?
- How does one user action fan out across components?

Project mapping (conceptual for now):
- User flow: browser -> Next.js frontend -> FastAPI backend -> MongoDB and optional Gemini API.
- Current `request_id` correlation is a practical stepping stone toward full distributed tracing.
- Future step (not required this sprint): OpenTelemetry spans across frontend/backend/DB/external calls.

## How They Differ

Metrics:
- low cardinality, aggregated, great for alerts and trends
- fast signal for "something is wrong"

Logs:
- rich event context, best for deep debugging
- best signal for "what exactly happened"

Traces:
- request path visibility across boundaries
- best signal for "where exactly the slowdown/failure occurred"

Use them together:
1. Metrics trigger suspicion.
2. Traces narrow the failing path.
3. Logs explain exact failure context.

## Real Scenarios in This Project

1. Upload latency suddenly increases.
- Start with metrics: check latency summary and request volume.
- Use logs: inspect request-specific latency and status by `request_id`.
- Use trace thinking: isolate whether slowness is in upload handling, ffmpeg metadata extraction, or DB writes.

2. Readiness probe fails intermittently.
- Metrics: check error percentage and 503 counts.
- Logs: verify readiness endpoint failures and surrounding DB ping behavior.
- Traces (future): validate if DB round-trip latency is causing readiness degradation.

3. Student reports inconsistent AI transcript enrichment.
- Metrics: watch error rate for enrichment endpoints.
- Logs: inspect fallback warnings and timeout-related messages.
- Traces (future): compare latency budget spent in external AI call vs local processing.

## Practical Signal Selection Guide

Use metrics when:
- you need alerts or SLO/SLA tracking
- you want trends over minutes/hours/days

Use logs when:
- you need exact context for one incident
- you need payload-independent event history

Use traces when:
- a request crosses multiple services/dependencies
- latency attribution is unclear

## Sprint #3 Contribution Summary

This sprint contribution includes:
- Conceptual observability guide (this file).
- Backend observability improvement:
  - request correlation via `X-Request-ID`
  - structured request logs with latency
  - lightweight metrics snapshot endpoint
- Tests for request-id header and metrics snapshot behavior.

This demonstrates observability understanding and immediate application in the existing project without requiring Prometheus/Grafana/tracing stack setup.
