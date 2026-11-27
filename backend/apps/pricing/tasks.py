from celery import shared_task

from .models import PriceSource
from .providers import sync_source


@shared_task
def sync_provider_prices():
    return {s.name: sync_source(s) for s in PriceSource.objects.filter(kind="provider", is_active=True)}
