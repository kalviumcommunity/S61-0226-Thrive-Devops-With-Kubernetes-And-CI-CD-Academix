# CI/CD Pipeline Stage Demo Script (Sprint #3)

Use this script while recording the required submission video.

## 1) Intro (20-30s)
- "This demo explains the CI/CD pipeline design for the video-processing-platform project."
- "I will show stage separation, CI vs CD boundaries, and why stage order improves reliability and safety."

## 2) Show Stage Design Document (60-90s)
Open: `video-processing-platform/docs/cicd-pipeline-design.md`

Explain in order:
1. Trigger and setup stages
2. CI quality stages (lint/test/build checks)
3. CD artifact stages (Docker build/push)
4. CD deployment stage (Helm to Kubernetes)
5. CD verification stage (rollout checks)

## 3) Show CI Workflows (60s)
Open:
- `.github/workflows/backend-ci.yml`
- `.github/workflows/frontend-ci.yml`

Say:
- "These two workflows are CI-only and focus on validating code quality and build correctness."
- "CI ends after these quality gates pass."

## 4) Show CD Workflow (60-90s)
Open: `.github/workflows/deploy-k8s.yml`

Say:
- "CD starts from artifact creation, then deployment, then post-deploy verification."
- "Deploy job uses Helm values and image tags based on commit SHA."
- "Verification checks rollout status for backend and frontend deployments."

## 5) Explain Why Order Matters (30-45s)
- "Quality checks before artifact creation reduce bad releases."
- "Immutable artifacts improve traceability and rollback readiness."
- "Verification after deployment catches runtime rollout failures quickly."

## 6) Close with PR Summary (20-30s)
- "This PR adds a clear stage-based CI/CD design document, CI/CD boundary definition, and workflow structure aligned with that design."
- "The focus is pipeline architecture understanding, not full production rollout automation yet."