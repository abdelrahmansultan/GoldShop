from decimal import Decimal as D

import pytest
from django.db import connection, transaction
from django.db.utils import InternalError, ProgrammingError

from apps.inventory.models import Product, StockMovement
from apps.pricing.models import GoldPrice
from apps.sales.models import SalesInvoice

from .conftest import make_product

API = "/api/v1"


def sell(client, product_id, payments, **kw):
    body = {"lines": [{"product": product_id, "quantity": kw.pop("quantity", 1)}], "payments": payments, **kw}
    return client.post(f"{API}/sales/", body, format="json")


# ------------------------------------------------------------ prices

def test_cannot_sell_without_price(cashier, ring):
    r = sell(cashier, ring["id"], [])
    assert r.status_code == 400 and r.data["code"] == "no_price"


def test_partial_payment_without_customer_rejected(cashier, prices, ring):
    r = sell(cashier, ring["id"], [{"method": "cash", "amount": "1000"}])
    assert r.status_code == 400 and r.data["code"] == "credit_needs_customer"


def test_invoice_keeps_historical_price(manager, cashier, prices, ring, ref):
    r = sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}])
    assert r.status_code == 201, r.data
    inv_id = r.data["id"]
    line_price = r.data["lines"][0]["price_per_gram"]
    manager.post(f"{API}/prices/record/", {"entries": [
        {"karat": ref["k21"].id, "buy_price": "3500", "sell_price": "3550"}]}, format="json")
    again = cashier.get(f"{API}/sales/{inv_id}/").data
    assert again["lines"][0]["price_per_gram"] == line_price == "3200.00"
    assert again["grand_total"] == "33140.00"
    assert GoldPrice.objects.filter(karat=ref["k21"]).count() == 2


def test_price_rows_are_immutable(prices):
    gp = GoldPrice.objects.first()
    gp.sell_price = D("1")
    with pytest.raises(Exception):
        gp.save()
    with pytest.raises(Exception):
        GoldPrice.objects.all().delete()
    # database trigger blocks raw SQL too
    with pytest.raises((InternalError, ProgrammingError, Exception)):
        with transaction.atomic(), connection.cursor() as c:
            c.execute("UPDATE pricing_goldprice SET sell_price = 1")


def test_buy_price_above_sell_rejected(manager, ref):
    r = manager.post(f"{API}/prices/record/", {"entries": [
        {"karat": ref["k21"].id, "buy_price": "3300", "sell_price": "3200"}]}, format="json")
    assert r.status_code == 400


def test_cashier_cannot_set_prices_or_see_cost(cashier, ref, ring):
    r = cashier.post(f"{API}/prices/record/", {"entries": [
        {"karat": ref["k21"].id, "buy_price": "1", "sell_price": "2"}]}, format="json")
    assert r.status_code == 403
    p = cashier.get(f"{API}/products/{ring['id']}/").data
    assert "purchase_cost" not in p


def test_price_board_reports_missing(cashier, ref):
    rows = cashier.get(f"{API}/price-board/").data["rows"]
    assert all(r["price"] is None and r["is_stale"] for r in rows)


# ------------------------------------------------------------ inventory

def test_sale_decrements_stock_and_blocks_double_sale(cashier, prices, ring):
    assert sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}]).status_code == 201
    p = Product.objects.get(pk=ring["id"])
    assert p.quantity_on_hand == 0 and p.status == "sold"
    assert list(p.movements.values_list("type", "quantity")) == [("sale", -1), ("opening", 1)]
    r = sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}])
    assert r.status_code == 400 and r.data["code"] == "insufficient_stock"


def test_weights_cannot_be_edited_directly(manager, ring):
    r = manager.patch(f"{API}/products/{ring['id']}/", {"gross_weight": "5.000"}, format="json")
    assert r.status_code == 400


