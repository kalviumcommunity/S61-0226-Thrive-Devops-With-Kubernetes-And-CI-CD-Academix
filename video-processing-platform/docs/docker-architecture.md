## Understanding Docker Architecture in the Video Processing Platform Project

This document explains how Docker is used in the `video-processing-platform` project and connects each Docker concept directly to the existing structure:

```text
video-processing-platform/
  backend/
  frontend/
  docker-compose.yml
```

The goal is to understand how images, containers, layers, and orchestration work together for this specific backend–frontend system, not just to repeat generic Docker theory.

---

## Docker as a Platform in This Project

Docker is the platform we use to package and run the two main services of this project:

- Backend API (`backend/`)
- Frontend web app (`frontend/`)

At a high level, Docker provides:

- **Docker Engine**  
  The daemon that builds images and runs containers on your machine. When you use `docker-compose up` for this project, Docker Engine:
  - Builds the backend image from `backend/Dockerfile`
  - Builds the frontend image from `frontend/Dockerfile`
  - Starts containers for:
    - `video-processing-platform-backend`
    - `video-processing-platform-frontend`
    - `mongo` (database used by the backend)

- **Docker Images**  
  Read‑only, versioned artifacts that contain:
  - A base OS layer (e.g. `python:3.11-slim` for backend, `node:20-alpine` for frontend)
  - Project dependencies (Python packages in `requirements.txt`, Node modules from `package.json`)
  - Your application code

- **Docker Containers**  
  Runtime instances of those images:
  - A backend container runs the FastAPI app from `backend/main.py`
  - A frontend container runs the Next.js app built from `frontend/`
  - A MongoDB container runs the database process used by the backend

Docker lets you treat these services as isolated but connected building blocks that can be reproduced on any machine with Docker Engine installed.

---

## Docker Images and This Repository

In this project, there are two main application images.

- **Backend image**
  - Defined by: `backend/Dockerfile`
  - Based on: `python:3.11-slim`
  - Bundles:
    - Python runtime
    - Backend dependencies from `backend/requirements.txt` (FastAPI, uvicorn, Motor, etc.)
    - Application code in `backend/main.py`
  - Purpose: run the video processing API (upload, transcoding, lecture catalog) in a stable environment.

- **Frontend image**
  - Defined by: `frontend/Dockerfile`
  - Based on: `node:20-alpine`
  - Bundles:
    - Node.js runtime
    - Frontend dependencies from `frontend/package.json`
    - Next.js build output (`.next/standalone`, `.next/static`, `public/`)
  - Purpose: serve the React/Next.js frontend that students and admins use.

- **Orchestration with `docker-compose.yml`**
  - The root `docker-compose.yml` ties the images together:
    - Builds backend and frontend images from their respective folders
    - Starts containers with the right environment variables (e.g. `MONGO_URL`)
    - Attaches both application containers to the `mongo` database container
  - From a Docker architecture point of view, `docker-compose.yml` is the single source of truth for:
    - Which images run
    - How they connect
    - What ports are exposed to the host

In practice, the images are the immutable “binaries” of this system: the backend image and frontend image are what you move between environments (local, CI, staging, production).

---

## Docker Layers and Build Behavior

Docker images are built as a stack of layers. Each instruction in a `Dockerfile` creates a new layer. This has two important consequences:

- Build performance is heavily affected by the order of instructions.
- Changes to certain files (like `requirements.txt`) invalidate caching for all later layers.

### Backend Dockerfile and Layers

The backend `Dockerfile` roughly follows this pattern:

1. Start from base image (`FROM python:3.11-slim`)
2. Set working directory (`WORKDIR /app`)
3. Install system dependencies (e.g. `ffmpeg`)
4. Copy `requirements.txt`
5. Install Python dependencies with `pip`
6. Copy the rest of the backend code
7. Set the container command (`uvicorn main:app ...`)

Layer implications:

- Steps 1–5 are relatively stable, and Docker can cache them.
- When you **only change `backend/main.py`**, the cached layers for:
  - base image
  - system packages
  - Python dependencies
  remain valid. Docker only re-runs the steps from “COPY . .” onward, making rebuilds fast.
- When you **change `requirements.txt`**, the layer that installs dependencies is invalidated. Docker must:
  - Reinstall all Python packages
  - Rebuild every subsequent layer
  This is slower but necessary; the new image needs updated dependencies.

### Frontend Dockerfile and Layers

The frontend `Dockerfile` uses a multi‑stage build:

1. **Builder stage**
   - Base image: `node:20-alpine`
   - `WORKDIR /app`
   - `COPY package*.json ./`
   - `RUN npm ci`
   - `COPY . .`
   - `RUN npm run build`

2. **Runner stage**
   - Base image: `node:20-alpine`
   - `WORKDIR /app`
   - `COPY --from=builder /app/.next/standalone ./`
   - `COPY --from=builder /app/.next/static ./.next/static`
   - `COPY --from=builder /app/public ./public`
   - `EXPOSE 3000`
   - `CMD ["node", "server.js"]`

Layer implications:

- If you change only frontend source files (e.g. `frontend/app/student/page.tsx`), Docker can reuse:
  - The Node base image
  - The `npm ci` dependency installation layer
  and rerun only the layers that copy source and run `npm run build`.
- If you change `package.json` or `package-lock.json`, the `npm ci` layer must be recomputed. That means reinstalling all dependencies, which is more expensive but ensures a consistent environment.

Designing Dockerfiles with layer caching in mind is essential for fast local iteration and efficient CI builds.

---

## Containers as Runtime Instances

Once images are built, Docker Engine runs them as containers. In this project:

- **Backend container**
  - Created from the backend image
  - Runs uvicorn serving the FastAPI app defined in `backend/main.py`
  - Connects to MongoDB (either the `mongo` container via `mongodb://mongo:27017` or an external cluster)

