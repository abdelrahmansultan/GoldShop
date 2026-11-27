from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.core.models import MONEY, ImmutableModel, TimeStamped


class Party(TimeStamped):
    name = models.CharField(max_length=200, db_index=True)
    phone = models.CharField(max_length=30, blank=True, db_index=True)
    national_id = models.CharField(max_length=20, blank=True, db_index=True)
    address = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True
        ordering = ["name"]

    def __str__(self):
        return self.name


class Customer(Party):
    credit_limit = models.DecimalField(**MONEY, default=0, help_text="0 = no credit sales allowed")

    def ledger_balance(self):
        """Positive: customer owes the shop."""
        return self.ledger.aggregate(s=Sum("amount"))["s"] or 0


class Supplier(Party):
    tax_registration_no = models.CharField(max_length=50, blank=True)

    def ledger_balance(self):
        """Positive: shop owes the supplier."""
        return self.ledger.aggregate(s=Sum("amount"))["s"] or 0


class LedgerEntryBase(ImmutableModel):
    amount = models.DecimalField(**MONEY)
    description = models.CharField(max_length=300)
    ref_type = models.CharField(max_length=40, blank=True)
    ref_id = models.CharField(max_length=40, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        abstract = True
        ordering = ["-created_at", "-id"]


class CustomerLedger(LedgerEntryBase):
    """+ invoice on credit, - payment received / return credit."""
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="ledger")


class SupplierLedger(LedgerEntryBase):
    """+ purchase on credit, - payment made / purchase return."""
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="ledger")
