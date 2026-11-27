import pytest
from django.core.management import CommandError, call_command

from apps.inventory.models import Product
from apps.sales.models import SalesInvoice
from apps.treasury.models import MoneyAccount


def test_seed_demo_builds_consistent_data(db):
    call_command("seed_demo", verbosity=0)
    assert SalesInvoice.objects.count() == 3
    assert Product.objects.get(code="R-1002").status == "sold"
    assert Product.objects.get(code="C-7001").quantity_on_hand == 8
    exchange = SalesInvoice.objects.get(customer__name="أحمد محمود")
    assert exchange.credit_amount == 5000 and exchange.old_gold_value > 0
    assert MoneyAccount.objects.get(kind="cash", is_default=True).ledger_balance() > 150000
    with pytest.raises(CommandError):
        call_command("seed_demo", verbosity=0)   # refuses to touch a database that already has sales
