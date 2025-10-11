# Claude Relay Service Helm Chart

A Helm chart for deploying Claude Relay Service on Kubernetes. This service provides a multi-account Claude API relay with advanced features like load balancing, rate limiting, and comprehensive monitoring.

## Features

- 🚀 **Multi-account Claude API relay** with intelligent load balancing
- 🔒 **Secure authentication** with JWT tokens and API key management
- 📊 **Built-in monitoring** with Prometheus metrics and ServiceMonitor support
- 🗄️ **Redis integration** with both internal and external Redis support
- 🌐 **Ingress support** with customizable routing and TLS
- 📈 **Horizontal Pod Autoscaling** for automatic scaling
- 💾 **Persistent storage** for data retention
- 🔧 **Highly configurable** with comprehensive values.yaml

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)

## Installation

### Add Helm Repository

```bash
# If you have a Helm repository
helm repo add claude-relay https://your-helm-repo.com
helm repo update
```

### Install from Local Chart

```bash
# Clone the repository
git clone https://github.com/your-username/claude-relay-service.git
cd claude-relay-service/charts/claude-relay

# Install with default values
helm install my-claude-relay .

# Install with custom values
helm install my-claude-relay . -f my-values.yaml
```

### Install with Custom Configuration

```bash
# Install with external Redis
helm install my-claude-relay . \
  --set redis.enabled=false \
  --set externalRedis.host=my-redis.example.com \
  --set externalRedis.password=mypassword

# Install with ingress enabled
helm install my-claude-relay . \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=claude-relay.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

## Configuration

### Required Configuration

Before deploying, you must configure the following required parameters:

```yaml
config:
  # Security configuration (REQUIRED)
  jwtSecret: "your-jwt-secret-here"
  encryptionKey: "your-encryption-key-here"
  
  # Admin credentials (OPTIONAL but recommended)
  adminUsername: "admin"
  adminPassword: "your-admin-password"
```

### Redis Configuration

#### Internal Redis (Default)

```yaml
redis:
  enabled: true
  auth:
    enabled: true
    password: "redis-password"
  persistence:
    enabled: true
    size: 8Gi
  resources:
    limits:
      cpu: 250m
      memory: 256Mi
    requests:
      cpu: 100m
      memory: 128Mi
```

#### External Redis

```yaml
redis:
  enabled: false

externalRedis:
  host: "redis.example.com"
  port: 6379
  password: "your-redis-password"
  database: 0
  tls: false
```

### Ingress Configuration

```yaml
ingress:
  enabled: true
  className: "nginx"
  annotations:
    kubernetes.io/tls-acme: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: claude-relay.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: claude-relay-tls
      hosts:
        - claude-relay.example.com
```

### Monitoring Configuration

```yaml
serviceMonitor:
  enabled: true
  namespace: "monitoring"
  labels:
    release: prometheus
  interval: 30s
  scrapeTimeout: 10s
```

### Sidecar Log Aggregation

Enable sidecar container for log aggregation to eliminate the need for persistent volumes for logs:

```yaml
sidecar:
  enabled: true
  image:
    repository: busybox
    tag: "1.36"
    pullPolicy: IfNotPresent
  resources:
    limits:
      cpu: 100m
      memory: 128Mi
    requests:
      cpu: 50m
      memory: 64Mi

# When sidecar is enabled, logs use emptyDir instead of PVC
persistence:
  enabled: true  # Still needed for data directory
  size: 1Gi
