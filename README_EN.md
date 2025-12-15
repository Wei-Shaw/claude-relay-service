# Claude Relay Service

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**🔐 Self-hosted Claude API relay service with multi-account management** 

[中文文档](README.md) • [Preview](https://demo.pincc.ai/admin-next/login) • [Telegram Channel](https://t.me/claude_relay_service)

</div>

---

## ⭐ If You Find It Useful, Please Give It a Star!

> Open source is not easy, your Star is my motivation to continue updating 🚀  
> Join [Telegram Channel](https://t.me/claude_relay_service) for the latest updates

---

## ⚠️ Important Notice

**Please read carefully before using this project:**

🚨 **Terms of Service Risk**: Using this project may violate Anthropic's terms of service. Please carefully read Anthropic's user agreement before use. All risks from using this project are borne by the user.

📖 **Disclaimer**: This project is for technical learning and research purposes only. The author is not responsible for any account bans, service interruptions, or other losses caused by using this project.

## 🤔 Is This Project Right for You?

- 🌍 **Regional Restrictions**: Can't directly access Claude Code service in your region?
- 🔒 **Privacy Concerns**: Worried about third-party mirror services logging or leaking your conversation content?
- 👥 **Cost Sharing**: Want to share Claude Code Max subscription costs with friends?
- ⚡ **Stability Issues**: Third-party mirror sites often fail and are unstable, affecting efficiency?

If you have any of these concerns, this project might be suitable for you.

### Suitable Scenarios

✅ **Cost Sharing with Friends**: 3-5 friends sharing Claude Code Max subscription, enjoying Opus freely  
✅ **Privacy Sensitive**: Don't want third-party mirrors to see your conversation content  
✅ **Technical Tinkering**: Have basic technical skills, willing to build and maintain yourself  
✅ **Stability Needs**: Need long-term stable Claude access, don't want to be restricted by mirror sites  
✅ **Regional Restrictions**: Cannot directly access Claude official service  

### Unsuitable Scenarios

❌ **Complete Beginner**: Don't understand technology at all, don't even know how to buy a server  
❌ **Occasional Use**: Use it only a few times a month, not worth the hassle  
❌ **Registration Issues**: Cannot register Claude account yourself  
❌ **Payment Issues**: No payment method to subscribe to Claude Code  

**If you're just an ordinary user with low privacy requirements, just want to casually play around and quickly experience Claude, then choosing a mirror site you're familiar with would be more suitable.**

---

## 💭 Why Build Your Own?

### Potential Issues with Existing Mirror Sites

- 🕵️ **Privacy Risk**: Your conversation content is completely visible to others, forget about business secrets
- 🐌 **Performance Instability**: Slow when many people use it, often crashes during peak hours
- 💰 **Price Opacity**: Don't know the actual costs

### Benefits of Self-hosting

- 🔐 **Data Security**: All API requests only go through your own server, direct connection to Anthropic API
- ⚡ **Controllable Performance**: Only a few of you using it, Max $200 package basically allows you to enjoy Opus freely
- 💰 **Cost Transparency**: Clear view of how many tokens used, specific costs calculated at official prices
- 📊 **Complete Monitoring**: Usage statistics, cost analysis, performance monitoring all available

---

## 🚀 Core Features

> 📸 **[Click to view interface preview](docs/preview.md)** - See detailed screenshots of the Web management interface

### Basic Features
- ✅ **Multi-platform Account Management**: Support Claude (Official/Console), Gemini, OpenAI, AWS Bedrock, Azure OpenAI, Droid, CCR and other account types
- ✅ **Custom API Keys**: Assign independent keys with fine-grained permission control
- ✅ **Usage Statistics**: Detailed token usage records with real-time cost calculation
- ✅ **User Management System**: Support user registration, login, LDAP/AD integration
- ✅ **Account Grouping**: Support account grouping and priority scheduling

### Advanced Features
- 🔄 **Smart Scheduling**: Unified scheduler for cross-platform intelligent account selection and failover
- 🔗 **Sticky Sessions**: Same session always uses same account, with auto-renewal support
- 🚀 **Performance Optimization**: Connection pooling, multi-layer caching, concurrency control
- 📊 **Monitoring Dashboard**: Web interface for all data, real-time metrics, cache monitoring
- 🛡️ **Security Control**: Access restrictions, rate limiting, client restrictions, model blacklist
- 🌐 **Proxy Support**: HTTP/SOCKS5 proxy with per-account configuration
- 🔔 **Webhook Notifications**: Event notification and webhook configuration management
- ⚡ **Concurrent Queueing**: Smart queueing when API key concurrency limit exceeded, avoiding 429 errors

---

## 📋 Deployment Requirements

### Hardware Requirements (Minimum Configuration)
- **CPU**: 1 core is sufficient
- **Memory**: 512MB (1GB recommended)
- **Storage**: 30GB available space
- **Network**: Access to Anthropic API (recommend US region servers)
- **Recommendation**: 2 cores 4GB is basically enough, choose network with good return routes to your country (to improve speed, recommend not using proxy or setting server IP for direct connection)

### Software Requirements
- **Node.js** 18 or higher
- **Redis** 6 or higher
- **Operating System**: Linux recommended

### Cost Estimation
- **Server**: Light cloud server, $5-10 per month
- **Claude Subscription**: Depends on how you share costs
- **Others**: Domain name (optional)

---

## 📦 Manual Deployment

### Step 1: Environment Setup

**Ubuntu/Debian users:**
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**CentOS/RHEL users:**
```bash
# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Redis
sudo yum install redis
sudo systemctl start redis
```

### Step 2: Download and Configure

```bash
# Download project
git clone https://github.com/Wei-Shaw/claude-relay-service.git
cd claude-relay-service

# Install dependencies
npm install

# Copy configuration files (Important!)
cp config/config.example.js config/config.js
cp .env.example .env
```

### Step 3: Configuration File Setup

**Edit `.env` file:**
```bash
# Generate these two keys randomly, but remember them
JWT_SECRET=your-super-secret-key
ENCRYPTION_KEY=32-character-encryption-key-write-randomly

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Edit `config/config.js` file:**
```javascript
module.exports = {
  server: {
    port: 3000,          // Service port, can be changed
    host: '0.0.0.0'     // Don't change
  },
  redis: {
    host: '127.0.0.1',  // Redis address
    port: 6379          // Redis port
  },
  // Keep other configurations as default
}
```

### Step 4: Start Service

```bash
# Initialize
npm run setup # Will randomly generate admin account password info, stored in data/init.json

# Start service
npm run service:start:daemon   # Run in background (recommended)

# Check status
npm run service:status
```

---

## 🎮 Getting Started

### 1. Open Management Interface

Browser visit: `http://your-server-IP:3000/web`

Default admin account: Look in data/init.json

### 2. Add Accounts

The system supports multiple account types, add as needed:

#### Claude Accounts (Official/Console)

OAuth authorization method:

1. In account management page, click "Add Account"
2. Select account type (Claude Official or Claude Console)
3. If worried about multiple accounts sharing IP getting banned, you can set independent proxy (optional)
4. Click "Generate Authorization Link", complete Claude login and authorization in new page
5. Copy the returned Authorization Code and paste to input box to complete addition

#### Other Account Types

- **Gemini Account**: Support Google OAuth authorization or API Key method
- **OpenAI Responses (Codex)**: Enter OpenAI API Key
- **AWS Bedrock**: Configure AWS credentials (Access Key, Secret Key, Region)
- **Azure OpenAI**: Configure Azure endpoint and API Key
- **Droid (Factory.ai)**: Enter Droid API Key
- **CCR Account**: Configure CCR credentials

**Notes**:
- For OAuth authorization, VPN may be required if in China
- Each account supports independent proxy configuration
- You can set groups and priorities for accounts

### 3. Create API Key

Assign a key to each user:

1. Click "API Keys" tab
2. Click "Create New Key"
3. Give the key a name, like "User A's Key"
4. Set usage limits and permissions (optional):
   - **Permission Control**: Select accessible service types (All/Claude Only/Gemini Only/OpenAI Only, etc.)
   - **Rate Limiting**: Limit requests and token usage per time window
   - **Concurrency Limit**: Limit number of simultaneous requests
   - **Concurrent Queueing**: When enabled, exceeded requests queue instead of returning 429 error
   - **Client Restrictions**: Restrict to specific clients (like ClaudeCode, Gemini-CLI, etc.)
   - **Model Blacklist**: Prohibit access to specific models
   - **Account Group Binding**: Bind to specific account groups
5. Save, note down the generated key

### 4. Start Using Claude Code and Gemini CLI

Now you can replace the official API with your own service:

**Claude Code Set Environment Variables:**

Default uses standard Claude account pool:

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/api/" # Fill in your server's IP address or domain
export ANTHROPIC_AUTH_TOKEN="API key created in the backend"
```

**VSCode Claude Plugin Configuration:**

If using VSCode Claude plugin, configure in `~/.claude/config.json`:

```json
{
    "primaryApiKey": "crs"
}
```

If the file doesn't exist, create it manually. Windows users path is `C:\Users\YourUsername\.claude\config.json`.

**Gemini CLI Set Environment Variables:**

**Method 1 (Recommended): Via Gemini Assist API**

Each account enjoys 1000 requests per day, 60 requests per minute free quota.

```bash
CODE_ASSIST_ENDPOINT="http://127.0.0.1:3000/gemini"  # Fill in your server's IP address or domain
GOOGLE_CLOUD_ACCESS_TOKEN="API key created in the backend"
GOOGLE_GENAI_USE_GCA="true"
GEMINI_MODEL="gemini-2.5-pro"
```

> **Note**: gemini-cli console will show `Failed to fetch user info: 401 Unauthorized`, but this doesn't affect usage.

**Method 2: Via Gemini API**

Very limited free quota, easily triggers 429 errors.

```bash
GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:3000/gemini"  # Fill in your server's IP address or domain
GEMINI_API_KEY="API key created in the backend"
GEMINI_MODEL="gemini-2.5-pro"
```

**Use Claude Code:**

```bash
claude
```

**Use Gemini CLI:**

```bash
gemini
```

---

## 🔧 Daily Maintenance

### Service Management

```bash
# Check service status
npm run service:status

# View logs
npm run service:logs

# Restart service
npm run service:restart:daemon

# Stop service
npm run service:stop
```

### Monitor Usage

- **Web Interface**: `http://your-domain:3000/web` - View usage statistics
- **Health Check**: `http://your-domain:3000/health` - Confirm service is normal
- **Log Files**: Various log files in `logs/` directory

### Upgrade Guide

When a new version is released, follow these steps to upgrade the service:

```bash
# 1. Navigate to project directory
cd claude-relay-service

# 2. Pull latest code
git pull origin main

# If you encounter package-lock.json conflicts, use the remote version
git checkout --theirs package-lock.json
git add package-lock.json

# 3. Install new dependencies (if any)
npm install

# 4. Restart service
npm run service:restart:daemon

# 5. Check service status
npm run service:status
```

**Important Notes:**
- Before upgrading, it's recommended to backup important configuration files (.env, config/config.js)
- Check the changelog to understand if there are any breaking changes
- Database structure changes will be migrated automatically if needed

### Common Issue Resolution

**Can't connect to Redis?**
```bash
# Check if Redis is running
redis-cli ping

# Should return PONG
```

**OAuth authorization failed?**
- Check if proxy settings are correct
- Ensure normal access to claude.ai
- Clear browser cache and retry

**API request failed?**
- Check if API Key is correct
- View log files for error information
- Confirm Claude account status is normal

---

## ⚙️ Important Environment Variables

### User Management and Authentication

- `USER_MANAGEMENT_ENABLED`: Enable user management system (default false)
- `LDAP_ENABLED`: Enable LDAP authentication (default false)
- `LDAP_URL`: LDAP server address (e.g., ldaps://ldap.example.com:636)
- `LDAP_TLS_REJECT_UNAUTHORIZED`: LDAP certificate verification (default true, set to false for self-signed certificates)
- `MAX_API_KEYS_PER_USER`: Maximum API keys per user (default 1)
- `ALLOW_USER_DELETE_API_KEYS`: Allow users to delete their own API keys (default false)

### Session and Scheduling

- `STICKY_SESSION_TTL_HOURS`: Sticky session TTL in hours (default 1)
- `STICKY_SESSION_RENEWAL_THRESHOLD_MINUTES`: Sticky session renewal threshold in minutes (default 0)
- `USER_MESSAGE_QUEUE_ENABLED`: Enable user message serial queue (default false)
- `CLAUDE_OVERLOAD_HANDLING_MINUTES`: Claude 529 error handling duration in minutes (0 to disable)

### Webhook and Notifications

- `WEBHOOK_ENABLED`: Enable webhook notifications (default true)
- `WEBHOOK_URLS`: Webhook notification URL list (comma-separated)

### Performance and Monitoring

- `METRICS_WINDOW`: Real-time metrics statistics window in minutes (1-60, default 5)
- `REQUEST_TIMEOUT`: Request timeout in milliseconds (default 600000, i.e., 10 minutes)
- `DEBUG_HTTP_TRAFFIC`: Enable HTTP request/response debug logs (default false, dev only)
- `CLEAR_CONCURRENCY_QUEUES_ON_STARTUP`: Clear residual concurrency queue counters on startup (default true, set to false for multi-instance deployments)

### Proxy Configuration

- `PROXY_USE_IPV4`: Use IPv4 for proxy (default true, better compatibility)
- `DEFAULT_PROXY_TIMEOUT`: Proxy timeout in milliseconds (default 600000)
- `MAX_PROXY_RETRIES`: Maximum proxy retries (default 3)

For complete environment variable list, refer to `.env.example` file.

---

## 🛠️ Advanced Usage

### Reverse Proxy Deployment Guide

For production environments, it is recommended to use a reverse proxy for automatic HTTPS, security headers, and performance optimization. Two common solutions are provided below: **Caddy** and **Nginx Proxy Manager (NPM)**.

---

## Caddy Solution

Caddy is a web server that automatically manages HTTPS certificates, with simple configuration and excellent performance, ideal for deployments without Docker environments.

**1. Install Caddy**

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# CentOS/RHEL/Fedora
sudo yum install yum-plugin-copr
sudo yum copr enable @caddy/caddy
sudo yum install caddy
```

**2. Caddy Configuration**

Edit `/etc/caddy/Caddyfile`:

```caddy
your-domain.com {
    # Reverse proxy to local service
    reverse_proxy 127.0.0.1:3000 {
        # Support streaming responses or SSE
        flush_interval -1

        # Pass real IP
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # Long read/write timeout configuration
        transport http {
            read_timeout 300s
            write_timeout 300s
            dial_timeout 30s
        }
    }

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        -Server
    }
}
```

**3. Start Caddy**

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl start caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

**4. Service Configuration**

Since Caddy automatically manages HTTPS, you can restrict the service to listen locally only:

```javascript
// config/config.js
module.exports = {
  server: {
    port: 3000,
    host: '127.0.0.1' // Listen locally only
  }
}
```

**Caddy Features**

* 🔒 Automatic HTTPS with zero-configuration certificate management
* 🛡️ Secure default configuration with modern TLS suites
* ⚡ HTTP/2 and streaming support
* 🔧 Concise configuration files, easy to maintain

---

## Nginx Proxy Manager (NPM) Solution

Nginx Proxy Manager manages reverse proxies and HTTPS certificates through a graphical interface, deployed as a Docker container.

**1. Create a New Proxy Host in NPM**

Configure the Details as follows:

| Item                  | Setting                  |
| --------------------- | ------------------------ |
| Domain Names          | relay.example.com        |
| Scheme                | http                     |
| Forward Hostname / IP | 192.168.0.1 (docker host IP) |
| Forward Port          | 3000                     |
| Block Common Exploits | ☑️                       |
| Websockets Support    | ❌ **Disable**            |
| Cache Assets          | ❌ **Disable**            |
| Access List           | Publicly Accessible      |

> Note:
> - Ensure Claude Relay Service **listens on `0.0.0.0`, container IP, or host IP** to allow NPM internal network connections.
> - **Websockets Support and Cache Assets must be disabled**, otherwise SSE / streaming responses will fail.

**2. Custom locations**

No content needed, keep it empty.

**3. SSL Settings**

* **SSL Certificate**: Request a new SSL Certificate (Let's Encrypt) or existing certificate
* ☑️ **Force SSL**
* ☑️ **HTTP/2 Support**
* ☑️ **HSTS Enabled**
* ☑️ **HSTS Subdomains**

**4. Advanced Configuration**

Add the following to Custom Nginx Configuration:

```nginx
# Pass real user IP
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# Support WebSocket / SSE streaming
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;

# Long connection / timeout settings (for AI chat streaming)
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 30s;

# ---- Security Settings ----
# Strict HTTPS policy (HSTS)
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# Block clickjacking and content sniffing
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;

# Referrer / Permissions restriction policies
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# Hide server information (equivalent to Caddy's `-Server`)
proxy_hide_header Server;

# ---- Performance Tuning ----
# Disable proxy caching for real-time responses (SSE / Streaming)
proxy_cache_bypass $http_upgrade;
proxy_no_cache $http_upgrade;
proxy_request_buffering off;
```

**5. Launch and Verify**

* After saving, wait for NPM to automatically request Let's Encrypt certificate (if applicable).
* Check Proxy Host status in Dashboard to ensure it shows "Online".
* Visit `https://relay.example.com`, if the green lock icon appears, HTTPS is working properly.

**NPM Features**

* 🔒 Automatic certificate application and renewal
* 🔧 Graphical interface for easy multi-service management
* ⚡ Native HTTP/2 / HTTPS support
* 🚀 Ideal for Docker container deployments

---

Both solutions are suitable for production deployment. If you use a Docker environment, **Nginx Proxy Manager is more convenient**; if you want to keep software lightweight and automated, **Caddy is a better choice**.

---

## 💡 Usage Recommendations

### Account Management
- **Regular Checks**: Check account status weekly, handle exceptions promptly
- **Reasonable Allocation**: Can assign different API keys to different people, analyze usage based on different API keys

### Security Recommendations
- **Use HTTPS**: Strongly recommend using Caddy reverse proxy (automatic HTTPS) to ensure secure data transmission
- **Regular Backups**: Back up important configurations and data
- **Monitor Logs**: Regularly check exception logs
- **Update Keys**: Regularly change JWT and encryption keys
- **Firewall Settings**: Only open necessary ports (80, 443), hide direct service ports

---

## 🆘 What to Do When You Encounter Problems?

### Self-troubleshooting
1. **Check Logs**: Log files in `logs/` directory
2. **Check Configuration**: Confirm configuration files are set correctly
3. **Test Connectivity**: Use curl to test if API is normal
4. **Restart Service**: Sometimes restarting fixes it

### Seeking Help
- **GitHub Issues**: Submit detailed error information
- **Read Documentation**: Carefully read error messages and documentation
- **Community Discussion**: See if others have encountered similar problems

---

## 📄 License
This project uses the [MIT License](LICENSE).

---

<div align="center">

**⭐ If you find it useful, please give it a Star, this is the greatest encouragement to the author!**

**🤝 Feel free to submit Issues for problems, welcome PRs for improvement suggestions**

</div>