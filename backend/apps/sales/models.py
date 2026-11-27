from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import MONEY, PRICE, WEIGHT, TimeStamped, money_field, weight_field
from apps.inventory.models import Product
from apps.parties.models import Customer
from apps.pricing.models import GoldPrice, Karat
from apps.treasury.models import MoneyAccount, PaymentMethod


class SalesInvoice(TimeStamped):
    """Posted invoices are never edited. Every figure is a snapshot taken at
    issue time, so later price or settings changes cannot alter history."""

    class Status(models.TextChoices):
        POSTED = "posted", "Posted"
        PARTIALLY_RETURNED = "partially_returned", "Partially returned"
        RETURNED = "returned", "Fully returned"

    number = models.CharField(max_length=30, unique=True)
    issued_at = models.DateTimeField(db_index=True)
    customer = models.ForeignKey(Customer, null=True, blank=True, on_delete=models.PROTECT, related_name="invoices")
    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.POSTED, db_index=True)

    total_weight = weight_field()
    gold_value = money_field()
    making_charge = money_field()
    stones_value = money_field()
    line_discount = money_field()
    invoice_discount = money_field()
    vat_amount = money_field()
    grand_total = money_field()
    old_gold_value = money_field()
    net_payable = money_field()
    paid_amount = money_field()
    credit_amount = money_field(help_text="Amount put on the customer's account")
    cost_of_goods = money_field()

    vat_rate = models.DecimalField(max_digits=5, decimal_places=2)
    vat_policy = models.JSONField(default=dict)
    notes = models.CharField(max_length=500, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-issued_at", "-id"]

    def __str__(self):
        return self.number

    @property
    def revenue_ex_vat(self) -> Decimal:
        return self.grand_total - self.vat_amount


class SalesInvoiceLine(models.Model):
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="sale_lines")
    product_code = models.CharField(max_length=40)
    description = models.CharField(max_length=300)
    karat = models.ForeignKey(Karat, on_delete=models.PROTECT)
    karat_code = models.CharField(max_length=10)
    purity = models.DecimalField(max_digits=5, decimal_places=4)
    gold_price = models.ForeignKey(GoldPrice, on_delete=models.PROTECT, related_name="+")
    price_per_gram = models.DecimalField(**PRICE)
    price_overridden = models.BooleanField(default=False)
    quantity = models.PositiveIntegerField()
    gross_weight = models.DecimalField(**WEIGHT)
    stone_weight = models.DecimalField(**WEIGHT)
    net_weight = models.DecimalField(**WEIGHT, help_text="Per unit")
    total_net_weight = models.DecimalField(**WEIGHT)
    making_charge_type = models.CharField(max_length=10)
    making_charge_value = models.DecimalField(**PRICE)
    gold_value = models.DecimalField(**MONEY)
    making_charge = models.DecimalField(**MONEY)
    stones_value = models.DecimalField(**MONEY)
    subtotal = models.DecimalField(**MONEY)
    discount = models.DecimalField(**MONEY)
    taxable_amount = models.DecimalField(**MONEY)
    vat_rate = models.DecimalField(max_digits=7, decimal_places=4)
    vat_amount = models.DecimalField(**MONEY)
    total = models.DecimalField(**MONEY)
    unit_cost = models.DecimalField(**MONEY)
    returned_quantity = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["id"]


class OldGoldLine(models.Model):
    """Customer's old gold accepted against this invoice (exchange / بدل)."""
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name="old_gold")
    karat = models.ForeignKey(Karat, on_delete=models.PROTECT)
    karat_code = models.CharField(max_length=10)
    gold_price = models.ForeignKey(GoldPrice, on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=200, blank=True)
    weight = models.DecimalField(**WEIGHT)
    deduction_percent = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    deduction_per_gram = models.DecimalField(**PRICE, default=0)
    accepted_weight = models.DecimalField(**WEIGHT)
    buy_price_per_gram = models.DecimalField(**PRICE)
    effective_price_per_gram = models.DecimalField(**PRICE)
    value = models.DecimalField(**MONEY)

    class Meta:
        ordering = ["id"]


class InvoicePayment(models.Model):
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    account = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT)
    amount = models.DecimalField(**MONEY, help_text="Signed: negative = paid out to customer")
    reference_no = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["id"]


class SalesReturn(TimeStamped):
    class Settlement(models.TextChoices):
        REFUND = "refund", "Refund money"
        CREDIT = "credit", "Credit customer account"

    number = models.CharField(max_length=30, unique=True)
    invoice = models.ForeignKey(SalesInvoice, on_delete=models.PROTECT, related_name="returns")
    reason = models.CharField(max_length=300)
    settlement = models.CharField(max_length=10, choices=Settlement.choices, default=Settlement.REFUND)
    refund_method = models.CharField(max_length=20, choices=PaymentMethod.choices, blank=True)
    refund_account = models.ForeignKey(MoneyAccount, null=True, blank=True, on_delete=models.PROTECT)
    amount = money_field()
    vat_amount = money_field()
    cost_of_goods = money_field()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-created_at"]


class SalesReturnLine(models.Model):
    sales_return = models.ForeignKey(SalesReturn, on_delete=models.PROTECT, related_name="lines")
    invoice_line = models.ForeignKey(SalesInvoiceLine, on_delete=models.PROTECT, related_name="return_lines")
    quantity = models.PositiveIntegerField()
    amount = models.DecimalField(**MONEY)
    vat_amount = models.DecimalField(**MONEY)
