from decimal import Decimal as D

from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AuditLog

from .test_flows import API, sell


def test_login_lockout_and_audit(ref, settings):
    cache.clear()
    settings.LOGIN_MAX_FAILURES = 3
    User.objects.create_user("lock", password="Str0ng!pass", role="cashier")
    c = APIClient()
    for _ in range(3):
        r = c.post(f"{API}/auth/login/", {"username": "lock", "password": "wrong"}, format="json")
        assert r.status_code == 401
    r = c.post(f"{API}/auth/login/", {"username": "lock", "password": "Str0ng!pass"}, format="json")
    assert r.status_code == 429 and r.data["code"] == "locked"   # even the right password is refused while locked
    assert AuditLog.objects.filter(action="auth.login_failed").count() == 3
    assert AuditLog.objects.filter(action="auth.login_blocked").exists()
    cache.clear()
    r = c.post(f"{API}/auth/login/", {"username": "lock", "password": "Str0ng!pass"}, format="json")
    assert r.status_code == 200 and "access" in r.data
    assert AuditLog.objects.filter(action="auth.login").exists()


def test_daily_close_expected_cash(owner, cashier, prices, ring, ref):
    owner.post(f"{API}/transactions/movement/", {"account": ref["cash"].id, "type": "opening", "amount": "1000",
                                                 "description": "Float"}, format="json")
    sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}])
    d = owner.get(f"{API}/reports/daily-close/").data
    cash = next(a for a in d["accounts"] if a["kind"] == "cash")
    assert cash["opening"] == D("0") and cash["net"] == D("34140.00")
    assert d["expected_cash"] == D("34140.00")
    assert d["sales"]["invoices"] == 1 and d["first_invoice"] == d["last_invoice"]
    assert cashier.get(f"{API}/reports/daily-close/").status_code == 403


def test_inventory_report_hides_cost_and_exports_csv(owner, cashier, prices, ring):
    r = owner.get(f"{API}/reports/inventory/").data
    assert r["totals"]["items"] == 1 and r["totals"]["total_cost"] == D("30000.00")
    assert r["rows"][0]["value_at_buy"] == D("31500.00")      # 10 g × 3150 buy price
    assert "total_cost" not in cashier.get(f"{API}/reports/inventory/").data["totals"]
    csv = owner.get(f"{API}/reports/inventory/?export=csv")
    assert csv["Content-Type"].startswith("text/csv")
    text = csv.content.decode("utf-8")
    assert text.startswith("﻿") and "خاتم" in text and "31500.00" in text


def test_balances_report(owner, cashier, prices, ring):
    cust = cashier.post(f"{API}/customers/", {"name": "Credit", "credit_limit": "50000"}, format="json").data
    sell(cashier, ring["id"], [{"method": "cash", "amount": "33000"}], customer=cust["id"])
    rows = owner.get(f"{API}/reports/balances/customers/").data
    assert rows == [{"id": cust["id"], "name": "Credit", "phone": "", "balance": D("140.00")}]
