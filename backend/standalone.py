"""All-in-one launcher used by the Windows desktop app ("standalone" mode).

Starts a private PostgreSQL cluster stored in the user's data folder, applies
migrations, loads reference (and on first run, demo) data, takes a daily
backup, then serves the API on 127.0.0.1 with waitress.

Environment:
  GOLDSHOP_DATA     data folder (database, media, backups, secrets)   [required]
  GOLDSHOP_PGBIN    folder containing initdb / pg_ctl / pg_dump        [required]
  GOLDSHOP_PORT     API port (default 8765)
  GOLDSHOP_PG_PORT  PostgreSQL port (default 54329)
  GOLDSHOP_DEMO     "1" to load demo data into a brand-new database
"""
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

DATA = Path(os.environ["GOLDSHOP_DATA"]).resolve()
PGBIN = Path(os.environ["GOLDSHOP_PGBIN"]).resolve()
PORT = int(os.environ.get("GOLDSHOP_PORT", "8765"))
PG_PORT = int(os.environ.get("GOLDSHOP_PG_PORT", "54329"))
PGDATA = DATA / "pgdata"
EXE = ".exe" if os.name == "nt" else ""
NO_WINDOW = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW: no console flashes on Windows


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sk:
        try:
            sk.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def pick_port(preferred: int) -> int:
    """Preferred port if free, otherwise any free port (another program may use ours)."""
    if port_free(preferred):
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sk:
        sk.bind(("127.0.0.1", 0))
        return sk.getsockname()[1]


def running_pg_port():
    """Port of our own cluster if it is already running (e.g. left over after a crash)."""
    pid = PGDATA / "postmaster.pid"
    if run(PGBIN / f"pg_ctl{EXE}", "status", "-D", PGDATA, check=False).returncode == 0 and pid.exists():
        lines = pid.read_text("utf-8", errors="ignore").splitlines()
        if len(lines) > 3 and lines[3].strip().isdigit():
            return int(lines[3])
    return None


def log(msg):
    print(f"[goldshop] {msg}", flush=True)


def run(*args, check=True, **kw):
    return subprocess.run([str(a) for a in args], check=check, capture_output=True, text=True,
                          creationflags=NO_WINDOW, **kw)


def load_secrets() -> dict:
    f = DATA / "secrets.json"
    if f.exists():
        return json.loads(f.read_text("utf-8"))
    s = {"django_secret_key": secrets.token_urlsafe(64), "db_password": secrets.token_urlsafe(24)}
    f.write_text(json.dumps(s), "utf-8")
    return s


def ensure_postgres(db_password: str):
    if not (PGDATA / "PG_VERSION").exists():
        log("Creating database cluster (first run)…")
        pwfile = DATA / ".pw.tmp"
        pwfile.write_text(db_password, "utf-8")
        try:
            run(PGBIN / f"initdb{EXE}", "-D", PGDATA, "-U", "goldshop", "--pwfile", pwfile, "-A", "scram-sha-256",
                "-E", "UTF8", "--locale", "C")
        finally:
            pwfile.unlink(missing_ok=True)
        with open(PGDATA / "postgresql.conf", "a", encoding="utf-8") as fh:
            fh.write("\n# goldshop standalone (port is chosen at start-up)\nlisten_addresses = '127.0.0.1'\n"
                     "max_connections = 30\nshared_buffers = 64MB\ntimezone = 'Africa/Cairo'\n")
    pg_port = running_pg_port()
    if pg_port is None:
        pg_port = pick_port(PG_PORT)
        log(f"Starting PostgreSQL on port {pg_port}…")
        r = run(PGBIN / f"pg_ctl{EXE}", "start", "-D", PGDATA, "-l", DATA / "postgres.log", "-o", f"-p {pg_port}",
                "-w", "-t", "90", check=False)
        if r.returncode != 0:
            raise SystemExit(f"PostgreSQL failed to start:\n{r.stdout}\n{r.stderr}\nSee {DATA / 'postgres.log'}")
    import psycopg
    for _ in range(30):
        try:
            with psycopg.connect(host="127.0.0.1", port=pg_port, user="goldshop", password=db_password,
                                 dbname="postgres", autocommit=True) as conn:
                if not conn.execute("SELECT 1 FROM pg_database WHERE datname='goldshop'").fetchone():
                    conn.execute("CREATE DATABASE goldshop")
                return pg_port
        except psycopg.OperationalError:
            time.sleep(1)
    raise SystemExit("Could not connect to PostgreSQL.")


def configure_env(s: dict, pg_port: int, api_port: int):
    os.environ.update({
        "DJANGO_SETTINGS_MODULE": "config.settings",
        "DJANGO_SECRET_KEY": s["django_secret_key"],
        "DJANGO_DEBUG": "0",
        "DJANGO_ALLOWED_HOSTS": "127.0.0.1,localhost",
        "CORS_ALLOWED_ORIGINS": f"http://127.0.0.1:{api_port},http://localhost:{api_port}",
        "POSTGRES_HOST": "127.0.0.1", "POSTGRES_PORT": str(pg_port), "POSTGRES_DB": "goldshop",
        "POSTGRES_USER": "goldshop", "POSTGRES_PASSWORD": s["db_password"],
        "MEDIA_ROOT": str(DATA / "media"), "BACKUP_DIR": str(DATA / "backups"),
        "SERVE_MEDIA": "1", "LOG_LEVEL": "WARNING",
    })
    # pg_dump / pg_restore for the backup feature
    os.environ["PATH"] = str(PGBIN) + os.pathsep + os.environ.get("PATH", "")


def prepare_database():
    import django
    from django.core.management import call_command

    django.setup()
    log("Applying database updates…")
    call_command("migrate", interactive=False, verbosity=0)
    from apps.accounts.models import User
    fresh = not User.objects.exists()
    call_command("seed_initial", verbosity=0)
    if fresh and os.environ.get("GOLDSHOP_DEMO") == "1":
        log("Loading demo data…")
        call_command("seed_demo", verbosity=0)
        (DATA / "DEMO_DATA").write_text("This database contains demo data for testing.\n", "utf-8")


def daily_backup():
    try:
        from apps.core.backup import create_backup, list_backups, prune
        last = list_backups()[:1]
        if last and datetime.fromisoformat(last[0]["created_at"]) > datetime.now() - timedelta(hours=20):
            return
        log(f"Daily backup: {create_backup('auto')}")
        prune(30)
    except Exception as exc:  # noqa: BLE001 - a failed backup must not stop the shop
        log(f"Backup failed: {exc}")


def main():
    for d in (DATA, DATA / "media", DATA / "backups"):
        d.mkdir(parents=True, exist_ok=True)
    s = load_secrets()
    pg_port = ensure_postgres(s["db_password"])
    api_port = pick_port(PORT)
    configure_env(s, pg_port, api_port)
    prepare_database()
    threading.Thread(target=daily_backup, daemon=True).start()

    from waitress import serve

    from config.wsgi import application
    log(f"READY http://127.0.0.1:{api_port}")
    serve(application, host="127.0.0.1", port=api_port, threads=8, ident="goldshop")


if __name__ == "__main__":
    main()
