FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# postgresql-client provides pg_dump / pg_restore for the backup feature
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && apt-get clean
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN useradd --create-home app \
    && mkdir -p /data/media /data/backups /app/staticfiles \
    && chown -R app /data /app/staticfiles \
    && chmod +x /app/entrypoint.sh
USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60", "--access-logfile", "-"]
