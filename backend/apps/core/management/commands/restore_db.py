from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.core.backup import create_backup, restore_backup


class Command(BaseCommand):
    help = "Restore a backup. A safety backup of the current DB is taken first."

    def add_arguments(self, p):
        p.add_argument("dump", help="File name in BACKUP_DIR or full path")
        p.add_argument("--yes", action="store_true", help="Skip confirmation")

    def handle(self, *a, **o):
        path = Path(o["dump"])
        if not path.is_absolute():
            path = Path(settings.BACKUP_DIR) / path
        if not path.exists():
            raise CommandError(f"Not found: {path}")
        if not o["yes"] and input(f"This REPLACES all current data with {path.name}. Type RESTORE: ") != "RESTORE":
            raise CommandError("Aborted.")
        safety = create_backup("pre-restore")
        self.stdout.write(f"Safety backup: {safety}")
        restore_backup(path)
        self.stdout.write(self.style.SUCCESS("Restore complete."))
