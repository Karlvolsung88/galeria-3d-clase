# Deploy — Galería 3D

> Última actualización: 2026-04-13

## Infraestructura

| Servicio | Proveedor | Detalle |
|----------|-----------|---------|
| **Droplet** | DigitalOcean | Ubuntu 24.04, 1 vCPU, 1GB RAM |
| **IP** | `159.203.189.167` |
| **Spaces** | DigitalOcean | Bucket `galeria-3d-files`, región `nyc3` |
| **CDN** | `galeria-3d-files.nyc3.cdn.digitaloceanspaces.com` |
| **Dominio** | `ceopacademia.org` (Hostinger → NS de DigitalOcean) |
| **SSL** | Let's Encrypt, auto-renovación (expira 2026-07-12) |

## Credenciales del Droplet

### SSH
```
Host: 159.203.189.167
User: root
Auth: SSH key (PC del profesor ya autorizado)
```

### PostgreSQL
```
Host: 127.0.0.1
Port: 5432
Database: galeria_3d
User: galeria
Password: G4l3r1a2026!$DO
```

### JWT
```
Secret: g4l3r1a-3d-jwt-s3cr3t-2026-d0-pr0d
Expira: 7 días
```

### DigitalOcean Spaces
```
Bucket: galeria-3d-files
Region: nyc3
Endpoint: https://nyc3.digitaloceanspaces.com
CDN: https://galeria-3d-files.nyc3.cdn.digitaloceanspaces.com
Access Key: DO8013L487N2AL3FB4ND
Secret Key: /OuRpuWy290o9s3ldGaZLZP2PGgMh+0gutpdqsyyI7I
```

### Admin de la galería
```
Email: calmeydar@unbosque.edu.co
Password: *Samick88
Role: admin
```

## Estructura en el Droplet

```
/var/www/galeria-frontend/     ← Build estático (dist/)
/var/www/galeria-api/          ← Express API (server.js)
  ├── server.js
  ├── .env
  ├── package.json
  └── node_modules/
/etc/nginx/sites-available/galeria  ← Config Nginx
```

## Servicios

| Servicio | Gestión | Puerto |
|----------|---------|--------|
| **Nginx** | `systemctl restart nginx` | 80/443 |
| **API** | `pm2 restart galeria-api` | 3000 |
| **PostgreSQL** | `systemctl restart postgresql` | 5432 |

## Deploy del Frontend

```bash
# Desde el PC local
cd "F:/Estudio de Creacion Digital IV/Galeria"
npm run build
scp -r dist/* root@159.203.189.167:/var/www/galeria-frontend/
```

## Deploy del Backend

```bash
# Editar server.js en el droplet
ssh root@159.203.189.167
nano /var/www/galeria-api/server.js
pm2 restart galeria-api
pm2 logs galeria-api  # verificar
```

## Nginx Config

```nginx
server {
    listen 80;
    server_name ceopacademia.org www.ceopacademia.org _;
    # Certbot redirige HTTP → HTTPS automáticamente
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ceopacademia.org www.ceopacademia.org _;
    ssl_certificate /etc/letsencrypt/live/ceopacademia.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ceopacademia.org/privkey.pem;
    root /var/www/galeria-frontend;
    index index.html;

    location /cdn/ {
        proxy_pass https://galeria-3d-files.nyc3.cdn.digitaloceanspaces.com/;
        proxy_set_header Host galeria-3d-files.nyc3.cdn.digitaloceanspaces.com;
        proxy_ssl_server_name on;
        expires 30d;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        client_max_body_size 100M;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Base de datos

### Tablas
```sql
profiles       (id UUID PK, full_name, role, email, password_hash, bio, artstation_url, instagram_url)
models         (id UUID PK, title, student, category, description, tags[], file_name, file_url, file_size, user_id FK, sort_order, thumbnail_url)
likes          (id UUID PK, user_id FK, model_id FK)
comments       (id UUID PK, user_id FK, model_id FK, text)
student_skills (user_id FK, skill_name, value, PK(user_id, skill_name))
```

### Conexión desde local
```bash
ssh root@159.203.189.167
PGPASSWORD='G4l3r1a2026!$DO' psql -h 127.0.0.1 -U galeria -d galeria_3d
```

## API Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /api/auth/login | No | Login → JWT |
| POST | /api/auth/register | No | Registro → JWT |
| GET | /api/auth/me | JWT | Perfil actual |
| GET | /api/models | No | Listar modelos |
| POST | /api/models | JWT | Crear modelo (FormData) |
| PUT | /api/models/:id | JWT | Editar modelo |
| DELETE | /api/models/:id | Admin | Eliminar modelo |
| PUT | /api/models/reorder | Admin | Reordenar modelos |
| PUT | /api/models/:id/thumbnail | JWT | Subir thumbnail |
| GET | /api/likes/counts | No | Conteos de likes |
| GET | /api/likes/user | JWT | Likes del usuario |
| POST | /api/likes/toggle | JWT | Toggle like |
| GET | /api/comments/:modelId | No | Comentarios de modelo |
| POST | /api/comments | JWT | Crear comentario |
| DELETE | /api/comments/:id | JWT | Eliminar comentario |
| GET | /api/comments-counts | No | Conteos de comentarios |
| GET | /api/profiles/students | No | Estudiantes con skills |
| PUT | /api/profiles/:id | JWT | Editar perfil |
| DELETE | /api/profiles/:id | Admin | Eliminar perfil |
| GET | /api/skills/:userId | No | Skills de estudiante |
| PUT | /api/skills/:userId | JWT | Upsert skills |
| DELETE | /api/skills/:userId | Admin | Limpiar skills |
| GET | /api/health | No | Health check |

## Monitoreo

```bash
ssh root@159.203.189.167
pm2 status              # Estado de la API
pm2 logs galeria-api    # Logs en tiempo real
curl localhost:3000/api/health  # Health check
```
