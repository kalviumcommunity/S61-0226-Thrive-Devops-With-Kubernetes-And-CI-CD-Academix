# Sprint #3 Checklist: Secure Registry Push

Use this checklist before opening your PR.

## 1. Registry Selection
- Registry chosen: `GitHub Container Registry (ghcr.io)`
- CI workflow: `.github/workflows/ci.yml`

## 2. Secure Authentication in CI
- `docker/login-action` is used.
- Username comes from `${{ github.actor }}`.
- Password/token comes from `${{ secrets.GITHUB_TOKEN }}`.
- No plaintext credentials are stored in repository files.

## 3. Push Integrated in Pipeline
- CI computes versioned tags from chart version, run number, and short SHA.
- Docker image jobs push only on `push` to `main`.
- PR runs build images but do not push.

## 4. Verification Without Secret Exposure
- Workflow validates image push with `docker buildx imagetools inspect`.
- Workflow summary includes image references and digests (non-sensitive evidence).
- No step echoes raw secret values.

## 5. PR Submission Requirements
- Open one PR against the correct project repository.
- Include in PR description:
  - registry used
  - secure authentication method
  - push verification evidence (Actions run link)
- Ensure PR is public and accessible.

## 6. Demo Video Requirements
- Show where repository secrets are configured.
- Show CI login step using secrets/context.
- Show push success evidence (inspect step + digest summary).
