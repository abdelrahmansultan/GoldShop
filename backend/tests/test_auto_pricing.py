from decimal import Decimal as D

import pytest

from apps.pricing import providers
from apps.pricing.models import GoldPrice, PriceSource
from apps.pricing.providers import ProviderUnavailable, TROY_OUNCE_GRAMS, due_sources, sync_source
from apps.sales.models import SalesInvoice

from .test_flows import API, sell

OUNCE = D("4800") * TROY_OUNCE_GRAMS          # => exactly 4800.00 EGP per gram of 24K


@pytest.fixture
def goldapi(ref, monkeypatch):
    calls = []

    def fake(url, headers, timeout=15):
        calls.append((url, headers))
        if headers.get("x-access-token") != "good-key":
            raise ProviderUnavailable("The API key was rejected by the price provider. Check the key.")
        return {"metal": "XAU", "currency": "EGP", "price": float(OUNCE), "timestamp": 1795800000}

    monkeypatch.setattr(providers, "http_get_json", fake)
    src = PriceSource.objects.get(provider_key="goldapi")
    src.calls = calls
    return src


def test_fetch_returns_proposals_without_saving(manager, goldapi):
    manager.patch(f"{API}/price-sources/{goldapi.id}/", {"api_key": "good-key", "sell_adjust_percent": "0.50",
                                                          "buy_adjust_percent": "-1.00"}, format="json")
    src = manager.get(f"{API}/price-sources/{goldapi.id}/").data
    assert src["has_api_key"] is True and "api_key" not in src          # key is never sent back
    r = manager.post(f"{API}/price-sources/{goldapi.id}/fetch/")
    assert r.status_code == 200, r.data
    by = {e["karat_code"]: e for e in r.data["entries"]}
    # Egyptian convention: 21K = 24K × 21/24 = 4200.00; sell +0.5%, buy −1%
    assert by["21"] == {"karat": by["21"]["karat"], "karat_code": "21", "buy_price": "4158.00", "sell_price": "4221.00"}
    assert by["24"]["sell_price"] == "4824.00" and by["18"]["buy_price"] == "3564.00"
    assert r.data["gram_24k"] == "4800.00"
    assert GoldPrice.objects.count() == 0                                # nothing recorded until the manager saves
    # manager saves the proposal with the provider as the source
    rec = manager.post(f"{API}/prices/record/", {"source": goldapi.id, "entries": [
        {"karat": e["karat"], "buy_price": e["buy_price"], "sell_price": e["sell_price"]} for e in r.data["entries"]]},
        format="json")
    assert rec.status_code == 201 and rec.data[0]["source_name"] == "GoldAPI"
    board = manager.get(f"{API}/price-board/").data
    assert board["ounce"]["derived"] is False and D(board["ounce"]["price"]) == OUNCE.quantize(D("0.00001"))


def test_bad_key_or_offline_never_invents_a_price(manager, cashier, goldapi):
    manager.patch(f"{API}/price-sources/{goldapi.id}/", {"api_key": "wrong"}, format="json")
    r = manager.post(f"{API}/price-sources/{goldapi.id}/fetch/")
    assert r.status_code == 400 and r.data["code"] == "provider_unavailable" and "key" in r.data["detail"]
    goldapi.refresh_from_db()
    assert goldapi.last_error and GoldPrice.objects.count() == 0
    assert cashier.post(f"{API}/price-sources/{goldapi.id}/fetch/").status_code == 403
    assert manager.patch(f"{API}/price-sources/{goldapi.id}/", {"buy_adjust_percent": "2", "sell_adjust_percent": "1"},
                         format="json").status_code == 400                # buy above sell rejected


def test_scheduled_auto_apply_records_prices_and_allows_sales(manager, cashier, ring, goldapi):
    goldapi.api_key, goldapi.auto_apply = "good-key", True
    goldapi.save()
    assert [s.id for s in due_sources()] == [goldapi.id]
    assert sync_source(goldapi) == 4
    assert list(due_sources()) == []                                     # not due again until the interval passes
    p = GoldPrice.objects.filter(karat__code="21").first()
    assert p.sell_price == D("4200.00") and p.buy_price == D("4158.00") and p.entered_by is None
    assert "Automatic" in p.note
    log = manager.get(f"{API}/prices/", {"karat": p.karat_id}).data["results"][0]
    assert log["source_name"] == "GoldAPI" and log["entered_by_name"] is None
    # ring: 10 g × 4200 + 1000 making + 140 VAT
    r = sell(cashier, ring["id"], [{"method": "cash", "amount": "43140.00"}])
    assert r.status_code == 201, r.data
    assert SalesInvoice.objects.count() == 1


def test_failed_auto_sync_records_nothing(goldapi):
    goldapi.api_key, goldapi.auto_apply = "wrong", True
    goldapi.save()
    assert sync_source(goldapi) == 0 and GoldPrice.objects.count() == 0
    goldapi.refresh_from_db()
    assert "key" in goldapi.last_error
