# Pilot Production Deployment with Real Domain (AWS EC2)

## Scope
This is for controlled pilot production (design partners / early MSPs), not broad public scale.

## Reference architecture
- 1x EC2 instance hosts:
  - Web (`@cspm/web`)
  - API (`@cspm/api`)
  - Worker (`@cspm/worker`)
- Nginx reverse proxy + TLS (Let’s Encrypt)
- Docker scanner runtime for Prowler/Kubescape
- Domain points to EC2 public IP

## 1) Provision EC2
Recommended starter:
- `t3.large` (or `t3.xlarge` if scan volume grows)
- 80–120GB gp3
- Ubuntu 22.04 LTS

Security Group:
- 22/tcp from your admin IP only
- 80/tcp public
- 443/tcp public
- keep app ports private (localhost only)

## 2) Install dependencies
```bash
sudo apt update
sudo apt install -y git curl jq nginx docker.io
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo usermod -aG docker $USER
newgrp docker
```

## 3) Pull project and configure
```bash
git clone https://github.com/macminitm/cloud-security-posture-management.git
cd cloud-security-posture-management
cp .env.example .env
```

Set production values in `.env`:
- `NODE_ENV=production`
- strong `JWT_SECRET`
- `SCANNER_RUNTIME=docker`
- pinned scanner images
- production DB config

## 4) Build + migrate + scanner readiness
```bash
npm install
npm run db:generate
npm run db:migrate:deploy
npm run scanners:prewarm
npm run scanners:preflight
npm run build
```

## 5) Run services (systemd recommended)
Use included unit files in:
- `deploy/systemd/cspm-api.service`
- `deploy/systemd/cspm-worker.service`
- `deploy/systemd/cspm-web.service`
- install guide: `deploy/systemd/README.md`

### Manual foreground test (optional)
```bash
npm run start -w @cspm/api
npm run start -w @cspm/worker
npm run start -w @cspm/web
```

## 6) Domain and TLS
1. Add DNS A record:
   - `app.yourdomain.com` -> EC2 public IP
2. Configure Nginx reverse proxy to local app ports.
3. Issue cert with certbot:
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d app.yourdomain.com
```

## 7) Nginx example
```nginx
server {
  listen 80;
  server_name app.yourdomain.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location /api/ {
    proxy_pass http://127.0.0.1:4000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

## 8) Go-live checklist
- [ ] API `/health` and `/ready` pass
- [ ] Worker `/health` passes
- [ ] Settings scanner preflight passes
- [ ] First super admin login works
- [ ] MSP creation works
- [ ] Sub-customer creation + scope switch works
- [ ] AWS test connection + first scan works

## 9) Pilot ops baseline
- Daily DB backups
- Log rotation
- Service restart policy enabled
- Basic uptime alerting on web/api/worker

## 10) Notes on maturity
Good for pilot production. For full-scale production, next hardening should include:
- managed Postgres + tested restore drills
- centralized metrics/logging
- stricter secret management with external KMS/secret manager
- SSO/MFA roadmap
