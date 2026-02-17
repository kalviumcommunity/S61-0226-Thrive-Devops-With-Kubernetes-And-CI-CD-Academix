# Artifact Flow in CI/CD

**Source → Image → Registry → Cluster**

In this learning task, I understood how a **small code change** moves from **Git** to a **running application in Kubernetes** using a CI/CD pipeline.

Earlier, I thought code is deployed directly.
Now I understand that **code is first converted into an artifact (Docker image)** and only that artifact is deployed.

---

## 🔹 What I Learned About Source Code (Git)

* Every change starts with a **Git commit**
* A commit has a **unique commit hash**
* This commit clearly tells **which version of code** is being built

📌 **Learning:**
The commit hash is the identity of the code.

---

## 🔹 What I Learned About CI Pipeline

* CI pipeline starts automatically when code is pushed or merged
* CI does **not deploy code**
* CI:

  * Pulls the code
  * Runs tests
  * Builds a Docker image
  * Tags the image

📌 **Learning:**
CI’s main job is to **create a Docker image artifact**, not deployment.

---

## 🔹 What I Learned About Docker Images

* A Docker image contains:

  * Code
  * Runtime
  * Dependencies
* Once an image is built, it **never changes**
* Any new code change creates a **new image**

Example:

```
Commit A → app:commit-a1b2
Commit B → app:commit-b3c4
```

📌 **Learning:**
Docker images are **immutable**, which makes systems reliable.

---

## 🔹 What I Learned About Container Registry

* Docker images are stored in a **container registry**
* Kubernetes does **not** pull code from Git
* Kubernetes pulls **images from the registry**

📌 **Learning:**

* **Image tags** are human-friendly names
* **Image digests** uniquely identify the exact image
* Registries help in **versioning and traceability**

---

## 🔹 What I Learned About Kubernetes Deployment

* Kubernetes Deployments mention:

  * Image name
  * Image tag
  * Number of replicas
* Kubernetes:

  * Pulls image from registry
  * Runs containers
  * Restarts failed containers
  * Performs rolling updates

📌 **Learning:**
Kubernetes runs **sealed images**, not source code.

---

## 🔹 What I Learned About Rollbacks

* Rollbacks are easy because:

  * Images are immutable
  * Registries store old images
  * Deployment points to a specific image

If a release fails:

* Select the previous image
* Redeploy it
* Kubernetes rolls back safely

📌 **Learning:**
No rebuilding. No guessing. Just redeploy an old image.

---

## 🔹 Complete Flow I Learned

```
Git Commit
   ↓
CI Pipeline
   ↓
Docker Image
   ↓
Container Registry
   ↓
Kubernetes Cluster
```

---

#  Kubernetes Application Lifecycle & Deployment Mechanics

## Overview

This document explains how Kubernetes manages application workloads throughout their lifecycle — from creation and scheduling to updates, failures, and recovery.

It covers:

- Deployment → ReplicaSet → Pods
- Rolling updates
- Health probes
- Resource configuration
- Pod failure states
- Self-healing behavior

---

# 1️ Kubernetes Lifecycle (Deployment → ReplicaSet → Pods)

## Desired State vs Current State

Kubernetes works using a **desired state model**.

When we create a Deployment, we define the desired state of the system.  
For example:

- Run 3 replicas
- Use image version v1
- Maintain high availability

Kubernetes continuously compares the **current state** of the cluster with the **desired state**.

If there is any difference, Kubernetes automatically corrects it.  
This continuous correction process is called **reconciliation**.

---

## Deployment → ReplicaSet → Pods Flow

###  Deployment
- Defines the desired state (replica count, image version, update strategy).
- Manages updates and rollbacks.
- Creates and manages ReplicaSets.

###  ReplicaSet
- Created automatically by the Deployment.
- Ensures the specified number of Pods are always running.
- Recreates Pods if they fail.

###  Pods
- Smallest deployable unit in Kubernetes.
- Contain one or more containers.
- Run the application.

---

## Pod Scheduling Process

1. Deployment creates a ReplicaSet.
2. ReplicaSet creates Pods.
3. The Kubernetes Scheduler:
   - Checks available Nodes.
   - Evaluates CPU & memory availability.
4. Pod is assigned to a suitable Node.
5. The kubelet on that Node starts the container.

---

## What Happens if a Pod Crashes?

- If a container crashes → kubelet restarts it.
- If a Pod fails completely → ReplicaSet creates a new Pod.
- If a Node fails → Pods are rescheduled to other Nodes.

This automatic recovery behavior is called **self-healing**.

---

# 2 Deployment & Rolling Update Mechanics

## How Rolling Updates Work

When we update an application (for example, image v1 → v2):

1. Deployment creates a new ReplicaSet with the new image.
2. New Pods are started gradually.
3. Old Pods are terminated slowly.
4. Availability is maintained using:
   - `maxUnavailable`
   - `maxSurge`

This ensures zero or minimal downtime.

---

## Successful Rollout

A rollout is successful when:

