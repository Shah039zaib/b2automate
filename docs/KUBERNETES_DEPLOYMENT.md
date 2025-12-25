# Kubernetes Deployment Guide

> **Status:** READY FOR DEPLOYMENT
> **Environment:** Kubernetes 1.25+

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Ingress Controller                    │
│                 (nginx-ingress / traefik)                │
└─────────────────┬───────────────────────┬───────────────┘
                  │                       │
         ┌────────▼────────┐     ┌────────▼────────┐
         │   API Service   │     │   Web Service   │
         │  (apps/api)     │     │  (apps/web)     │
         │   Port 3000     │     │   Port 80       │
         └────────┬────────┘     └────────┬────────┘
                  │                       │
    ┌─────────────┼───────────────────────┼─────────────┐
    │             │                       │             │
┌───▼───┐   ┌─────▼─────┐          ┌──────▼──────┐      │
│ Redis │   │ PostgreSQL│          │  CDN/Static │      │
│       │   │ (Supabase)│          │             │      │
└───────┘   └───────────┘          └─────────────┘      │
                                                        │
         ┌─────────────────────────────────────┐        │
         │      WhatsApp Worker (Deployment)    │        │
         │           apps/whatsapp-worker       │◄───────┘
         └─────────────────────────────────────┘
```

---

## Health Probes

### API Service

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 20
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
```

### Recommended Health Endpoint (apps/api)

```typescript
// Already exists at /health
// Add /health/ready for readiness checks

app.get('/health/ready', async (req, reply) => {
    try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        
        // Check Redis connection
        await redis.ping();
        
        return { status: 'ready', database: 'ok', redis: 'ok' };
    } catch (err) {
        return reply.code(503).send({ 
            status: 'not_ready', 
            error: err.message 
        });
    }
});
```

---

## Environment Variables

### API Deployment

```yaml
env:
  - name: DATABASE_URL
    valueFrom:
      secretKeyRef:
        name: b2automate-secrets
        key: database-url
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: b2automate-secrets
        key: redis-url
  - name: JWT_SECRET
    valueFrom:
      secretKeyRef:
        name: b2automate-secrets
        key: jwt-secret
  - name: STRIPE_SECRET_KEY
    valueFrom:
      secretKeyRef:
        name: b2automate-secrets
        key: stripe-secret
  - name: NODE_ENV
    value: "production"
```

### Secrets (create before deployment)

```bash
kubectl create secret generic b2automate-secrets \
  --from-literal=database-url="postgresql://..." \
  --from-literal=redis-url="redis://..." \
  --from-literal=jwt-secret="..." \
  --from-literal=stripe-secret="..."
```

---

## Resource Recommendations

### API Service
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### WhatsApp Worker
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "200m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

---

## Scaling

### Horizontal Pod Autoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: b2automate-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### WhatsApp Worker Scaling

> **Important:** WhatsApp workers use BullMQ which automatically distributes jobs across workers. Deploy multiple replicas for high availability.

```yaml
spec:
  replicas: 2  # At least 2 for HA
```

---

## Deployment Order

1. **Secrets** - Create Kubernetes secrets first
2. **Redis** - Deploy Redis (or use managed service)
3. **Database** - Ensure Supabase/PostgreSQL is accessible
4. **API** - Deploy API service
5. **Worker** - Deploy WhatsApp worker
6. **Frontend** - Deploy web/admin as static or container
7. **Ingress** - Configure ingress rules

---

## Sample Deployment Manifest

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: b2automate-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: b2automate-api
  template:
    metadata:
      labels:
        app: b2automate-api
    spec:
      containers:
        - name: api
          image: your-registry/b2automate-api:latest
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: b2automate-secrets
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
```

---

## Notes

- Use `RollingUpdate` strategy for zero-downtime deployments
- Set `terminationGracePeriodSeconds: 30` for graceful shutdown
- Use `PodDisruptionBudget` to ensure availability during node drains
- Consider using Helm charts for template management
