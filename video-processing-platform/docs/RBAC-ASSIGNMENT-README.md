# Sprint #3 Assignment: Securing Cluster Access Using RBAC Basics

This README is a practical, submission-ready guide for completing the Kalvium RBAC assignment.

---

## 1) Goal of This Assignment

Move from full admin access to **least-privilege access** using Kubernetes RBAC.

You must prove that:
- Allowed actions succeed
- Disallowed actions are denied (`Forbidden`)

---

## 2) What You Will Implement

For this project, use a namespace-scoped role for app operations.

- Create a **ServiceAccount**: `viewer-sa`
- Create a **Role** in namespace `video-platform`
- Allow only read access to selected resources (`pods`, `services`, `deployments`)
- Bind role to service account using **RoleBinding**

This is safer than cluster-admin because access is restricted by:
- Namespace (`video-platform` only)
- Resources (only selected kinds)
- Verbs (`get`, `list`, `watch` only)

---

## 3) Create RBAC YAML

Create file: `video-processing-platform/k8s/rbac-viewer.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: viewer-sa
  namespace: video-platform
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: viewer-role
  namespace: video-platform
rules:
  - apiGroups: [""]
    resources: ["pods", "services"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: viewer-rolebinding
  namespace: video-platform
subjects:
  - kind: ServiceAccount
    name: viewer-sa
    namespace: video-platform
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: viewer-role
```

---

## 4) Apply and Verify

### 4.1 Create namespace (if not exists)

```bash
kubectl create namespace video-platform
```

### 4.2 Apply RBAC file

```bash
kubectl apply -f video-processing-platform/k8s/rbac-viewer.yaml
```

### 4.3 Test allowed actions (should return yes)

```bash
kubectl auth can-i list pods --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i get services --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i watch deployments.apps --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
```

Expected output: `yes`

### 4.4 Test denied actions (should return no)

```bash
kubectl auth can-i create deployments --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i delete pods --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i get secrets --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i list pods --as=system:serviceaccount:video-platform:viewer-sa -n default
```

Expected output: `no`

---

## 5) Optional Strong Proof (Real Forbidden Error)

If your environment supports token-based SA authentication, capture a real forbidden operation screenshot/video.

Example idea:
- Try creating a deployment as `viewer-sa`
- Show error: `Error from server (Forbidden)`

Even if you use `kubectl auth can-i`, show both:
- Permission check command
- At least one real denied operation if possible

---

## 6) What to Explain in PR Description

Copy/adapt this:

```md
## RBAC Assignment: Least-Privilege Access

### What I added
- ServiceAccount: `viewer-sa` in namespace `video-platform`
- Role: `viewer-role` with read-only permissions on pods/services/deployments
- RoleBinding: `viewer-rolebinding` to bind `viewer-sa` to `viewer-role`

### Allowed access
- list/get/watch pods, services, deployments in `video-platform`

### Denied access
- create/delete operations
- access to secrets
- access outside namespace (`default`)

### Why this is secure
This follows principle of least privilege: the account only has required read access for app observation, reducing blast radius from accidental or malicious changes.
```

---

## 7) Video Demo Script (Use in Your Recording)

Record 1 video and cover:

1. Show `rbac-viewer.yaml`
2. Explain:
   - **Role vs ClusterRole**
     - Role: namespace-scoped
     - ClusterRole: cluster-wide or reusable with bindings
   - **RoleBinding vs ClusterRoleBinding**
     - RoleBinding: grants within one namespace
     - ClusterRoleBinding: grants across cluster scope
3. Run allowed checks (`yes`)
4. Run denied checks (`no`)
5. (Best) Show one real `Forbidden` action
6. Show PR diff and explain why restriction is important for team safety

Keep video public and shareable.

---

## 8) Submission Checklist

Before final submission:

- [ ] One public PR link submitted
- [ ] One public video demo link submitted
- [ ] Role/ClusterRole created
- [ ] Binding created
- [ ] Allowed actions demonstrated
- [ ] Denied actions demonstrated
- [ ] Explanation of Role vs ClusterRole given in video
- [ ] Explanation of RoleBinding vs ClusterRoleBinding given in video

---

## 9) Common Mistakes to Avoid

- Using `cluster-admin` in demo (fails least-privilege objective)
- Creating RBAC YAML but not proving deny behavior
- Binding in wrong namespace
- Forgetting to show `allowed` and `denied` both
- Submitting private/unreachable PR or video link

---

## 10) Quick Commands (All Together)

```bash
kubectl create namespace video-platform
kubectl apply -f video-processing-platform/k8s/rbac-viewer.yaml

kubectl auth can-i list pods --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i get services --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i create deployments --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i delete pods --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i get secrets --as=system:serviceaccount:video-platform:viewer-sa -n video-platform
kubectl auth can-i list pods --as=system:serviceaccount:video-platform:viewer-sa -n default
```

---

If you want, next I can also create the actual `video-processing-platform/k8s/rbac-viewer.yaml` file in your repo so your PR is ready immediately.
