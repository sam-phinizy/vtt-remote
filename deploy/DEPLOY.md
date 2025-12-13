# VTT Remote - Deployment Guide

## Quick Start (Docker)

```bash
cd deploy
docker compose --profile standalone up -d
```

The relay will be available at `http://localhost:80`

## With SSL (Docker + Traefik)

1. Copy and edit environment file:
   ```bash
   cp .env.example .env
   # Set VTT_DOMAIN and ACME_EMAIL
   ```

2. Start with Traefik profile:
   ```bash
   docker compose --profile traefik up -d
   ```

3. Point your domain's DNS to the server

## With nginx + systemd

1. Build the server:
   ```bash
   task build:server
   ```

2. Install files:
   ```bash
   sudo mkdir -p /opt/vtt-remote
   sudo cp server/server /opt/vtt-remote/vtt-relay
   ```

3. Create service user:
   ```bash
   sudo useradd -r -s /bin/false vttremote
   sudo chown -R vttremote:vttremote /opt/vtt-remote
   ```

4. Install systemd service:
   ```bash
   sudo cp deploy/vtt-remote.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now vtt-remote
   ```

5. Configure nginx:
   ```bash
   sudo cp deploy/nginx.conf /etc/nginx/sites-available/vtt-remote
   # Replace YOUR_DOMAIN with your actual domain
   sudo ln -s /etc/nginx/sites-available/vtt-remote /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

6. Get SSL certificate:
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

## Foundry Configuration

In Foundry, set the relay URL in module settings:
- **With SSL:** `wss://your-domain.com/ws`
- **LAN only:** `ws://server-ip:8080/ws`

## Health Check

```bash
curl http://localhost:8080/health
```

## Logs

```bash
# Docker
docker logs vtt-relay

# systemd
journalctl -u vtt-remote -f
```
