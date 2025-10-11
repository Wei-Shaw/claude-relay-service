# Claude Relay Service Helm Chart

用于在 Kubernetes 上部署 Claude Relay Service 的 Helm Chart。该服务提供多账户 Claude API 中继，具有负载均衡、速率限制和全面监控等高级功能。

## 功能特性

- 🚀 **多账户 Claude API 中继**，具有智能负载均衡
- 🔒 **安全认证**，支持 JWT 令牌和 API 密钥管理
- 📊 **内置监控**，支持 Prometheus 指标和 ServiceMonitor
- 🗄️ **Redis 集成**，支持内部和外部 Redis
- 🌐 **Ingress 支持**，可自定义路由和 TLS
- 📈 **水平 Pod 自动扩缩容**，实现自动伸缩
- 💾 **持久化存储**，确保数据保留
- 🔧 **高度可配置**，提供全面的 values.yaml 配置

## 前置要求

- Kubernetes 1.19+
- Helm 3.2.0+
- 底层基础设施支持 PV 供应商（如果启用持久化）

## 安装

### 添加 Helm 仓库

```bash
# 如果您有 Helm 仓库
helm repo add claude-relay https://your-helm-repo.com
helm repo update
```

### 从本地 Chart 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/claude-relay-service.git
cd claude-relay-service/charts/claude-relay

# 使用默认值安装
helm install my-claude-relay .

# 使用自定义值安装
helm install my-claude-relay . -f my-values.yaml
```

### 使用自定义配置安装

```bash
# 使用外部 Redis 安装
helm install my-claude-relay . \
  --set redis.enabled=false \
  --set externalRedis.host=my-redis.example.com \
  --set externalRedis.password=mypassword

# 启用 ingress 安装
helm install my-claude-relay . \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=claude-relay.example.com \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix
```

## 配置

### 必需配置

在部署之前，您必须配置以下必需参数：

```yaml
config:
  # 安全配置（必需）
  jwtSecret: "your-jwt-secret-here"
  encryptionKey: "your-encryption-key-here"
  
  # 管理员凭据（可选但推荐）
  adminUsername: "admin"
  adminPassword: "your-admin-password"
```

### Redis 配置

#### 内部 Redis（默认）

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

#### 外部 Redis

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

### Ingress 配置

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

### 监控配置

```yaml
serviceMonitor:
  enabled: true
  namespace: "monitoring"
  labels:
    release: prometheus
  interval: 30s
  scrapeTimeout: 10s
```

### 自动扩缩容配置

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

## 配置值

| 键 | 类型 | 默认值 | 描述 |
|-----|------|---------|-------------|
| `replicaCount` | int | `1` | 副本数量 |
| `image.repository` | string | `"ghcr.io/your-username/claude-relay-service"` | 镜像仓库 |
| `image.pullPolicy` | string | `"IfNotPresent"` | 镜像拉取策略 |
| `image.tag` | string | `""` | 镜像标签（默认为 chart appVersion） |
| `service.type` | string | `"ClusterIP"` | 服务类型 |
| `service.port` | int | `3000` | 服务端口 |
| `ingress.enabled` | bool | `false` | 启用 ingress |
| `ingress.className` | string | `""` | Ingress 类名 |
| `ingress.hosts` | list | `[{"host": "claude-relay.local", "paths": [{"path": "/", "pathType": "Prefix"}]}]` | Ingress 主机 |
| `resources.limits.cpu` | string | `"500m"` | CPU 限制 |
| `resources.limits.memory` | string | `"512Mi"` | 内存限制 |
| `resources.requests.cpu` | string | `"250m"` | CPU 请求 |
| `resources.requests.memory` | string | `"256Mi"` | 内存请求 |
| `autoscaling.enabled` | bool | `false` | 启用水平 Pod 自动扩缩容 |
| `autoscaling.minReplicas` | int | `1` | 最小副本数 |
| `autoscaling.maxReplicas` | int | `100` | 最大副本数 |
| `redis.enabled` | bool | `true` | 启用内部 Redis |
| `redis.auth.enabled` | bool | `false` | 启用 Redis 认证 |
| `redis.auth.password` | string | `""` | Redis 密码 |
| `redis.persistence.enabled` | bool | `true` | 启用 Redis 持久化 |
| `redis.persistence.size` | string | `"8Gi"` | Redis 存储大小 |
| `externalRedis.host` | string | `""` | 外部 Redis 主机 |
| `externalRedis.port` | int | `6379` | 外部 Redis 端口 |
| `externalRedis.password` | string | `""` | 外部 Redis 密码 |
| `externalRedis.database` | int | `0` | 外部 Redis 数据库 |
| `externalRedis.tls` | bool | `false` | 为外部 Redis 启用 TLS |
| `config.jwtSecret` | string | `""` | JWT 密钥（必需） |
| `config.encryptionKey` | string | `""` | 加密密钥（必需） |
| `config.adminUsername` | string | `""` | 管理员用户名 |
| `config.adminPassword` | string | `""` | 管理员密码 |
| `config.claudeApiUrl` | string | `"https://api.anthropic.com/v1/messages"` | Claude API URL |
| `config.logLevel` | string | `"info"` | 日志级别 |
| `serviceMonitor.enabled` | bool | `false` | 为 Prometheus 启用 ServiceMonitor |
| `persistence.enabled` | bool | `true` | 启用持久化存储 |
| `persistence.size` | string | `"1Gi"` | 存储大小 |

## 示例

### 基础安装

```bash
helm install claude-relay ./charts/claude-relay \
  --set config.jwtSecret="$(openssl rand -base64 32)" \
  --set config.encryptionKey="$(openssl rand -base64 32)" \
  --set config.adminUsername="admin" \
  --set config.adminPassword="secure-password"
```

### 使用外部 Redis 的生产环境安装

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

### 开发环境安装

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

## 升级

```bash
# 升级到新版本
helm upgrade claude-relay ./charts/claude-relay

# 使用新值升级
helm upgrade claude-relay ./charts/claude-relay -f new-values.yaml
```

## 卸载

```bash
# 卸载发布
helm uninstall claude-relay

# 卸载并删除 PVC（如果需要）
kubectl delete pvc -l app.kubernetes.io/instance=claude-relay
```

## 故障排除

### 常见问题

1. **Pod 启动失败，出现认证错误**
   - 确保设置了 `config.jwtSecret` 和 `config.encryptionKey`
   - 检查 Redis 是否可访问

2. **Redis 连接问题**
   - 验证 values.yaml 中的 Redis 配置
   - 检查 Redis Pod 日志：`kubectl logs -l app.kubernetes.io/name=redis`

3. **Ingress 不工作**
   - 确保已安装 ingress 控制器
   - 检查 ingress 注解和 TLS 配置

### 调试

```bash
# 检查 Pod 状态
kubectl get pods -l app.kubernetes.io/name=claude-relay

# 查看 Pod 日志
kubectl logs -l app.kubernetes.io/name=claude-relay

# 检查配置
kubectl get configmap claude-relay-config -o yaml

# 检查密钥
kubectl get secret claude-relay-secret -o yaml
```

## 贡献

1. Fork 仓库
2. 创建您的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 详情请参阅 [LICENSE](../../LICENSE) 文件。

## 支持

- 📧 邮箱：support@claude-relay.com
- 🐛 问题：[GitHub Issues](https://github.com/your-username/claude-relay-service/issues)
- 📖 文档：[项目 Wiki](https://github.com/your-username/claude-relay-service/wiki)