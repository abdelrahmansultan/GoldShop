#!/bin/sh
set -e
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