- All new Pods are running and ready.
- Old ReplicaSet is scaled down to zero.
- Application is fully running on the new version.

---

## Failed Rollout

If new Pods fail to start:

- They may enter CrashLoopBackOff.
- Readiness probes may fail.
- Deployment rollout pauses.
- Kubernetes allows rollback to the previous working version.

ReplicaSets track both:
- Old version
- New version

---

# 3️ Health Probes & Resource Configuration

## Health Probes

###  Liveness Probe
- Checks if the container is alive.
- If it fails → container is restarted.

###  Readiness Probe
- Checks if the container is ready to serve traffic.
- If it fails → Pod is removed from Service endpoints.

###  Startup Probe
- Used for slow-starting applications.
- Prevents early restarts during initialization.

---

## CPU & Memory Configuration

### Resource Requests
- Used by the scheduler.
- Determines where the Pod can be placed.
- Ensures sufficient resources are reserved.

### Resource Limits
- Maximum resources a container can use.
- If memory exceeds limit → container is OOMKilled.
- If CPU exceeds limit → CPU throttling occurs.

---

## Impact of Misconfiguration

Incorrect configuration can cause:

- CrashLoopBackOff (due to failed probes)
- OOMKilled (due to low memory limit)
- Pending state (due to high resource requests)
- Unavailable application (due to readiness probe failure)

---

# 4️ Common Pod States & Failure Conditions

##  Pending
**Meaning:** Pod created but not scheduled.  
**Cause:** Insufficient resources or constraints.  
**Response:** Kubernetes waits until resources are available.

---

##  CrashLoopBackOff
**Meaning:** Container keeps crashing repeatedly.  
**Cause:** Application errors or bad configuration.  
**Response:** Kubernetes retries with exponential backoff.

---

##  ImagePullBackOff
**Meaning:** Failed to pull container image.  
**Cause:** Incorrect image name or registry issue.  
**Response:** Kubernetes retries pulling the image.

---

##  OOMKilled
**Meaning:** Container exceeded memory limit.  
**Cause:** Memory limit too low or memory leak.  
**Response:** Kubernetes kills and restarts container.

---

# 5️ Kubernetes Lifecycle Diagram

```

Deployment
↓
ReplicaSet
↓
Pod Creation
↓
Scheduler Assigns Node
↓
Container Start (kubelet)
↓
Health Checks (Probes)
↓
Running State
↙             ↘
Restart        Reschedule

```

Export this diagram as an image and attach it to your PR.

---

# 6️ Reflection

Kubernetes focuses on maintaining the **desired state**, not application correctness.

The platform:

- Automates deployment and scaling
- Provides self-healing
- Maintains infrastructure reliability

However, Kubernetes cannot fix:

- Application logic bugs
- Business logic errors

There is a clear boundary:

- Kubernetes ensures infrastructure health.
- Developers ensure application correctness.

This separation allows Kubernetes to provide reliable automation while keeping responsibility clearly divided.


#  CI/CD Pipeline Execution Model & Responsibility Boundaries


## CI/CD Execution Model (Big Picture)

```
Code Change
   ↓
CI Pipeline (Build & Test)
   ↓
Artifact Creation (Docker Image)
   ↓
CD Pipeline (Deploy)
   ↓
Infrastructure (Kubernetes / Cloud)
```

Each stage has a clear responsibility and ownership boundary.

---

## Continuous Integration (CI)

**Purpose:** Validate code before merge.

### CI Responsibilities

* Checkout source code
* Install dependencies
* Run unit tests
* Run lint/static analysis
* Build Docker image
* Tag image
* Push image to container registry

### Key Rule

> CI answers: **“Is this code safe to merge?”**

### Triggered By

* Pull Requests
* Commits to branches

---

## Continuous Deployment (CD)

**Purpose:** Deploy already validated artifacts.

### CD Responsibilities

* Pull pre-built Docker image
* Update Kubernetes manifests
* Apply manifests to cluster
* Trigger rolling updates
* Manage rollbacks

### Key Rule

> CD answers: **“How do we safely run this version?”**

 CD does **NOT** rebuild code. It deploys artifacts created by CI.

---

##  Where Actions Happen

| Action                 | Responsibility   |
| ---------------------- | ---------------- |
| Writing business logic | Application Code |
| Writing unit tests     | Application Code |
| Running tests          | CI               |
| Building Docker image  | CI               |
| Tagging image          | CI               |
| Pushing to registry    | CI               |
| Updating K8s manifests | CD               |
| Applying manifests     | CD               |
| Restarting failed pods | Kubernetes       |

---

## 🏗 Responsibility Boundaries

### 1️⃣ Application Code

* Implements features
* Defines tests
* Does NOT deploy itself

### 2️⃣ CI Pipeline

* Validates code
* Builds artifacts
* Fails fast on errors

### 3️⃣ CD Pipeline

* Deploys artifacts
* Updates environments
* Handles rollouts

### 4️⃣ Infrastructure (Kubernetes)

* Runs workloads
* Maintains desired state
* Self-heals failures

