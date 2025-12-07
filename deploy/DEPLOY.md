# VTT Remote - Deployment Guide

## Quick Start (Docker)

```bash
cd deploy
docker compose up -d
```

The relay will be available at `http://your-server:8181`

## Production with SSL (Docker + Traefik)

1. Copy and edit environment file:
   ```bash
   cp .env.example .env
   # Edit VTT_DOMAIN and ACME_EMAIL
   ```

2. Start with Traefik profile:
   ```bash
   docker compose --profile traefik up -d
   ```

3. Point your domain's DNS to the server

The relay will be available at `https://your-domain.com`

## Production with nginx

1. Build the server:
   ```bash
   cd server
   go build -o vtt-relay .
   ```

2. Install files:
   ```bash
   sudo mkdir -p /opt/vtt-remote
   sudo cp vtt-relay /opt/vtt-remote/
   sudo cp -r ../client /opt/vtt-remote/
   ```

3. Create service user:
   ```bash
   sudo useradd -r -s /bin/false vttremote
   sudo chown -R vttremote:vttremote /opt/vtt-remote
   ```

4. Install systemd service:
   ```bash
   sudo cp vtt-remote.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now vtt-remote
   ```

5. Configure nginx:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/vtt-remote
   # Edit server_name and SSL paths
   sudo ln -s /etc/nginx/sites-available/vtt-remote /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```

6. Get SSL certificate:
   ```bash
   sudo certbot --nginx -d vtt-remote.example.com
   ```

## Foundry Configuration

In Foundry, set the relay URL in module settings:
- **With SSL:** `wss://vtt-remote.example.com/ws`
- **Without SSL:** `ws://your-server:8181/ws`

## Firewall

Open required ports:
```bash
# With nginx (recommended)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Direct access (no nginx)
sudo ufw allow 8181/tcp
```

## Health Check

```bash
curl http://localhost:8181/health
```

## Logs

```bash
# Docker
docker logs vtt-relay

# systemd
journalctl -u vtt-remote -f
```
