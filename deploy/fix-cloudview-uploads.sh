#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT="/var/www/cloudview"
UPLOAD_ROOT="/var/www/cloudview-uploads"
PUBLIC_UPLOADS="$PROJECT/public/uploads"
NGINX_SITE="/etc/nginx/sites-available/cloudview"
BACKUP_ROOT="/var/www/cloudview-backups"
STAMP="$(date +%Y%m%d-%H%M%S)"

cd "$PROJECT"

echo "============================================"
echo "CloudView upload storage repair"
echo "============================================"

mkdir -p "$BACKUP_ROOT"
mkdir -p "$UPLOAD_ROOT"

mkdir -p \
  "$UPLOAD_ROOT/menu" \
  "$UPLOAD_ROOT/hotel-guide" \
  "$UPLOAD_ROOT/hotel-settings" \
  "$UPLOAD_ROOT/images" \
  "$UPLOAD_ROOT/service-requests" \
  "$UPLOAD_ROOT/service-request-paymongo"

echo
echo "[1/9] Detecting CloudView process user..."

APP_PID="$(
  pm2 pid cloudview-nextjs 2>/dev/null |
  head -n 1 |
  tr -d '[:space:]'
)"

if [ -n "$APP_PID" ] && [ "$APP_PID" != "0" ]; then
  APP_USER="$(
    ps -o user= -p "$APP_PID" |
    xargs
  )"
else
  APP_USER="root"
fi

echo "Application user: $APP_USER"

echo
echo "[2/9] Stopping CloudView temporarily..."

pm2 stop cloudview-nextjs || true

echo
echo "[3/9] Removing the external symlink..."

# Unmount a previous bind mount if one is already active.
if mountpoint -q "$PUBLIC_UPLOADS" 2>/dev/null; then
  umount "$PUBLIC_UPLOADS"
fi

# Migrate files from an existing symbolic-link target.
if [ -L "$PUBLIC_UPLOADS" ]; then
  OLD_TARGET="$(readlink -f "$PUBLIC_UPLOADS" || true)"

  echo "Old symlink target: $OLD_TARGET"

  if \
    [ -n "$OLD_TARGET" ] && \
    [ "$OLD_TARGET" != "$UPLOAD_ROOT" ] && \
    [ -d "$OLD_TARGET" ]
  then
    cp -a "$OLD_TARGET"/. "$UPLOAD_ROOT"/
  fi

  rm "$PUBLIC_UPLOADS"
fi

# Migrate files from a normal public/uploads directory.
if [ -d "$PUBLIC_UPLOADS" ]; then
  cp -a "$PUBLIC_UPLOADS"/. "$UPLOAD_ROOT"/ 2>/dev/null || true

  mv \
    "$PUBLIC_UPLOADS" \
    "$BACKUP_ROOT/public-uploads-$STAMP"
fi

# Recover files from earlier storage attempts.
if [ -d /var/www/cloudview-data/menu-images ]; then
  cp -a \
    /var/www/cloudview-data/menu-images/. \
    "$UPLOAD_ROOT/menu"/ 2>/dev/null || true
fi

if [ -d /var/www/cloudview-data/uploads ]; then
  cp -a \
    /var/www/cloudview-data/uploads/. \
    "$UPLOAD_ROOT"/ 2>/dev/null || true
fi

if [ -d /var/www/cloudview-storage/uploads ]; then
  cp -a \
    /var/www/cloudview-storage/uploads/. \
    "$UPLOAD_ROOT"/ 2>/dev/null || true
fi

mkdir -p "$PROJECT/public/uploads"

echo
echo "[4/9] Setting runtime-storage permissions..."

chown -R "$APP_USER":"$APP_USER" "$UPLOAD_ROOT"

find "$UPLOAD_ROOT" \
  -type d \
  -exec chmod 755 {} \;

find "$UPLOAD_ROOT" \
  -type f \
  -exec chmod 644 {} \;

echo
echo "[5/9] Updating environment variables..."

if grep -q '^MENU_UPLOAD_DIR=' "$PROJECT/.env"; then
  sed -i \
    's#^MENU_UPLOAD_DIR=.*#MENU_UPLOAD_DIR=/var/www/cloudview-uploads/menu#' \
    "$PROJECT/.env"
else
  printf '\nMENU_UPLOAD_DIR=/var/www/cloudview-uploads/menu\n' \
    >> "$PROJECT/.env"