def test_adjustment_requires_reason_and_other_approver(clerk, manager, ring):
    r = clerk.post(f"{API}/adjustments/", {"product": ring["id"], "quantity_delta": -1, "reason": ""}, format="json")
    assert r.status_code == 400
    r = clerk.post(f"{API}/adjustments/", {"product": ring["id"], "quantity_delta": -1,
                                           "reason": "Piece damaged in display"}, format="json")
    assert r.status_code == 201, r.data
    adj = r.data["id"]
    assert clerk.post(f"{API}/adjustments/{adj}/decide/", {"approve": True}, format="json").status_code == 403
    assert Product.objects.get(pk=ring["id"]).quantity_on_hand == 1
    r = manager.post(f"{API}/adjustments/{adj}/decide/", {"approve": True}, format="json")
    assert r.status_code == 200 and r.data["status"] == "approved"
    assert Product.objects.get(pk=ring["id"]).quantity_on_hand == 0


def test_manager_cannot_self_approve(manager, ring):
    adj = manager.post(f"{API}/adjustments/", {"product": ring["id"], "quantity_delta": -1,
                                               "reason": "Lost item check"}, format="json").data["id"]
    r = manager.post(f"{API}/adjustments/{adj}/decide/", {"approve": True}, format="json")
    assert r.status_code == 400 and r.data["code"] == "segregation"


def test_stock_count_creates_pending_adjustments(clerk, owner, manager, ref):
    a = make_product(manager, ref, code="A1")
    b = make_product(manager, ref, code="B1")
    c = clerk.post(f"{API}/stock-counts/", {"name": "End of month"}, format="json").data
    assert c["progress"]["total"] == 2
    assert clerk.post(f"{API}/stock-counts/{c['id']}/scan/", {"barcode": "A1"}, format="json").status_code == 200
    r = clerk.post(f"{API}/stock-counts/{c['id']}/finalize/", {}, format="json")
    assert r.status_code == 200
    adjs = r.data["adjustments"]
    assert len(adjs) == 1 and adjs[0]["product"] == b["id"] and adjs[0]["quantity_delta"] == -1
    assert Product.objects.get(pk=b["id"]).quantity_on_hand == 1  # unchanged until approved
    owner.post(f"{API}/adjustments/{adjs[0]['id']}/decide/", {"approve": True}, format="json")
    assert Product.objects.get(pk=b["id"]).quantity_on_hand == 0


def test_movements_immutable(ring):
    m = StockMovement.objects.first()
    with pytest.raises(Exception):
        m.delete()


# ------------------------------------------------------------ sales, returns, exchange, credit

def test_full_return_restores_stock_and_refunds(cashier, manager, prices, ring, ref):
    inv = sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}]).data
    line = inv["lines"][0]["id"]
    assert cashier.post(f"{API}/sales/{inv['id']}/return/", {"items": [{"line": line, "quantity": 1}],
                                                             "reason": "Size"}, format="json").status_code == 403
    r = manager.post(f"{API}/sales/{inv['id']}/return/", {"items": [{"line": line, "quantity": 1}],
                                                          "reason": "Wrong size"}, format="json")
    assert r.status_code == 201, r.data
    assert r.data["amount"] == "33140.00"
    p = Product.objects.get(pk=ring["id"])
    assert p.quantity_on_hand == 1 and p.status == "available"
    assert SalesInvoice.objects.get(pk=inv["id"]).status == "returned"
    assert ref["cash"].ledger_balance() == 0


def test_exchange_old_gold_payout(cashier, prices, ring, ref):
    # Customer brings 15 g of 21K (3150/g = 47250) and buys the 33140 ring -> shop pays 14110
    body = {"lines": [{"product": ring["id"]}],
            "old_gold": [{"karat": ref["k21"].id, "weight": "15.000"}],
            "payments": [{"method": "cash", "amount": "-14110.00"}]}
    pre = cashier.post(f"{API}/sales/preview/", body, format="json").data
    assert pre["net_payable"] == "-14110.00" and pre["credit"] == "0.00"
    # needs cash in the drawer to pay out
    r = cashier.post(f"{API}/sales/", body, format="json")
    assert r.status_code == 400 and r.data["code"] == "insufficient_cash"


