from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.core.models import PRICE, ImmutableModel, TimeStamped


class Karat(TimeStamped):
    code = models.CharField(max_length=10, unique=True)  # "24", "21", "18", "14"...
    name_ar = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    purity = models.DecimalField(
        max_digits=5, decimal_places=4,
        validators=[MinValueValidator(Decimal("0.0001")), MaxValueValidator(Decimal("1"))],
        help_text="Fine gold fraction, e.g. 0.8750 for 21K",
    )
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "-purity"]

    def __str__(self):
        return f"{self.code}K"


class PriceSource(TimeStamped):
    class Kind(models.TextChoices):
        MANUAL = "manual", "Manual entry"
        PROVIDER = "provider", "External provider"

    name = models.CharField(max_length=100, unique=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.MANUAL)
    provider_key = models.CharField(max_length=50, blank=True, help_text="Registered provider id for kind=provider")
    is_active = models.BooleanField(default=True)
    notes = models.CharField(max_length=300, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=500, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return self.name


class GoldPrice(ImmutableModel):
    """One price observation for one karat. Never updated; a new row supersedes it.
    Invoices reference the exact row they used."""

    karat = models.ForeignKey(Karat, on_delete=models.PROTECT, related_name="prices")
    buy_price = models.DecimalField(**PRICE, help_text="EGP/gram the shop pays")
    sell_price = models.DecimalField(**PRICE, help_text="EGP/gram reference selling price (before making charge)")
    source = models.ForeignKey(PriceSource, on_delete=models.PROTECT)
    effective_at = models.DateTimeField(db_index=True)
    entered_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-effective_at", "-id"]
        indexes = [models.Index(fields=["karat", "-effective_at"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(buy_price__gt=0), name="goldprice_buy_positive"),
            models.CheckConstraint(condition=models.Q(sell_price__gt=0), name="goldprice_sell_positive"),
        ]

    def clean(self):
        if self.buy_price is not None and self.sell_price is not None and self.buy_price > self.sell_price:
            raise ValidationError("Buying price cannot be higher than selling price.")
