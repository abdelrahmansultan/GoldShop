from decimal import Decimal as D

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Category
from apps.pricing.models import Karat
from apps.treasury.models import MoneyAccount


@pytest.fixture
def ref(db):
    call_command("seed_initial", verbosity=0)
    MoneyAccount.objects.create(name="Bank", kind="bank", is_default=True)
    return {"k21": Karat.objects.get(code="21"), "k18": Karat.objects.get(code="18"),
            "k24": Karat.objects.get(code="24"), "rings": Category.objects.get(code="rings"),
            "coins": Category.objects.get(code="coins"), "cash": MoneyAccount.objects.get(kind="cash")}


def _client(role, username):
    u = User.objects.create_user(username, password="Str0ng!pass", role=role, full_name=username.title())
    c = APIClient()
    c.force_authenticate(u)
    c.user = u
    return c


@pytest.fixture
def owner(ref):
    return _client("owner", "owner1")


@pytest.fixture
def manager(ref):
    return _client("manager", "manager1")


@pytest.fixture
def cashier(ref):
    return _client("cashier", "cashier1")


@pytest.fixture
def clerk(ref):
    return _client("inventory", "clerk1")


@pytest.fixture
def prices(manager, ref):
    r = manager.post("/api/v1/prices/record/", {"entries": [
        {"karat": ref["k21"].id, "buy_price": "3150.00", "sell_price": "3200.00"},
        {"karat": ref["k18"].id, "buy_price": "2700.00", "sell_price": "2745.00"},
        {"karat": ref["k24"].id, "buy_price": "3600.00", "sell_price": "3657.00"},
    ]}, format="json")
    assert r.status_code == 201, r.data
    return r.data


def make_product(client, ref, **kw):
    data = {"name": "خاتم", "category": ref["rings"].id, "karat": ref["k21"].id, "gross_weight": "10.500",
            "stone_weight": "0.500", "making_charge_type": "per_gram", "making_charge_value": "100",
            "purchase_cost": "30000", "opening_quantity": 1, "tracking": "piece"}
    data.update(kw)
    r = client.post("/api/v1/products/", data, format="json")
    assert r.status_code == 201, r.data
    return r.data


@pytest.fixture
def ring(manager, ref):
    return make_product(manager, ref)


D = D
