#!/bin/sh
set -e
# Refuse to run in production with a weak or example secret key.
case "$DJANGO_SECRET_KEY" in
  ""|change-me*|dev-insecure*) echo "ERROR: set a real DJANGO_SECRET_KEY in .env (50+ random characters)"; exit 1 ;;
esac
if [ ${#DJANGO_SECRET_KEY} -lt 50 ]; then echo "ERROR: DJANGO_SECRET_KEY must be at least 50 characters"; exit 1; fi
# Only the web container runs migrations; worker/beat start after it is healthy.
if [ "$RUN_MIGRATIONS" = "1" ]; then
  python manage.py migrate --noinput
  python manage.py collectstatic --noinput >/dev/null
  if [ -n "$OWNER_PASSWORD" ]; then
    python manage.py seed_initial --owner-username "${OWNER_USERNAME:-owner}" --owner-password "$OWNER_PASSWORD"
  else
    python manage.py seed_initial
  fi
fi
exec "$@"
