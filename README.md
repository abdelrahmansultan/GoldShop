# Gold Shop ERP — نظام إدارة محل الذهب

[![CI](https://github.com/abdelrahmansultan/GoldShop/actions/workflows/ci.yml/badge.svg)](https://github.com/abdelrahmansultan/GoldShop/actions/workflows/ci.yml)

> **دليل التشغيل والنشر بالعربي: [DEPLOY.md](DEPLOY.md)**

A management system for a single gold and jewelry shop in Egypt. It covers gold prices, inventory, sales (POS) with old-gold exchange, purchases, customers and suppliers, treasury, expenses, reports and audit. One Django API serves both the **web app** and the **Windows desktop app**. The interface is in Arabic (RTL) and English (LTR). All amounts are in Egyptian Pounds (EGP).

```
backend/    Django 5.2 LTS + DRF API, PostgreSQL, Celery (backups / price sync)
  gold_engine/   pure-Python Decimal calculation engine (no Django dependency)
  apps/          core, accounts, pricing, inventory, parties, treasury, sales, purchases, reports
frontend/   React 19 + TypeScript + Vite + Tailwind 4 + React Query + React Hook Form/Zod + i18next
desktop/    Electron shell that loads the same frontend build and calls the same API
docker-compose.yml   PostgreSQL 16, Redis 7, API (gunicorn), Celery worker + beat, nginx
```

## Verified versions

| Component | Version | Notes |
|---|---|---|
| Python | 3.12 (Docker image); tested on 3.13 | |
| Django | 5.2.x LTS | supported until April 2028 |
| Django REST Framework | 3.16 | |
| PostgreSQL | 16 | required: ledger tables are protected by PostgreSQL triggers |
| Redis / Celery | 7 / 5.x | nightly backups, optional provider price sync |
| Node.js | 22 LTS | to build the frontend and desktop app |
| React / Vite / TypeScript | 19 / 7 / 5.9 | |
| Electron / electron-builder | 38 / 26 | Windows NSIS installer |

## Quick start (development)

```bash
sudo service postgresql start
```
```bash
sudo -u postgres psql -c "CREATE USER goldshop WITH PASSWORD 'goldshop' CREATEDB;" -c "CREATE DATABASE goldshop OWNER goldshop;"
```
```bash
cd backend && python3 -m venv ../.venv && ../.venv/bin/pip install -r requirements-dev.txt
```
```bash
../.venv/bin/python manage.py migrate && ../.venv/bin/python manage.py seed_initial --owner-username owner --owner-password 'ChangeMe#2026'
```
```bash
DJANGO_DEBUG=1 ../.venv/bin/python manage.py runserver 8000
```
```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to Django. **Enter today's gold prices first.** The system has no built-in prices and blocks sales until a price exists.

## Production (Docker, one shop server)

```bash
cp .env.example .env
```
Edit `.env`: set `DJANGO_SECRET_KEY`, `POSTGRES_PASSWORD`, `OWNER_PASSWORD` (first start only), and add the server's LAN IP to `DJANGO_ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS`. Then:
```bash
docker compose up -d --build
```
- Web app: `http://<server-ip>/`. The API is on port 8000 for desktop clients.
- Migrations run automatically when the `backend` container starts.
- Nightly backup at 02:17 Cairo time keeps the last 30 copies. The `backups` volume holds both the database dumps and the media archives.

## Windows desktop app

**All-in-one mode (default):** the installer bundles an embedded Python with the Django API and a portable PostgreSQL. On launch, `backend/standalone.py` creates a private database cluster in `%APPDATA%\Gold Shop ERP\data` (on first run), applies migrations, loads demo data into a brand-new database, takes a daily backup and serves the API on `127.0.0.1`. If the default ports are busy, it picks free ones. PostgreSQL is stopped cleanly when the app quits. **Client mode:** File → Server… → Network server connects the app to a shop server instead.

The easiest way: on GitHub open **Actions → Windows desktop installer → Run workflow**, then download the `.exe` from the run's artifacts. Pushing a `v*` tag also attaches it to a Release. To build locally on Windows (or Linux with Wine) using Node 22:
```bash
cd desktop && npm install && npm run dist:win
```
The installer is written to `desktop/release/`. The desktop app uses `http://localhost:8000` by default. For a shared server, go to **File → Server address… → Edit config file** and set `"apiUrl": "http://192.168.1.10:8000"`. Invoices print through the native Windows print dialog (`window.goldshop.print`). Fonts are bundled, so the app works without internet.

## Internet deployment with HTTPS

Set `DOMAIN` in `.env`, point the domain's DNS at the server, then:
```bash
docker compose -f docker-compose.yml -f docker-compose.https.yml up -d --build
```
Caddy obtains and renews the Let's Encrypt certificate automatically. Full step-by-step instructions are in [DEPLOY.md](DEPLOY.md).

## Reports
Sales (by day, karat, cashier, payment method) · **daily close** (expected drawer cash vs. counted, with the variance) · inventory valuation at today's buy price · customer/supplier balances. Every table exports to Excel-compatible CSV.

## Security
JWT sessions (30-minute access tokens, rotated refresh tokens) · per-username lockout after 5 failed logins for 15 minutes · every login, failure and block is audited · role capabilities enforced on the server · the production container refuses to start with a weak `DJANGO_SECRET_KEY`.

## Backup and restore

```bash
python manage.py backup_db --label before-upgrade
```
```bash
python manage.py restore_db goldshop-20261127-021700-nightly.dump
```
Restore asks you to type `RESTORE` and takes a safety backup of the current data first. The owner can also create backups from **Settings → Backups**. Restore is command-line only on purpose.

## Tests

```bash
cd backend && ../.venv/bin/python -m pytest
```
```bash
cd frontend && npx tsc -b && npm run build
```
There are 40 backend tests, and GitHub Actions runs them on every push (`.github/workflows/ci.yml`), along with the frontend build and both Docker image builds. They cover the calculation engine (exact expected values), historical price snapshots, immutability (including raw SQL), stock locking, adjustments and segregation of duties, stock counts, returns, exchange payouts, credit limits, discount limits, purchases, expenses, permissions and dashboard figures.

---

## Financial and inventory rules (how the system behaves)

### Numbers
- All money and weights use `Decimal`. The engine rejects floats. Weights are rounded to **0.001 g** and money to **0.01 EGP** (ROUND_HALF_UP), and only at defined points.
- The API sends every decimal as an exact string. The frontend never does arithmetic on money: totals come from the server's `/sales/preview/`, which runs the **same code** as posting.

### Gold calculation engine (`backend/gold_engine/engine.py`)
| Function | Formula |
|---|---|
| Net weight | gross − stones |
| Fine gold | weight × purity (24K = 0.999, 22K = 0.916, 21K = 0.875, 18K = 0.750; configurable) |
| Karat conversion | w × purity_from ÷ purity_to |
| Sale line | gold = net × qty × price/g; making = per gram × weight **or** fixed × qty **or** % of gold; + stones; − discount; VAT |
| VAT (Egypt default) | 14% on the **making charge** (and stones), not on gold value. Configurable in Settings. |
| Discount | taken from the making charge first, so VAT is charged only on what the customer actually pays |
| Invoice discount | split across lines in proportion to their value (the last line absorbs rounding) |
| Fixed-price items | making = fixed price − gold value at today's price; rejected if the fixed price is below the gold value |
| Old gold (بدل / buy-back) | accepted weight = weight × (1 − loss %); value = accepted × (buy price − deduction/g) |
| Inventory value | net weight × **buy** price. Making charge is excluded because it can't be recovered at buy-back. |

### Gold prices
- Every price is a new, permanent row. Old prices cannot be edited or deleted; a PostgreSQL trigger blocks this even for raw SQL.
- Each invoice line keeps a link to the exact price row used, plus a copy of the price, purity, weights and VAT policy. Later price changes never alter history.
- If a karat has no price, it shows **"No price entered"** and sales of that karat are blocked. Prices older than the configured number of hours are marked **Outdated**. The system never guesses or derives a missing price.
- External providers plug in through `apps/pricing/providers.py`. If a provider fails, its error is recorded and **no prices are stored**.

### Inventory
- `quantity_on_hand` changes **only** through `move_stock()`. It locks the product row (`SELECT … FOR UPDATE`) so two cashiers can never sell the same piece, and it writes an append-only `StockMovement`.
- Weights, karat and tracking type cannot be edited directly. They change only through an **adjustment** with a reason, approved by a manager. The requester can't approve their own request (the owner is exempt).
- A physical count snapshots the expected quantities. Barcode scans add to the counted quantity. Finalizing a count creates **pending** adjustments for each discrepancy; stock doesn't change until those are approved.
- Old gold taken in an exchange goes into a separate scrap ledger, tracked by karat.

### Money
- Cash and bank balances are the sum of append-only `MoneyTransaction` rows. A cash box can't go negative.
- Customer and supplier balances come from append-only ledgers. Credit sales require a registered customer and stay within that customer's credit limit.
- Expenses are voided with a reason, which creates a reversing entry. Nothing is deleted.

### Roles
| Role | Can |
|---|---|
| Owner | everything, including users, settings, backups and self-approval |
| Manager | prices, inventory, approvals, returns, discount and price overrides, purchases, treasury, reports, audit |
| Accountant | purchases, treasury, expenses, reports, cost visibility |
| Cashier | POS, invoices, customers, collecting payments; discount up to the configured % |
| Inventory clerk | products, adjustment requests, stock counts |

Permissions are enforced on the server (`apps/accounts/models.py: CAPABILITIES`). The frontend only hides what a user can't do. Costs are removed from API responses for roles without `inventory.view_cost`.

## API overview (`/api/v1/`)
`auth/login|refresh|logout|me|change-password` · `price-board` · `prices` (+ `record`) · `karats` · `price-sources` · `products` (+ `barcode/<code>`, `<id>/movements`) · `stock-movements` · `adjustments` (+ `<id>/decide`) · `stock-counts` (+ `lines`, `scan`, `finalize`, `cancel`) · `inventory/valuation` · `scrap-gold` · `sales` (+ `preview`, `<id>/return`) · `sales-returns` · `purchases` (+ `<id>/return`) · `customers|suppliers` (+ `ledger`, `payment`) · `accounts` · `transactions` (+ `transfer`, `movement`) · `expenses` (+ `void`) · `expense-categories` · `reports/dashboard` · `reports/sales` · `audit-log` · `settings` · `search` · `notifications` · `backups` · `health`

## Ready for multiple branches later
All records go through service functions, and stock and money are stored as ledgers. To add branches, add a `Branch` foreign key to `Product`, `StockMovement`, `MoneyAccount` and the document models, and scope the querysets by branch. No redesign is needed.
