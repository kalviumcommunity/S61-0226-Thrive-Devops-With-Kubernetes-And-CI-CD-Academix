# Local Kubernetes Cluster Setup

## Tool Used
Docker Desktop (Kubernetes with Kubeadm)

## Setup Steps
1. Open Docker Desktop and go to the "Kubernetes" section.
2. Click "Create" and select the cluster type (Kubeadm recommended).
3. Wait for the cluster to be created and running (green indicator).

## Verification
- Open a terminal and run:
  ```sh
  kubectl get nodes
  kubectl get pods --all-namespaces
  ```
- You should see your cluster node(s) and system pods running.

## Project Integration
- The Kubernetes manifests in the `k8s/` directory (`backend-deployment.yaml`, `frontend-deployment.yaml`, `services.yaml`) can be applied to the local cluster:
  ```sh
  kubectl apply -f k8s/
  ```
- This will deploy the backend and frontend services locally for testing and development.
- You can access the frontend using:
  ```sh
  kubectl get svc frontend-service
  # Or use Docker Desktop's port forwarding features
  ```

## Why This Is Useful
- Enables realistic, safe experimentation with Kubernetes for our project.
- Lets us debug and iterate on deployments, services, and scaling locally before production.
- Prepares us for cloud deployments and DevOps workflows.

## Health Probe Demonstration
- To demonstrate Sprint #3 liveness/readiness behavior, follow:
  - `k8s/health-probes-demo.md`
- This includes observable proof of:
  - Readiness failure removing a Pod from service endpoints
  - Liveness failure triggering container restart (self-healing)

## Rolling Update and Rollback Demonstration
- To demonstrate Sprint #3 rolling update + rollback behavior, follow:
  - `k8s/rolling-updates-rollback-demo.md`
- Optional automation script for the same flow:
  - `k8s/rollout-rollback-demo.ps1`
- This includes observable proof of:
  - Zero-downtime rolling update to a new version
  - Failed rollout simulation
  - Recovery using `kubectl rollout undo`

## Example Output
```
$ kubectl get nodes
NAME           STATUS   ROLES           AGE   VERSION
my-cluster     Ready    control-plane   10m   v1.34.1

$ kubectl get pods --all-namespaces
NAMESPACE     NAME                                      READY   STATUS    RESTARTS   AGE
kube-system   coredns-558bd4d5db-2xj7k                  1/1     Running   0          10m
kube-system   etcd-my-cluster                           1/1     Running   0          10m
...
```

---

This setup allows our team to develop, test, and experiment with Kubernetes locally, supporting a robust DevOps workflow.
