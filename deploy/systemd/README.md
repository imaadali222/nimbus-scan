# systemd Units (EC2)

These unit files run API, worker, and web as persistent services.

## Assumptions
- App path: `/home/ubuntu/cloud-security-posture-management`
- Service user: `ubuntu`
- `.env` exists at repo root
- Build artifacts exist (`npm run build` completed)

## Install
```bash
cd /home/ubuntu/cloud-security-posture-management
sudo cp deploy/systemd/cspm-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cspm-api cspm-worker cspm-web
sudo systemctl start cspm-api cspm-worker cspm-web
```

## Verify
```bash
sudo systemctl status cspm-api --no-pager
sudo systemctl status cspm-worker --no-pager
sudo systemctl status cspm-web --no-pager
```

## Logs
```bash
journalctl -u cspm-api -f
journalctl -u cspm-worker -f
journalctl -u cspm-web -f
```

## Restart after deploy
```bash
cd /home/ubuntu/cloud-security-posture-management
git pull
npm install
npm run db:migrate:deploy
npm run scanners:prewarm
npm run scanners:preflight
npm run build
sudo systemctl restart cspm-api cspm-worker cspm-web
```
