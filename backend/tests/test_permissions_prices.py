from datetime import timedelta
from decimal import Decimal as D

from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.pricing.models import GoldPrice
from apps.pricing.services import manual_source

from .test_flows import API, sell


def test_custom_screens_restrict_and_extend_a_user(owner, ref):
    r = owner.post(f"{API}/users/", {"username": "c2", "password": "Str0ng!pass", "role": "cashier",
                                     "custom_capabilities": ["sales.create", "sales.view"]}, format="json")
    assert r.status_code == 201, r.data
    u = User.objects.get(username="c2")
    assert u.has_cap("sales.create") and not u.has_cap("parties.manage")   # removed from the role defaults
    c = APIClient(); c.force_authenticate(u)
    assert c.get(f"{API}/customers/").status_code == 403
    me = c.get(f"{API}/auth/me/").data
    assert me["capabilities"] == ["sales.create", "sales.view"]
    # back to the role's defaults
    owner.patch(f"{API}/users/{u.id}/", {"custom_capabilities": None}, format="json")
    u.refresh_from_db()
    assert u.has_cap("parties.manage")


def test_manager_with_user_screen_cannot_escalate(owner, manager, ref):
    owner.patch(f"{API}/users/{manager.user.id}/", {"custom_capabilities": [
        "users.manage", "sales.create", "sales.view", "prices.manage", "inventory.view"]}, format="json")
    manager.user.refresh_from_db()
    r = manager.post(f"{API}/users/", {"username": "c3", "password": "Str0ng!pass", "role": "cashier",
                                       "custom_capabilities": ["sales.create"]}, format="json")
    assert r.status_code == 201, r.data
    r = manager.post(f"{API}/users/", {"username": "c4", "password": "Str0ng!pass", "role": "cashier",
                                       "custom_capabilities": ["settings.manage"]}, format="json")
    assert r.status_code == 400                                   # cannot grant what they do not have
    r = manager.post(f"{API}/users/", {"username": "o2", "password": "Str0ng!pass", "role": "owner"}, format="json")
    assert r.status_code == 400
    assert manager.patch(f"{API}/users/{owner.user.id}/", {"is_active": False}, format="json").status_code == 400
    assert manager.get(f"{API}/auth/capabilities/").data["groups"]


def test_only_managers_set_prices(cashier, clerk, ref):
    body = {"entries": [{"karat": ref["k21"].id, "buy_price": "1", "sell_price": "2"}]}
    assert cashier.post(f"{API}/prices/record/", body, format="json").status_code == 403
    assert clerk.post(f"{API}/prices/record/", body, format="json").status_code == 403


def test_sales_blocked_until_todays_price(manager, cashier, ring, ref):
    yesterday = timezone.now() - timedelta(days=1)
    for k in (ref["k21"], ref["k18"], ref["k24"]):
        GoldPrice.objects.create(karat=k, buy_price=D("3100"), sell_price=D("3150"), source=manual_source(),
                                 effective_at=yesterday, entered_by=manager.user)
    r = sell(cashier, ring["id"], [])
    assert r.status_code == 400 and r.data["code"] == "price_not_today"
    board = cashier.get(f"{API}/price-board/").data["rows"]
    assert all(row["is_stale"] for row in board if row["price"])
    manager.post(f"{API}/prices/record/", {"entries": [
        {"karat": ref["k21"].id, "buy_price": "3150", "sell_price": "3200"}]}, format="json")
    assert sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}]).status_code == 201


def test_price_change_log(manager, ref):
    for buy, sell_p in (("3100", "3150"), ("3150", "3210.50")):
        manager.post(f"{API}/prices/record/", {"entries": [
            {"karat": ref["k21"].id, "buy_price": buy, "sell_price": sell_p}]}, format="json")
    log = manager.get(f"{API}/prices/", {"karat": ref["k21"].id}).data["results"]
    assert log[0]["sell_price"] == "3210.50" and log[0]["sell_change"] == "60.50" and log[0]["buy_change"] == "50.00"
    assert log[1]["sell_change"] is None                          # first price has no previous one
    assert log[0]["entered_by_name"] == "Manager1"
    assert manager.get(f"{API}/prices/", {"entered_by": manager.user.id}).data["count"] == 2
    csv = manager.get(f"{API}/prices/", {"export": "csv"})
    assert csv["Content-Type"].startswith("text/csv") and "60.50" in csv.content.decode()
    assert manager.get(f"{API}/prices/editors/").data == [{"id": manager.user.id, "name": "Manager1"}]
