from celery import shared_task

from .providers import due_sources, sync_source


@shared_task
def sync_provider_prices():
    """Runs every 15 minutes; each source decides via its own interval whether it is due."""
    return {s.name: sync_source(s) for s in due_sources()}
