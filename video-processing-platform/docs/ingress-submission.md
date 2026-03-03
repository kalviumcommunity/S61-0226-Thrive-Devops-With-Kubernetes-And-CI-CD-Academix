# Kalvium 4.34 Submission Runbook: NGINX Ingress Controller

This runbook is optimized for the assignment requirements in **4.34 Configuring Ingress Using NGINX Ingress Controller**.

## 1) Install and verify NGINX Ingress Controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=180s

kubectl get pods -n ingress-nginx
kubectl get svc -n ingress-nginx
```

Expected: ingress controller pod is `Running` and service exists.

## 2) Deploy application manifests with Ingress

```bash
kubectl apply -f k8s/persistent-volumes.yaml
kubectl apply -f k8s/mongo-deployment.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/services.yaml
kubectl apply -f k8s/ingress.yaml

kubectl get deploy,pods,svc,ingress
```

Ingress rules in this project:

- `app.academix.local` -> `frontend-service:80`
- `api.academix.local` -> `backend-service:8000`

## 3) Map hostnames for local HTTP access (Windows)

Edit hosts file as Administrator:

`C:\Windows\System32\drivers\etc\hosts`

Add:

```text
127.0.0.1 app.academix.local
127.0.0.1 api.academix.local
```

## 4) Expose ingress endpoint locally

If your ingress controller service does not expose localhost automatically, use port-forward:

```bash
kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 80:80
```

Keep this terminal open during testing/demo.

## 5) Verify routing works end-to-end

```bash
kubectl describe ingress video-platform-ingress
kubectl get endpoints frontend-service backend-service

curl -I http://app.academix.local/
curl -I http://api.academix.local/docs
```

Browser checks:

- `http://app.academix.local`
- `http://api.academix.local/docs`

## 6) PR description template (copy/paste)

Title:

`Sprint #3 - Configure NGINX Ingress for external HTTP routing`

Body:

```markdown
## Summary
This PR configures ingress-based external access for the video-processing platform using the NGINX Ingress Controller.

## Ingress Controller Usage
- Uses NGINX Ingress Controller in cluster (`ingress-nginx` namespace).
- Ingress resource uses `ingressClassName: nginx`.

## Ingress Rules Configured
- Host `app.academix.local` routes `/` to `frontend-service:80`.
- Host `api.academix.local` routes `/` to `backend-service:8000`.

## Access URL
- Frontend: `http://app.academix.local`
- Backend API docs: `http://api.academix.local/docs`

## Verification
- Verified controller is running.
- Verified ingress and service endpoints.
- Verified HTTP access through ingress URLs.
```

## 7) Video demo script (assignment-ready)

1. Show controller status:
   - `kubectl get pods -n ingress-nginx`
   - `kubectl get svc -n ingress-nginx`
2. Open `k8s/ingress.yaml` and explain host-to-service rules.
3. Show app services:
   - `kubectl get svc`
4. Show ingress object and routing:
   - `kubectl get ingress`
   - `kubectl describe ingress video-platform-ingress`
5. Access URLs in browser:
   - `http://app.academix.local`
   - `http://api.academix.local/docs`
6. Explain request flow verbally:
   - Request -> NGINX Ingress Controller -> Ingress rule match -> Service -> Pod.
7. Walk through PR files changed and explain why each change matters.

## 8) Final submission checklist

- [ ] One public PR link
- [ ] One public video link
- [ ] NGINX Ingress Controller shown running
- [ ] Ingress YAML explained
- [ ] URL access demonstrated live
- [ ] Routing flow explained clearly