- **Frontend container**
  - Created from the frontend image
  - Runs `node server.js` from `.next/standalone`
  - Serves the Next.js application on port 3000

- **Mongo container**
  - Created from the official `mongo:7` image
  - Stores data on a Docker volume so it can survive container restarts

### Writable Container Layer

Each container has a small writable layer on top of the image:

- At runtime, logs, temporary files, and any changes you make inside the container live in this writable layer.
- The underlying image remains unchanged; it is read‑only and reusable.

This explains why:

- You can modify files inside a running backend container (for debugging).
- Those modifications vanish when the container is destroyed, because they were in the container’s ephemeral layer, not in the image or your Git repo.

For lasting changes, you must modify the source code in `backend/` or `frontend/` and rebuild the image.

---

## Image–Container Lifecycle in This Project

The lifecycle of a service in this project can be described as:

```text
Source code  -->  Image build  -->  Container run  -->  Container stop/remove
    ^                ^                 |
    |                |                 v
    +---- edits <----+------ rebuild --+
```

### ASCII Lifecycle Diagram

```text
        +------------------+
        |  Source Code     |
        |  backend/,       |
        |  frontend/       |
        +---------+--------+
                  |
                  | docker build / docker-compose up --build
                  v
        +------------------+
        |  Docker Images   |
        |  backend image   |
        |  frontend image  |
        +---------+--------+
                  |
                  | docker run / docker-compose up
                  v
        +------------------+
        |  Containers      |
        |  backend-1       |
        |  frontend-1      |
        +---------+--------+
                  |
                  | stop / remove
                  v
        +------------------+
        |  Stopped State   |
        +------------------+
```

In local development and CI/CD, the same pattern repeats:

- Build images from the current commit
- Run tests against containers
- Deploy images to higher environments

Because images are immutable snapshots of code + dependencies, this lifecycle gives you strong reproducibility: if a build passed in CI for a given image tag, you can run that same image in production and expect identical behavior (ignoring environment configuration and external services).

---

## Scenario: Modifying Files Inside a Running Backend Container

Consider the backend container started from the backend image.

### What happens if you edit code inside the container?

Assume you:

- Exec into the container:

  ```text
  docker exec -it video-processing-platform-backend-1 /bin/sh
  ```

- Open `/app/main.py` and change logic in one of the endpoints.

Effects:

- The change takes effect **only in that container**, and only until the container is stopped.
- The change is not reflected:
  - In your local `backend/main.py` file
  - In the backend image stored on your machine
  - In any other container started from that image

This is useful for temporary experiments but dangerous for real development, because it breaks reproducibility and cannot be reviewed or versioned.

### Why rebuilding the image is required

To persist code changes in a clean, DevOps‑friendly way:

1. Edit the source code in `backend/main.py` (or other backend files) in the repository.
2. Commit the changes to Git so they are versioned.
3. Rebuild the backend image:

   - Locally, via `docker-compose up --build`
   - In CI/CD, via the configured pipeline

By rebuilding:

- The new image includes your updated code.
- Everyone running that image (local, CI, staging, production) sees the same behavior.
- The build cache still accelerates rebuilds as long as you do not unnecessarily invalidate heavy layers.

### How caching behaves when `requirements.txt` changes

Dependency changes are especially important in this project:

- If you only change application code:
  - Backend:
    - Docker reuses the layer that installs Python packages from `requirements.txt`.
    - Only the final “copy source” and any following layers are rebuilt.
  - Frontend:
    - Docker reuses the `npm ci` layer.
    - Only the source copy and `npm run build` layers are recomputed.

- If you modify `backend/requirements.txt`:
  - The image layer that runs `pip install -r requirements.txt` must be rebuilt.
  - Docker cannot reuse the old dependency installation layer.
  - All layers after that step are also rebuilt.
  - This is slower but ensures that the running containers use the correct dependencies.

- If you modify `frontend/package.json` or `package-lock.json`:
  - The `npm ci` layer must be rebuilt, reinstalling Node dependencies.
  - Again, this slows the build but is required for correctness.

From an engineering perspective, this is a trade‑off:

- Group and order instructions in Dockerfiles so that:
  - Stable layers (base image, system dependencies, language runtime) are at the top.
  - Frequently changing layers (application code) are at the bottom.
- Keep dependency changes intentional and explicit, because they flush the cache for heavy layers.

---

## Engineering Reasoning: Performance, Reproducibility, and DevOps Workflow

In the `video-processing-platform` project, Docker architecture supports three primary goals:

- **Performance**
  - Layer caching keeps repeated builds fast during local development.
  - Multi‑stage builds for the frontend create slim runtime images that start quickly and contain only what is needed to serve the app.

- **Reproducibility**
  - Images act as immutable artifacts tying a specific code revision to a specific dependency snapshot.
  - Running the same image tag in CI, staging, and production reduces “works on my machine” issues.
  - Source changes inside containers are avoided; instead, changes are made in the repo and propagated via new images.

- **DevOps Workflow**
  - `docker-compose.yml` provides a local orchestration model that mirrors how services will be deployed later (e.g. multiple containers communicating over a network).
  - The backend and frontend have clear Dockerfile boundaries, making it straightforward to:
    - Add health checks
    - Configure environment variables (e.g. `MONGO_URL`, Clerk keys for the frontend)
    - Attach monitoring or logging sidecars in more advanced deployments

Understanding these concepts in the context of this specific repository makes it easier to:

- Debug build problems (cache misses, dependency changes)
- Understand why a container behaves differently from local `npm run dev` or `uvicorn` runs
- Design future CI/CD pipelines and Kubernetes manifests that are consistent with how the project is already containerized today

