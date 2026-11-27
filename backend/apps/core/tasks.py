from celery import shared_task

from .backup import create_backup, prune


@shared_task
def nightly_backup():
    path = create_backup("nightly")
    prune(30)
    return str(path)
