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
- Apply core application manifests (excluding standalone demo manifests like `pod.yaml` and `replicaset.yaml`) with:
  ```sh
  kubectl apply -f k8s/persistent-volumes.yaml
  kubectl apply -f k8s/mongo-deployment.yaml
  kubectl apply -f k8s/backend-deployment.yaml
  kubectl apply -f k8s/frontend-deployment.yaml
  kubectl apply -f k8s/services.yaml
  kubectl apply -f k8s/ingress.yaml
  ```
- This will deploy backend/frontend services and ingress routing locally for testing and development.

## Ingress Controller Setup (NGINX)

Install Ingress NGINX controller once in your cluster:

```sh
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s
```

## Hostname Mapping for Local Testing

Add these host entries to your local hosts file so browser traffic resolves to localhost ingress:

```text
127.0.0.1 app.academix.local
127.0.0.1 api.academix.local
```

Then access:

- Frontend: `http://app.academix.local`
- Backend API: `http://api.academix.local/docs`

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
