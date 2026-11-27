from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction

MONEY = dict(max_digits=16, decimal_places=2)
WEIGHT = dict(max_digits=12, decimal_places=3)
PRICE = dict(max_digits=12, decimal_places=2)


def money_field(**kw):
    return models.DecimalField(default=Decimal("0.00"), **MONEY, **kw)


def weight_field(**kw):
    return models.DecimalField(default=Decimal("0.000"), **WEIGHT, **kw)


class TimeStamped(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class ImmutableError(ValidationError):
    pass


class ImmutableQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ImmutableError("This record type is append-only and cannot be updated.")

    def delete(self):
        raise ImmutableError("This record type is append-only and cannot be deleted.")


class ImmutableModel(models.Model):
    """Append-only ledger rows: stock movements, price history, money
    transactions, audit log. Corrections are made with reversing entries."""

    objects = ImmutableQuerySet.as_manager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if self.pk is not None and not kwargs.pop("_allow_update", False):
            raise ImmutableError(f"{self.__class__.__name__} is append-only and cannot be modified.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ImmutableError(f"{self.__class__.__name__} is append-only and cannot be deleted.")


class AuditLog(ImmutableModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    action = models.CharField(max_length=64, db_index=True)
    entity = models.CharField(max_length=64, db_index=True)
    entity_id = models.CharField(max_length=64, blank=True, db_index=True)
    summary = models.CharField(max_length=500, blank=True)
    data = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]


class DocumentSequence(models.Model):
    """Gap-free per-prefix, per-year document numbers (e.g. INV-2026-000123)."""

    prefix = models.CharField(max_length=10)
    year = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = [("prefix", "year")]

    @classmethod
    def next(cls, prefix: str, year: int) -> str:
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(prefix=prefix, year=year)
            seq.last_number += 1
            seq.save(update_fields=["last_number"])
            return f"{prefix}-{year}-{seq.last_number:06d}"


class ShopSettings(models.Model):
    """Singleton (pk=1) holding shop identity and calculation policy."""

    name_ar = models.CharField(max_length=200, default="محل الذهب")
    name_en = models.CharField(max_length=200, default="Gold Shop")
    address = models.CharField(max_length=300, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    tax_registration_no = models.CharField(max_length=50, blank=True)
    commercial_registration_no = models.CharField(max_length=50, blank=True)
    currency = models.CharField(max_length=3, default="EGP", editable=False)
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("14.00"))
    vat_on_making_charge = models.BooleanField(default=True)
    vat_on_gold = models.BooleanField(default=False)
    vat_on_stones = models.BooleanField(default=True)
    default_making_charge_per_gram = models.DecimalField(**PRICE, default=Decimal("0.00"))
    max_discount_percent_cashier = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("5.00"))
    price_stale_after_hours = models.PositiveIntegerField(default=24)
    require_daily_price = models.BooleanField(
        default=True, help_text="Block sales until today's gold prices are entered (Cairo date)")
    invoice_footer_ar = models.CharField(max_length=500, blank=True)
    invoice_footer_en = models.CharField(max_length=500, blank=True)
    logo = models.ImageField(upload_to="shop/", null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "ShopSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