fi

if grep -q '^UPLOADS_ROOT_DIR=' "$PROJECT/.env"; then
  sed -i \
    's#^UPLOADS_ROOT_DIR=.*#UPLOADS_ROOT_DIR=/var/www/cloudview-uploads#' \
    "$PROJECT/.env"
else
  printf 'UPLOADS_ROOT_DIR=/var/www/cloudview-uploads\n' \
    >> "$PROJECT/.env"
fi

grep -E \
  '^(MENU_UPLOAD_DIR|UPLOADS_ROOT_DIR)=' \
  "$PROJECT/.env"

echo
echo "[6/9] Installing the direct Nginx upload route..."

cp -a \
  "$NGINX_SITE" \
  "$BACKUP_ROOT/nginx-cloudview-$STAMP"

cat > "$NGINX_SITE" <<'NGINX'
server {
    listen 80;
    listen [::]:80;

    server_name cloudhotelph.com www.cloudhotelph.com;

    return 301 https://cloudhotelph.com$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;

    server_name cloudhotelph.com www.cloudhotelph.com;

    ssl_certificate /etc/letsencrypt/live/cloudhotelph.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cloudhotelph.com/privkey.pem;

    client_max_body_size 55M;

    location ^~ /uploads/ {
        alias /var/www/cloudview-uploads/;

        autoindex off;
        access_log off;
        log_not_found off;
        expires 30d;

        add_header Cache-Control "public, max-age=2592000";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-CloudView-Uploads "nginx-runtime-storage" always;
    }

    location = /connection/websocket {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

ln -sf \
  /etc/nginx/sites-available/cloudview \
  /etc/nginx/sites-enabled/cloudview

nginx -t
systemctl reload nginx

echo
echo "[7/9] Building while public/uploads is empty..."

echo "public/uploads details:"
ls -ld "$PUBLIC_UPLOADS"

if [ -L "$PUBLIC_UPLOADS" ]; then
  echo "ERROR: public/uploads is still a symlink."
  exit 1
fi

if mountpoint -q "$PUBLIC_UPLOADS"; then
  echo "ERROR: public/uploads is still mounted during build."
  exit 1
fi

rm -rf "$PROJECT/.next"

npx prisma generate
npm run build

echo
echo "[8/9] Creating a bind mount after the build..."

mount --bind "$UPLOAD_ROOT" "$PUBLIC_UPLOADS"

FSTAB_LINE="$UPLOAD_ROOT $PUBLIC_UPLOADS none bind 0 0"

if ! grep -qF "$FSTAB_LINE" /etc/fstab; then
  printf '%s\n' "$FSTAB_LINE" >> /etc/fstab
fi

echo "Bind mount:"
mount | grep "$PUBLIC_UPLOADS" || true

echo
echo "[9/9] Restarting CloudView..."

pm2 restart cloudview-nextjs --update-env
pm2 save

echo
echo "============================================"
echo "Repair completed"
echo "============================================"

echo
echo "Physical upload storage:"
echo "$UPLOAD_ROOT"

echo
echo "Application upload path:"
echo "$PUBLIC_UPLOADS"

echo
echo "Mount status:"
findmnt "$PUBLIC_UPLOADS" || true

echo
echo "Uploaded-file counts:"

for FOLDER in \
  menu \
  hotel-guide \
  hotel-settings \
  images \
  service-requests \
  service-request-paymongo
do
  COUNT="$(
    find "$UPLOAD_ROOT/$FOLDER" \
      -type f \
      2>/dev/null |
    wc -l |
    xargs
  )"

  printf '%-28s %s file(s)\n' "$FOLDER" "$COUNT"
done

echo
echo "Testing an existing uploaded file..."

FILE="$(
  find "$UPLOAD_ROOT" \
    -type f \
    | head -n 1 \
    || true
)"

if [ -n "$FILE" ]; then
  RELATIVE="${FILE#"$UPLOAD_ROOT"/}"

  echo "File: $FILE"
  echo "URL: https://cloudhotelph.com/uploads/$RELATIVE"

  curl -sSI \
    "https://cloudhotelph.com/uploads/$RELATIVE" \
    | sed -n '1,20p'
else
  echo "No existing uploaded file was found."
fi

echo
echo "Successful responses contain:"
echo "X-CloudView-Uploads: nginx-runtime-storage"
