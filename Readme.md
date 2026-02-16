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