```

The sidecar container provides:
- **Real-time log aggregation** from multiple log files
- **Log rotation handling** with automatic detection of new files
- **Color-coded output** with log type identification
- **Zero persistent storage** requirement for logs

### Autoscaling Configuration

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | Number of replicas |
| `image.repository` | string | `"ghcr.io/your-username/claude-relay-service"` | Image repository |
| `image.pullPolicy` | string | `"IfNotPresent"` | Image pull policy |
| `image.tag` | string | `""` | Image tag (defaults to chart appVersion) |
| `service.type` | string | `"ClusterIP"` | Service type |
| `service.port` | int | `3000` | Service port |
| `ingress.enabled` | bool | `false` | Enable ingress |
| `ingress.className` | string | `""` | Ingress class name |
| `ingress.hosts` | list | `[{"host": "claude-relay.local", "paths": [{"path": "/", "pathType": "Prefix"}]}]` | Ingress hosts |
| `resources.limits.cpu` | string | `"500m"` | CPU limit |
| `resources.limits.memory` | string | `"512Mi"` | Memory limit |
| `resources.requests.cpu` | string | `"250m"` | CPU request |
| `resources.requests.memory` | string | `"256Mi"` | Memory request |
| `autoscaling.enabled` | bool | `false` | Enable horizontal pod autoscaling |
| `autoscaling.minReplicas` | int | `1` | Minimum number of replicas |
| `autoscaling.maxReplicas` | int | `100` | Maximum number of replicas |
| `redis.enabled` | bool | `true` | Enable internal Redis |
| `redis.auth.enabled` | bool | `false` | Enable Redis authentication |
| `redis.auth.password` | string | `""` | Redis password |
| `redis.persistence.enabled` | bool | `true` | Enable Redis persistence |
| `redis.persistence.size` | string | `"8Gi"` | Redis storage size |
| `externalRedis.host` | string | `""` | External Redis host |
| `externalRedis.port` | int | `6379` | External Redis port |
| `externalRedis.password` | string | `""` | External Redis password |
| `externalRedis.database` | int | `0` | External Redis database |
| `externalRedis.tls` | bool | `false` | Enable TLS for external Redis |
| `config.jwtSecret` | string | `""` | JWT secret (required) |
| `config.encryptionKey` | string | `""` | Encryption key (required) |
| `config.adminUsername` | string | `""` | Admin username |
| `config.adminPassword` | string | `""` | Admin password |
| `config.claudeApiUrl` | string | `"https://api.anthropic.com/v1/messages"` | Claude API URL |
| `config.logLevel` | string | `"info"` | Log level |
| `serviceMonitor.enabled` | bool | `false` | Enable ServiceMonitor for Prometheus |
| `persistence.enabled` | bool | `true` | Enable persistent storage |
| `persistence.size` | string | `"1Gi"` | Storage size |

## Examples

### Basic Installation

```bash
helm install claude-relay ./charts/claude-relay \
  --set config.jwtSecret="$(openssl rand -base64 32)" \
  --set config.encryptionKey="$(openssl rand -base64 32)" \
  --set config.adminUsername="admin" \
  --set config.adminPassword="secure-password"
```

### Production Installation with External Redis

```bash
helm install claude-relay ./charts/claude-relay \
  --set config.jwtSecret="your-jwt-secret" \
  --set config.encryptionKey="your-encryption-key" \
  --set config.adminUsername="admin" \
  --set config.adminPassword="secure-password" \
  --set redis.enabled=false \
  --set externalRedis.host="redis.production.com" \
  --set externalRedis.password="redis-password" \
  --set externalRedis.tls=true \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host="claude-relay.production.com" \
  --set autoscaling.enabled=true \
  --set autoscaling.minReplicas=3 \
  --set autoscaling.maxReplicas=20 \
  --set serviceMonitor.enabled=true
```

### Development Installation

```bash
helm install claude-relay-dev ./charts/claude-relay \
  --set config.jwtSecret="dev-jwt-secret" \
  --set config.encryptionKey="dev-encryption-key" \
  --set config.nodeEnv="development" \
  --set config.debug=true \
  --set resources.requests.cpu="100m" \
  --set resources.requests.memory="128Mi" \
  --set redis.persistence.size="1Gi"
```

### Installation with Sidecar Log Aggregation

```bash
helm install claude-relay ./charts/claude-relay \
  --set config.jwtSecret="$(openssl rand -base64 32)" \
  --set config.encryptionKey="$(openssl rand -base64 32)" \
  --set config.adminUsername="admin" \
  --set config.adminPassword="secure-password" \
  --set sidecar.enabled=true \
  --set persistence.enabled=true
```

Or using the provided values file:

```bash
helm install claude-relay ./charts/claude-relay -f values-sidecar.yaml
```

## Upgrading

```bash
# Upgrade to a new version
helm upgrade claude-relay ./charts/claude-relay

# Upgrade with new values
helm upgrade claude-relay ./charts/claude-relay -f new-values.yaml
```

## Uninstalling

```bash
# Uninstall the release
helm uninstall claude-relay

# Uninstall and delete PVCs (if needed)
kubectl delete pvc -l app.kubernetes.io/instance=claude-relay
```

## Troubleshooting

### Common Issues

1. **Pod fails to start with authentication errors**
   - Ensure `config.jwtSecret` and `config.encryptionKey` are set
   - Check if Redis is accessible

2. **Redis connection issues**
   - Verify Redis configuration in values.yaml
   - Check Redis pod logs: `kubectl logs -l app.kubernetes.io/name=redis`

3. **Ingress not working**
   - Ensure ingress controller is installed
   - Check ingress annotations and TLS configuration

### Debugging

```bash
# Check pod status
kubectl get pods -l app.kubernetes.io/name=claude-relay

# View pod logs
kubectl logs -l app.kubernetes.io/name=claude-relay

# Check configuration
kubectl get configmap claude-relay-config -o yaml

# Check secrets
kubectl get secret claude-relay-secret -o yaml
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## Support

- 📧 Email: support@claude-relay.com
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/claude-relay-service/issues)
- 📖 Documentation: [Project Wiki](https://github.com/your-username/claude-relay-service/wiki)