def test_credit_sale_within_limit(cashier, prices, ring):
    cust = cashier.post(f"{API}/customers/", {"name": "Ahmed", "phone": "0100", "credit_limit": "5000"},
                        format="json").data
    r = sell(cashier, ring["id"], [{"method": "card", "amount": "29000"}], customer=cust["id"])
    assert r.status_code == 201, r.data
    assert r.data["credit_amount"] == "4140.00"
    assert cashier.get(f"{API}/customers/{cust['id']}/").data["balance"] == "4140.00"
    r = cashier.post(f"{API}/customers/{cust['id']}/payment/", {"amount": "4140", "method": "cash"}, format="json")
    assert r.status_code == 200 and r.data["balance"] == "0.00"


def test_credit_limit_enforced(cashier, prices, ring):
    cust = cashier.post(f"{API}/customers/", {"name": "Mona", "credit_limit": "100"}, format="json").data
    r = sell(cashier, ring["id"], [{"method": "cash", "amount": "30000"}], customer=cust["id"])
    assert r.status_code == 400 and r.data["code"] == "credit_limit"


def test_cashier_discount_limit_and_override(cashier, prices, ring):
    r = sell(cashier, ring["id"], [], invoice_discount="5000")
    assert r.status_code == 400 and r.data["code"] == "discount_limit"
    body = {"lines": [{"product": ring["id"], "making_charge_value": "10"}]}
    r = cashier.post(f"{API}/sales/preview/", body, format="json")
    assert r.status_code == 400 and r.data["code"] == "forbidden_override"


def test_invoice_discount_allocated_and_reduces_vat(manager, prices, ring):
    body = {"lines": [{"product": ring["id"]}], "invoice_discount": "500"}
    pre = manager.post(f"{API}/sales/preview/", body, format="json").data
    # discount taken from making charge first: taxable 1000-500=500 -> VAT 70
    assert pre["vat_amount"] == "70.00"
    assert pre["grand_total"] == "32570.00"


def test_quantity_items_and_fixed_price_coin(manager, cashier, prices, ref):
    coin = make_product(manager, ref, name="جنيه ذهب", category=ref["coins"].id, tracking="quantity",
                        gross_weight="8.000", stone_weight="0", pricing_mode="fixed", selling_price="26000",
                        making_charge_type="fixed", opening_quantity=5, reorder_level=3)
    r = sell(cashier, coin["id"], [{"method": "cash", "amount": "52112.00"}], quantity=2)
    assert r.status_code == 201, r.data
    line = r.data["lines"][0]
    # 8g*3200=25600 gold, derived making 400/coin -> 800 ; VAT 14% on 800 = 112
    assert line["making_charge"] == "800.00" and line["vat_amount"] == "112.00" and line["total"] == "52112.00"
    assert Product.objects.get(pk=coin["id"]).quantity_on_hand == 3


# ------------------------------------------------------------ purchases & dashboard

def test_purchase_creates_stock_and_payable(manager, prices, ref):
    sup = manager.post(f"{API}/suppliers/", {"name": "ورشة النور"}, format="json").data
    body = {"supplier": sup["id"], "lines": [
        {"new_product": {"name": "سلسلة", "category": ref["rings"].id, "karat": ref["k18"].id,
                         "gross_weight": "5.000", "making_charge_value": "120"},
         "gold_price_per_gram": "2700", "making_cost_per_gram": "60"}],
        "payments": [{"method": "bank_transfer", "amount": "10000"}]}
    r = manager.post(f"{API}/purchases/", body, format="json")
    assert r.status_code == 201, r.data
    assert r.data["total"] == "13800.00" and r.data["credit_amount"] == "3800.00"
    assert manager.get(f"{API}/suppliers/{sup['id']}/").data["balance"] == "3800.00"
    pid = r.data["lines"][0]["product"]
    assert Product.objects.get(pk=pid).quantity_on_hand == 1


