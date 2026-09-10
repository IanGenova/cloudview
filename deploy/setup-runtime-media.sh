#!/usr/bin/env bash

set -Eeuo pipefail

# /var/www/cloudview-uploads, matching the nginx alias in
# nginx-cloudview.conf and what fix-cloudview-uploads.sh writes into .env.
#
# This defaulted to /var/www/cloudview-media while the other script and nginx
# used cloudview-uploads. With MENU_UPLOAD_DIR unset the writer fell back to
# <cwd>/storage/menu-images and the reader to /var/www/cloudview-media/menu,
# so uploads succeeded and every dish photo then 404d.
MEDIA_ROOT="${CLOUDVIEW_MEDIA_ROOT:-/var/www/cloudview-uploads}"
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