---

##  Why Separation Matters

* Prevents accidental production deployments
* Enables safe Pull Request reviews
* Reduces blast radius of errors
* Makes rollbacks predictable
* Improves system reliability

---

## Safe Pipeline Modifications

Pipeline changes must be:

* Small
* Reviewed carefully
* Intentionally scoped
* Version controlled

### Impact Awareness

| Change Type            | Affects       |
| ---------------------- | ------------- |
| Test step change       | CI validation |
| Build step change      | Artifacts     |
| Deployment step change | Live systems  |

---

## Common Misconceptions

| Incorrect Thinking           | Correct Model              |
| ---------------------------- | -------------------------- |
| CI deploys code              | CI validates code          |
| CD rebuilds app              | CD deploys artifacts       |
| Pipelines replace Kubernetes | Kubernetes manages runtime |

---

## Interaction with Kubernetes

CD applies manifests to Kubernetes.

Kubernetes:

* Schedules pods
* Performs rolling updates
* Restarts failed containers
* Maintains desired state

Pipelines orchestrate actions.
Kubernetes executes runtime behavior.

# DevOps Workstation Setup – Sprint #3 (Windows)

## 1. System Overview

- **Operating System:** Windows 10/11
- **Shell:** PowerShell
- **Virtualization:** WSL2 and Docker Desktop

## 2. Installed DevOps Tools

### 2.1 Git

- **Installation Method:** Git for Windows (`git-scm.com`)
- **Verification Command:**

```powershell
git --version
git config --list
```

- **Sample Output:**

```text
git version 2.45.0.windows.1
user.name=Your Name
user.email=your.email@example.com
```

---

### 2.2 Docker Desktop

- **Installation Method:** Docker Desktop for Windows (`docker.com/products/docker-desktop`)
- **Verification Commands:**

```powershell
docker version
docker info
```

- **Sample Output (excerpt):**

```text
Client: Docker Engine - Community
Server: Docker Desktop
 Server Version: 27.0.0
```

---

### 2.3 Kubernetes (Docker Desktop)

- **Installation Method:** Enable Kubernetes in Docker Desktop → Settings → Kubernetes
- **Verification Commands:**

```powershell
kubectl config current-context
kubectl get nodes
kubectl cluster-info
```

- **Sample Output:**

```text
CURRENT CONTEXT: docker-desktop

NAME             STATUS   ROLES           AGE   VERSION
docker-desktop   Ready    control-plane   10m   v1.29.0
```


---

### 2.4 kubectl

- **Installation Method:** `winget install Kubernetes.kubectl`
- **Verification Command:**

```powershell
kubectl version --client
```

- **Sample Output:**

```text
Client Version: v1.29.0
```

---

### 2.5 Helm

- **Installation Method:** `winget install Helm.Helm`
- **Verification Commands:**

```powershell
helm version
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo list
```

- **Sample Output:**

```text
version.BuildInfo{Version:"v3.14.0", ...}

NAME    URL
bitnami https://charts.bitnami.com/bitnami
```

---

### 2.6 curl and Supporting CLI Tools

- **Installation Method:**
  - `curl` via built-in Windows or `winget install curl.curl`
  - `jq` via `winget install jqlang.jq`
- **Verification Commands:**

```powershell
curl --version
jq --version
```

- **Sample Output:**

```text
curl 8.5.0 (Windows) ...
jq-1.7
```

---

## 3. Sample Kubernetes Deployment

This section documents a simple application deployed to the local Kubernetes cluster to prove functional readiness.

### 3.1 Namespace

File: `k8s/sample-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: devops-lab
```

Apply:

```powershell
kubectl apply -f k8s/sample-namespace.yaml
kubectl get ns
```

### 3.2 Deployment and Service

File: `k8s/sample-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello-deployment
  namespace: devops-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: hello-app
  template:
    metadata:
      labels:
        app: hello-app
    spec:
      containers:
        - name: hello-container
          image: nginx:stable
          ports:
            - containerPort: 80
```

File: `k8s/sample-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: hello-service
  namespace: devops-lab
spec:
  type: ClusterIP
  selector:
    app: hello-app
  ports:
    - port: 80
      targetPort: 80
```

Apply:

```powershell
kubectl apply -f k8s/sample-deployment.yaml
kubectl apply -f k8s/sample-service.yaml
kubectl get all -n devops-lab
```

---

## 4. Troubleshooting Summary

Common issues and fixes are documented in `docs/troubleshooting.md` and include:

- PATH issues for `git`, `kubectl`, `helm`, and `curl`
- Docker daemon not running
- Kubernetes context misconfiguration

---

## 5. Evidence Checklist for Academic Submission

- [ ] `devops-setup/` directory checked into version control
- [ ] Screenshots of all tool versions and Kubernetes resources
- [ ] Text logs of key verification commands in `logs/`
- [ ] Sample Kubernetes deployment and service manifest files
- [ ] README updated with final versions and dates
- [ ] Git commit and Pull Request link documented