---
autor: Claude Renard
cargo: Líder de Desarrollo / Tech Lead
fecha: 2026-04-24
tema: Runbook nginx — DNS resilience y auto-recovery
estado: aprobado
---

# Runbook: nginx en producción (resilience)

## Contexto del incidente original

**Fecha:** 2026-04-23 06:40:10 UTC
**Síntoma:** producción caída ~44h (frontend HTTP 000, conexión rechazada)
**Causa raíz:** nginx hizo reload, intentó resolver el upstream `galeria-3d-files.nyc3.cdn.digitaloceanspaces.com` (DigitalOcean Spaces CDN), DNS falló transitoriamente, nginx murió y quedó en estado `failed` sin auto-recovery.

Detectado al revisar `systemctl status nginx`:

```
× nginx.service - failed (Result: exit-code) since Thu 2026-04-23 06:40:10 UTC
nginx[152167]: [emerg] host not found in upstream "galeria-3d-files.nyc3.cdn.digitaloceanspaces.com"
```

## Defensas implementadas (2026-04-24)

### 1. Resolver DNS dinámico (causa raíz)

**Problema:** nginx por defecto resuelve hostnames de `proxy_pass` UNA VEZ al cargar la config. Si DNS falla en ese instante, el proceso muere.

**Fix:** location `/cdn/` ahora usa regex match + variable + `resolver` directive. nginx pospone la resolución hasta runtime y mantiene cache con TTL 300s.

**Ubicación:** `/etc/nginx/sites-available/galeria` (symlinked a sites-enabled)

```nginx
location ~ ^/cdn/(.*)$ {
    resolver 8.8.8.8 1.1.1.1 valid=300s ipv6=off;
    resolver_timeout 5s;
    set $cdn_upstream "galeria-3d-files.nyc3.cdn.digitaloceanspaces.com";
    proxy_pass https://$cdn_upstream/$1$is_args$args;
    proxy_set_header Host galeria-3d-files.nyc3.cdn.digitaloceanspaces.com;
    proxy_ssl_server_name on;
    expires 30d;
    add_header Cache-Control "public";
    add_header Access-Control-Allow-Origin "*";
}
```

**Validación:**
```bash
ssh root@159.203.189.167 "nginx -t && systemctl reload nginx"
curl -I https://ceopacademia.org/cdn/models/<algun-modelo>.glb  # debe responder 200
```

### 2. Auto-recovery via systemd (defensa en profundidad)

**Problema:** si nginx muere por cualquier razón (config, kernel, OOM), por defecto NO se reinicia.

**Fix:** override systemd con `Restart=on-failure` + `StartLimitBurst` para evitar loops infinitos si la config queda permanentemente rota.

**Ubicación:** `/etc/systemd/system/nginx.service.d/override.conf`

```ini
[Service]
Restart=on-failure
RestartSec=10s
StartLimitBurst=5
StartLimitIntervalSec=300
```

**Aplicar:**
```bash
ssh root@159.203.189.167 "systemctl daemon-reload"
```

**Test que pasa:**
```bash
ssh root@159.203.189.167 "kill -9 \$(systemctl show nginx -p MainPID --value)"
sleep 12
ssh root@159.203.189.167 "systemctl is-active nginx"   # → active
```
nginx muere, systemd lo levanta en ~10s.

## Diagnóstico rápido si la página se cae de nuevo

1. **DNS desde tu máquina:**
   ```bash
   nslookup ceopacademia.org 8.8.8.8
   ```
   Debe resolver a `159.203.189.167`. Si no, problema DNS upstream.

2. **Estado nginx:**
   ```bash
   ssh root@159.203.189.167 "systemctl status nginx --no-pager -l | head -30"
   ```
   - `active (running)` → nginx OK, problema en otra capa
   - `failed` → ver logs: `journalctl -u nginx -n 50 --no-pager`

3. **Validar config sin aplicar:**
   ```bash
   ssh root@159.203.189.167 "nginx -t"
   ```

4. **Estado pm2 (backend):**
   ```bash
   ssh root@159.203.189.167 "pm2 status && pm2 logs galeria-api --lines 30 --nostream"
   ```

5. **Restaurar nginx desde backup si la config está rota:**
   ```bash
   ssh root@159.203.189.167 "ls /root/galeria.nginx.backup-* | tail -1"
   # Copiar el backup más reciente:
   ssh root@159.203.189.167 "cp /root/galeria.nginx.backup-<timestamp> /etc/nginx/sites-available/galeria && nginx -t && systemctl reload nginx"
   ```

## Backups conocidos

- `/root/galeria.nginx.backup-20260424-215636` — config previa al fix DNS resilience (sin resolver dinámico, sin auto-recovery)

## Smoke test de salud completo

```bash
curl -s -o /dev/null -w "Frontend: HTTP %{http_code}\n" https://ceopacademia.org/
curl -s https://ceopacademia.org/api/health
curl -s -o /dev/null -w "CDN:      HTTP %{http_code}\n" "https://ceopacademia.org/cdn/models/<un-modelo-real>.glb"
```

Los tres deben dar 200 + body `{"status":"ok","db":"connected"}`.
