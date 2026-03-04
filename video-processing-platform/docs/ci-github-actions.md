# GitHub Actions CI Implementation (Sprint #3)

This document explains the working Continuous Integration setup implemented for this repository.

## Workflow File
- `.github/workflows/ci.yml`

Primary automated CI is centralized in `ci.yml` to avoid duplicate runs. Existing service-specific workflow files remain available for manual checks (`workflow_dispatch`).

## What This CI Workflow Does
The workflow runs automated quality gates for both services:

1. **Backend CI job**
   - Checks out code
   - Sets up Python 3.11
   - Installs dependencies
   - Runs lint (`flake8`)
   - Runs tests (`pytest`)

2. **Frontend CI job**
   - Checks out code
   - Sets up Node.js 20
   - Installs dependencies
   - Runs lint (`npm run lint`)
   - Runs production build (`npm run build`)

## Trigger Conditions
The workflow runs automatically on:
- `pull_request` to `main` (for early validation before merge)
- `push` to `main` (for integration validation after merge)
- `workflow_dispatch` (manual run for demos/debugging)

It is path-filtered to run when backend/frontend code or the workflow itself changes.

## Why These Triggers
- **pull_request:** catches issues before code is merged.
- **push:** ensures the default branch remains healthy.
- **workflow_dispatch:** helps reproduce and demonstrate CI runs.

## CI Execution Evidence for PR
In your PR description, include:
- Link to at least one successful run from the Actions tab.
- Optional: one failed run + fix commit (recommended).
- Short note that CI runs automatically, without manual intervention.

## Suggested PR Description Snippet
```markdown
### CI Workflow Added
- Added `.github/workflows/ci.yml` for automated CI.
- Triggered on `pull_request` and `push` to `main`.
- Runs backend lint/tests and frontend lint/build.

### CI Run Evidence
- Successful run: <paste GitHub Actions run URL>
```
