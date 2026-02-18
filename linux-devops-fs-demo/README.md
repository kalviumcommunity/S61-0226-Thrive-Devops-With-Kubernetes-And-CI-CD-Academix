# Linux Filesystem Structure & Permissions for DevOps Workflows

This repository demonstrates practical Linux usage in the context of DevOps, CI/CD pipelines, container builds, and deployment workflows.

It is a hands-on environment you can run locally or in CI.

---

## 1. Repository Layout

```text
app/      # Application code and container build context
scripts/  # CI/CD, deployment, and inspection scripts
config/   # Configuration and secrets (with proper permissions)
logs/     # Runtime logs, separated from code and config
ci/       # CI pipeline notes / examples
```

### Why filesystem separation matters in DevOps

- `app/` keeps runtime code isolated from logs and configuration, making container builds and deployments predictable.
- `config/` holds environment-specific settings and secrets, so the same image can be promoted from dev → staging → prod by swapping config.
- `logs/` is separated so logs can be mounted to a persistent volume or shipped to logging backends without mixing with code.
- `scripts/` keeps operational tasks (build, deploy, inspect) organized and versioned with the code.

---

## 2. Core Scripts

### 2.1 Build script (scripts/build.sh)

```bash
./scripts/build.sh
```

Key commands inside:

- `pwd` prints the current working directory so CI logs show where the build is running.
- `ls -la` lists all files with permissions, making it easy to see if scripts are executable and configs are readable as expected.
- `tree` shows the directory layout (if installed) for a quick visual of separation between app, config, logs, and scripts.
- `chmod +x scripts/*.sh` ensures all scripts are executable before CI tries to run them, avoiding `permission denied` failures.
- `chmod 644 config/app.env config/app.conf` and `chmod 600 config/secrets.env` model secure handling of configuration and secrets.
- `docker build -t linux-devops-fs-demo:latest app` builds the Docker image using a clean build context.

---

### 2.2 Deploy script (scripts/deploy.sh)

```bash
./scripts/deploy.sh
```

Key commands and DevOps reasoning:

- `docker run -d --name linux-devops-fs-demo -p 8080:8080 linux-devops-fs-demo:latest` starts the container and maps port 8080.
- `ps aux` (via `docker exec`) confirms the app process and its helper processes are actually running.
- `ss -tuln` (via `docker exec`) confirms the application is listening on the expected port.
- `curl http://localhost:8080` from the host verifies connectivity from outside the container.

These checks are the first-line debugging tools when a deployment appears successful but the application is not accessible.

---

### 2.3 Permissions demo (scripts/permissions-demo.sh)

```bash
./scripts/permissions-demo.sh
```

This script simulates a common CI failure:

- Removes the execute bit from `scripts/build.sh` using `chmod 644 scripts/build.sh`.
- Attempts to run `./scripts/build.sh`, which fails with `permission denied`.
- Restores execute permissions using `chmod +x scripts/build.sh`.

This models a real CI pipeline issue where scripts are not executable on Linux agents, even though they run fine on a local machine.

---

## 3. Why Permissions and Config Separation Matter

### Script execution permissions

- Linux requires execute permissions (`+x`) for scripts run as `./script.sh`.
- In CI environments, scripts checked in without `+x` will fail with `permission denied`.
- This repository enforces executable permissions via `chmod +x scripts/*.sh` in the build script.

### Config files with restricted permissions

- `config/secrets.env` contains sensitive values and is set to `chmod 600`, allowing only the owner to read or write.
- This prevents other users on the same system from reading secrets.
- In production, files like `secrets.env` are often owned by `root` with `chown root:root` and `chmod 600`.

### Process inspection to debug CI failures

- `ps aux` and `top` reveal which processes are running and consuming resources.
- In CI, they help debug:
  - Long-running or stuck processes.
  - Unexpected background jobs.
  - High CPU or memory usage causing timeouts.

### Port inspection to debug deployment issues

- `ss -tuln` or `netstat -tuln` lists listening ports.
- They immediately show:
  - Whether the app is listening at all.
  - Which address and port it is bound to (for example, `0.0.0.0:8080` vs `127.0.0.1:8080`).
- Combined with `curl localhost`, they form a complete picture of application reachability.

---

## 4. Scenarios

### Scenario 1: CI pipeline fails with "permission denied"

1. CI job runs `./scripts/build.sh`.
2. Build fails with:

```text
bash: ./scripts/build.sh: Permission denied
```

3. Root cause:
   - `scripts/build.sh` was checked into Git without execute permissions.
4. Fix:
   - Run `chmod +x scripts/build.sh` locally.
   - Commit the change so CI agents receive the executable bit.

The `scripts/permissions-demo.sh` script simulates this failure and fix end-to-end.

### Scenario 2: Application deployed but not accessible

1. CI logs show `docker run` succeeded, but:

```bash
curl http://localhost:8080
```

returns `Connection refused` or times out.

2. Troubleshooting flow:
   - Use `docker ps` to verify the container is running.
   - Use `docker exec linux-devops-fs-demo ps aux` to verify the app process is alive.
   - Use `docker exec linux-devops-fs-demo ss -tuln` to verify the app is listening on the correct port.
   - Use `curl http://localhost:8080` from the host to confirm external accessibility.

This structured approach shows how process and port inspection solve real deployment issues.

---

## 5. Commands and Expected Outputs

Run these from the repository root inside a Linux environment or a dev container.

```bash
pwd
ls -la
tree
./scripts/build.sh
./scripts/deploy.sh
./scripts/inspect-processes.sh
./scripts/inspect-ports.sh
./scripts/permissions-demo.sh
```

Each script prints clear logs and uses standard Linux tools (`pwd`, `ls`, `chmod`, `chown`, `ps aux`, `top`, `ss -tuln`, `curl`) in a way that matches real DevOps workflows.

---

## 6. Video Demo Outline

A short live demo can:

- Show the filesystem structure with `pwd`, `ls -la`, and `tree`.
- Run `./scripts/build.sh` and highlight permission settings.
- Run `./scripts/deploy.sh` and show `ps aux`, `ss -tuln`, and `curl localhost`.
- Run `./scripts/permissions-demo.sh` to demonstrate a CI "permission denied" failure and the fix.

This repository is ready to be used as a public demonstration of Linux filesystem structure and permissions in DevOps.

