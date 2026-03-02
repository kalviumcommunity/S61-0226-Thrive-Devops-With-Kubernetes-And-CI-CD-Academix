# Kubernetes Persistent Storage Demonstration Guide

This guide walks you through implementing and verifying persistent storage in Kubernetes using PersistentVolumeClaims (PVCs).

## 1. Apply the Manifests
First, create the PVC and Deployment:
```powershell
kubectl apply -f k8s/storage-demo.yaml
```

## 2. Inspect PVC Status
Verify that the PVC is bound to a PersistentVolume:
```powershell
kubectl get pvc demo-pvc
```
**Expected Output:** `STATUS` should be `Bound`.

To see more details:
```powershell
kubectl describe pvc demo-pvc
```

## 3. Write Test Data
Exec into the running Pod and create a file in the `/data` directory:
```powershell
# Get the pod name
$POD_NAME = (kubectl get pods -l app=storage-demo -o jsonpath='{.items[0].metadata.name}')

# Create test data
kubectl exec $POD_NAME -- /bin/sh -c "echo 'Hello from Persistent Storage!' > /data/persistence-test.txt"

# Verify file exists
kubectl exec $POD_NAME -- cat /data/persistence-test.txt
```

## 4. Delete the Pod (Simulate Failure)
Delete the Pod to demonstrate that data survives:
```powershell
kubectl delete pod $POD_NAME
```

Wait for the new Pod to be created and reach `Running` state:
```powershell
kubectl get pods -l app=storage-demo -w
```

## 5. Verify Persistence
Get the new Pod's name and verify the file still exists:
```powershell
$NEW_POD_NAME = (kubectl get pods -l app=storage-demo -o jsonpath='{.items[0].metadata.name}')

kubectl exec $NEW_POD_NAME -- cat /data/persistence-test.txt
```
**Expected Output:** `Hello from Persistent Storage!`

---

## Conceptual Explanations

### Why Pods are Ephemeral
Pods are designed to be temporary. If a Pod is deleted, its internal filesystem is wiped. Without a PersistentVolume, any data stored in a container is lost when the Pod is rescheduled or restarted.

### How StorageClasses Work
A `StorageClass` provides a way for administrators to describe the "classes" of storage they offer (e.g., SSD vs HDD). When you create a PVC, Kubernetes uses the `StorageClass` to dynamically provision a `PersistentVolume` (PV) that matches the requested requirements.

### Inspecting Storage Binding
When a PVC is "Bound", it means Kubernetes has found (or created) a suitable PV and linked it to the PVC. This binding is a 1-to-1 relationship that ensures your data is reserved for your application.