def test_dashboard_numbers_come_from_records(owner, cashier, prices, ring, ref):
    owner.post(f"{API}/transactions/movement/", {"account": ref["cash"].id, "type": "opening", "amount": "1000",
                                                 "description": "Float"}, format="json")
    sell(cashier, ring["id"], [{"method": "cash", "amount": "33140.00"}])
    raw = owner.get(f"{API}/reports/dashboard/")
    assert b'"gross_sales": "33140.00"' in raw.content.replace(b'":"', b'": "')  # exact decimal strings on the wire
    d = raw.data
    t = d["today"]
    assert t["gross_sales"] == D("33140.00")
    assert t["vat"] == D("140.00")
    assert t["gross_profit"] == D("33000.00") - D("30000.00")
    assert d["balances"]["cash"] == D("34140.00")
    assert d["inventory"]["available_products"] == 0
    c = cashier.get(f"{API}/reports/dashboard/").data
    assert "balances" not in c


def test_exchange_payout_succeeds_with_cash_and_records_scrap(owner, cashier, prices, ring, ref):
    owner.post(f"{API}/transactions/movement/", {"account": ref["cash"].id, "type": "opening", "amount": "20000",
                                                 "description": "Float"}, format="json")
    body = {"lines": [{"product": ring["id"]}], "old_gold": [{"karat": ref["k21"].id, "weight": "15.000"}],
            "payments": [{"method": "cash", "amount": "-14110.00"}]}
    r = cashier.post(f"{API}/sales/", body, format="json")
    assert r.status_code == 201, r.data
    assert r.data["old_gold_value"] == "47250.00" and r.data["net_payable"] == "-14110.00"
    assert ref["cash"].ledger_balance() == D("5890.00")
    val = {v["karat"]: v for v in owner.get(f"{API}/inventory/valuation/").data}
    assert val["21"]["scrap_weight"] == D("15.000")


def test_expense_and_void_restore_cash(owner, ref):
    owner.post(f"{API}/transactions/movement/", {"account": ref["cash"].id, "type": "opening", "amount": "1000",
                                                 "description": "Float"}, format="json")
    cat = owner.get(f"{API}/expense-categories/").data[0]["id"]
    e = owner.post(f"{API}/expenses/", {"category": cat, "amount": "250", "account": ref["cash"].id,
                                        "date": "2026-11-27", "description": "Electricity"}, format="json")
    assert e.status_code == 201, e.data
    assert ref["cash"].ledger_balance() == D("750.00")
    assert owner.post(f"{API}/expenses/{e.data['id']}/void/", {"reason": "Entered twice"}, format="json").status_code == 200
    assert ref["cash"].ledger_balance() == D("1000.00")
    assert owner.post(f"{API}/expenses/{e.data['id']}/void/", {"reason": "Entered twice"}, format="json").status_code == 400


def test_purchase_return_reduces_stock_and_payable(manager, ref):
    sup = manager.post(f"{API}/suppliers/", {"name": "Supplier"}, format="json").data
    coin = make_product(manager, ref, name="Coin", category=ref["coins"].id, tracking="quantity", gross_weight="8",
                        stone_weight="0", opening_quantity=0)
    inv = manager.post(f"{API}/purchases/", {"supplier": sup["id"], "lines": [
        {"product": coin["id"], "quantity": 4, "unit_cost": "26000"}]}, format="json").data
    assert Product.objects.get(pk=coin["id"]).quantity_on_hand == 4
    r = manager.post(f"{API}/purchases/{inv['id']}/return/", {"line": inv["lines"][0]["id"], "quantity": 1,
                                                               "reason": "Scratched"}, format="json")
    assert r.status_code == 201, r.data
    assert Product.objects.get(pk=coin["id"]).quantity_on_hand == 3
    assert manager.get(f"{API}/suppliers/{sup['id']}/").data["balance"] == "78000.00"
