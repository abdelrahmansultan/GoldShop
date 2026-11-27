"""PostgreSQL backup/restore using pg_dump/pg_restore (custom format).
Backups include the full database; media files are archived alongside."""
import os
import shutil
import subprocess
import tarfile
from datetime import datetime
from pathlib import Path

from django.conf import settings


def _env():
    db = settings.DATABASES["default"]
    env = os.environ.copy()
    env["PGPASSWORD"] = db["PASSWORD"]
    return db, env


def _conn_args(db):
    return ["-h", db["HOST"] or "localhost", "-p", str(db["PORT"] or 5432), "-U", db["USER"]]


def create_backup(label: str = "") -> Path:
    if not shutil.which("pg_dump"):
        raise RuntimeError("pg_dump is not installed on this server.")
    out_dir = Path(settings.BACKUP_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    name = f"goldshop-{stamp}{('-' + label) if label else ''}"
    dump = out_dir / f"{name}.dump"
    db, env = _env()
    subprocess.run(["pg_dump", "-Fc", "--no-owner", *_conn_args(db), "-f", str(dump), db["NAME"]],
                   env=env, check=True, capture_output=True, timeout=1800)
    media = Path(settings.MEDIA_ROOT)
    if media.exists() and any(media.iterdir()):
        with tarfile.open(out_dir / f"{name}.media.tar.gz", "w:gz") as tar:
            tar.add(media, arcname="media")
    return dump


def list_backups() -> list[dict]:
    d = Path(settings.BACKUP_DIR)
    if not d.exists():
        return []
    return [{"name": p.name, "size": p.stat().st_size,
             "created_at": datetime.fromtimestamp(p.stat().st_mtime).isoformat()}
            for p in sorted(d.glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)]


def restore_backup(dump: Path):
    """Destructive: replaces the current database contents. CLI only."""
    db, env = _env()
    subprocess.run(["pg_restore", "--clean", "--if-exists", "--no-owner", "--single-transaction",
                    *_conn_args(db), "-d", db["NAME"], str(dump)], env=env, check=True, timeout=3600)
    media_tar = dump.with_name(dump.name.replace(".dump", ".media.tar.gz"))
    if media_tar.exists():
        with tarfile.open(media_tar) as tar:
            tar.extractall(Path(settings.MEDIA_ROOT).parent, filter="data")


def prune(keep: int = 30):
    files = sorted(Path(settings.BACKUP_DIR).glob("*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    for p in files[keep:]:
        p.unlink(missing_ok=True)
        p.with_name(p.name.replace(".dump", ".media.tar.gz")).unlink(missing_ok=True)
