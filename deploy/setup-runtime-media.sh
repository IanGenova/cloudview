#!/usr/bin/env bash

set -Eeuo pipefail

MEDIA_ROOT="${CLOUDVIEW_MEDIA_ROOT:-/var/www/cloudview-media}"
APP_USER="${APP_USER:-root}"

FOLDERS=(
  menu
  hotel-guide
  hotel-settings
  images
  service-requests
  service-request-paymongo
)

for FOLDER in "${FOLDERS[@]}"
do
  mkdir -p "$MEDIA_ROOT/$FOLDER"
done

chown -R "$APP_USER":"$APP_USER" "$MEDIA_ROOT"

find "$MEDIA_ROOT" \
  -type d \
  -exec chmod 755 {} \;

find "$MEDIA_ROOT" \
  -type f \
  -exec chmod 644 {} \;

echo "Runtime media storage prepared:"
echo "$MEDIA_ROOT"

echo
echo "Add these values to the production .env:"
echo "CLOUDVIEW_MEDIA_ROOT=$MEDIA_ROOT"
echo "MENU_UPLOAD_DIR=$MEDIA_ROOT/menu"
