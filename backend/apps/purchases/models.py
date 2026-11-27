from django.conf import settings
from django.db import models

from apps.core.models import MONEY, PRICE, WEIGHT, TimeStamped, money_field, weight_field
from apps.inventory.models import Product
from apps.parties.models import Supplier
from apps.pricing.models import Karat
from apps.treasury.models import MoneyAccount, PaymentMethod


class PurchaseInvoice(TimeStamped):
    number = models.CharField(max_length=30, unique=True)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="purchases")
    supplier_invoice_no = models.CharField(max_length=60, blank=True)
    date = models.DateField(db_index=True)
    total_weight = weight_field()
    subtotal = money_field()
    vat_amount = money_field()
    total = money_field()
    paid_amount = money_field()
    credit_amount = money_field(help_text="Owed to supplier from this invoice")
    notes = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]


class PurchaseLine(models.Model):
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="purchase_lines")
    karat = models.ForeignKey(Karat, on_delete=models.PROTECT)
    quantity = models.PositiveIntegerField()
    net_weight = models.DecimalField(**WEIGHT, help_text="Per unit")
    gold_price_per_gram = models.DecimalField(**PRICE, default=0)
    making_cost_per_gram = models.DecimalField(**PRICE, default=0)
    other_cost = models.DecimalField(**MONEY, default=0)
    unit_cost = models.DecimalField(**MONEY)
    line_total = models.DecimalField(**MONEY)
    returned_quantity = models.PositiveIntegerField(default=0)


class PurchasePayment(models.Model):
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    account = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT)
    amount = models.DecimalField(**MONEY)
    reference_no = models.CharField(max_length=100, blank=True)


class PurchaseReturn(TimeStamped):
    number = models.CharField(max_length=30, unique=True)
    invoice = models.ForeignKey(PurchaseInvoice, on_delete=models.PROTECT, related_name="returns")
    line = models.ForeignKey(PurchaseLine, on_delete=models.PROTECT, related_name="returns")
    quantity = models.PositiveIntegerField()
    amount = models.DecimalField(**MONEY)
    reason = models.CharField(max_length=300)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
