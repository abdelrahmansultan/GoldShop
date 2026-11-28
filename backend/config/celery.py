import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("goldshop")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
app.conf.beat_schedule = {
    "nightly-backup": {"task": "apps.core.tasks.nightly_backup", "schedule": crontab(hour=2, minute=17)},
    "gold-price-sync": {"task": "apps.pricing.tasks.sync_provider_prices", "schedule": crontab(minute="*/15")},
}
