from decimal import Decimal as D

import pytest

from gold_engine import (
    EngineError,
    OldGoldInput,
    SaleLineInput,
    calculate_invoice_totals,
    calculate_old_gold,
    calculate_sale_line,
    convert_weight,
    inventory_value,
    net_weight,
    price_for_karat,
    pure_gold_weight,
)


def test_rejects_floats():
    with pytest.raises(EngineError):
        net_weight(10.5, "0")


def test_net_weight():
    assert net_weight("12.345", "1.2") == D("11.145")
    with pytest.raises(EngineError):
        net_weight("1", "2")
    with pytest.raises(EngineError):
        net_weight("-1", "0")


def test_pure_and_conversion():
    assert pure_gold_weight("10", "0.875") == D("8.750")
    # 10g 18K -> 21K equivalent
    assert convert_weight("10", "0.750", "0.875") == D("8.571")
    assert convert_weight("8.75", "1", "0.875") == D("10.000")
    with pytest.raises(EngineError):
        pure_gold_weight("1", "1.2")


def test_price_for_karat():
    assert price_for_karat("4000", "0.875", "0.750") == D("3428.57")


def test_sale_line_per_gram_with_vat_on_making_only():
    r = calculate_sale_line(SaleLineInput(
        net_weight="10.250", price_per_gram="3215.50",
        making_charge_type="per_gram", making_charge_value="150", vat_rate="14",
    ))
    assert r.gold_value == D("32958.88")       # 10.25 * 3215.50 = 32958.875 -> .88
    assert r.making_charge == D("1537.50")
    assert r.taxable_amount == D("1537.50")
    assert r.vat_amount == D("215.25")
    assert r.total == D("34711.63")


def test_sale_line_discount_taken_from_making_first_reduces_vat():
    r = calculate_sale_line(SaleLineInput(
        net_weight="5", price_per_gram="3000", making_charge_value="100",
        discount="200", vat_rate="14",
    ))
    assert r.making_charge == D("500.00")
    assert r.taxable_amount == D("300.00")
    assert r.vat_amount == D("42.00")
    assert r.total == D("15342.00")


def test_sale_line_fixed_and_percent_and_quantity():
    r = calculate_sale_line(SaleLineInput(
        net_weight="8", price_per_gram="3500", quantity=3,
        making_charge_type="fixed", making_charge_value="250",
    ))
    assert r.total_net_weight == D("24.000")
    assert r.making_charge == D("750.00")
    assert r.total == D("84750.00")
    p = calculate_sale_line(SaleLineInput(
        net_weight="1", price_per_gram="1000", making_charge_type="percent", making_charge_value="7.5",
    ))
    assert p.making_charge == D("75.00")


def test_sale_line_validation():
    with pytest.raises(EngineError):
        calculate_sale_line(SaleLineInput(net_weight="1", price_per_gram="100", discount="1000"))
    with pytest.raises(EngineError):
        calculate_sale_line(SaleLineInput(net_weight="1", price_per_gram="100", quantity=0))
    with pytest.raises(EngineError):
        calculate_sale_line(SaleLineInput(net_weight="1", price_per_gram="100", making_charge_type="x"))


def test_old_gold():
    r = calculate_old_gold(OldGoldInput(weight="20", buy_price_per_gram="3100",
                                        deduction_per_gram="20", deduction_percent="1"))
    assert r.accepted_weight == D("19.800")
    assert r.effective_price_per_gram == D("3080.00")
    assert r.value == D("60984.00")


def test_invoice_totals_with_exchange_and_payments():
    a = calculate_sale_line(SaleLineInput(net_weight="10", price_per_gram="3200", making_charge_value="100", vat_rate="14"))
    b = calculate_sale_line(SaleLineInput(net_weight="2", price_per_gram="3200", making_charge_type="fixed", making_charge_value="50"))
    og = calculate_old_gold(OldGoldInput(weight="5", buy_price_per_gram="3100"))
    t = calculate_invoice_totals([a, b], [og], invoice_discount="40", payments=["10000", "5000"])
    assert a.total == D("33140.00")
    assert b.total == D("6450.00")
    assert t.total_weight == D("12.000")
    assert t.grand_total == D("39550.00")
    assert t.old_gold_value == D("15500.00")
    assert t.net_payable == D("24050.00")
    assert t.balance_due == D("9050.00")


def test_inventory_value():
    assert inventory_value("100.125", "3200") == D("320400.00")
