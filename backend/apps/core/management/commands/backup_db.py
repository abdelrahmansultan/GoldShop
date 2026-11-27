from django.core.management.base import BaseCommand

from apps.core.backup import create_backup


class Command(BaseCommand):
    help = "Create a PostgreSQL + media backup in BACKUP_DIR"

    def add_arguments(self, p):
        p.add_argument("--label", default="manual")

    def handle(self, *a, **o):
        self.stdout.write(self.style.SUCCESS(f"Backup written: {create_backup(o['label'])}"))
