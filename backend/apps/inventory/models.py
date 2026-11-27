from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import MONEY, PRICE, WEIGHT, ImmutableModel, TimeStamped, money_field, weight_field
from apps.parties.models import Supplier
from apps.pricing.models import Karat
from gold_engine import MakingChargeType, net_weight


class Category(TimeStamped):
    code = models.SlugField(max_length=40, unique=True)
    name_ar = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name_en"]
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name_en


class JewelryType(TimeStamped):
    """Style/origin classification: Italian, Gulf, Turkish, plain, with stones..."""
    code = models.SlugField(max_length=40, unique=True)
    name_ar = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_en"]

    def __str__(self):
        return self.name_en


class Product(TimeStamped):
    class Tracking(models.TextChoices):
        PIECE = "piece", "Serialized piece"
        QUANTITY = "quantity", "Quantity based"

    class PricingMode(models.TextChoices):
        BY_WEIGHT = "by_weight", "Gold price × weight + making charge"
        FIXED = "fixed", "Fixed price (making charge derived)"

    class Status(models.TextChoices):
        AVAILABLE = "available", "Available"
        RESERVED = "reserved", "Reserved"
        SOLD = "sold", "Sold"
        RETURNED_TO_SUPPLIER = "returned_to_supplier", "Returned to supplier"
        INACTIVE = "inactive", "Inactive"

    code = models.CharField(max_length=40, unique=True)
    barcode = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=200)
    name_en = models.CharField(max_length=200, blank=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    jewelry_type = models.ForeignKey(JewelryType, null=True, blank=True, on_delete=models.PROTECT)
    karat = models.ForeignKey(Karat, on_delete=models.PROTECT, related_name="products")
    tracking = models.CharField(max_length=10, choices=Tracking.choices, default=Tracking.PIECE)

    # per-unit weights (grams)
    gross_weight = models.DecimalField(**WEIGHT)
    stone_weight = weight_field()
    net_weight = models.DecimalField(**WEIGHT, editable=False)

    quantity_on_hand = models.IntegerField(default=0, editable=False)
    reorder_level = models.PositiveIntegerField(default=0)

    pricing_mode = models.CharField(max_length=10, choices=PricingMode.choices, default=PricingMode.BY_WEIGHT)
    making_charge_type = models.CharField(
        max_length=10, choices=[(m.value, m.name.title()) for m in MakingChargeType], default=MakingChargeType.PER_GRAM
    )
    making_charge_value = models.DecimalField(**PRICE, default=Decimal("0"))
    stones_value = money_field(help_text="Gemstone value per unit, EGP")
    selling_price = models.DecimalField(**MONEY, null=True, blank=True,
                                        help_text="Fixed price per unit before VAT (pricing_mode=fixed)")
    purchase_cost = money_field(help_text="Total cost per unit, EGP")

    supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.PROTECT, related_name="products")
    purchase_date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to="products/%Y/%m/", null=True, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.AVAILABLE, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["karat", "status"]), models.Index(fields=["category", "status"])]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity_on_hand__gte=0), name="product_qty_non_negative"),
            models.CheckConstraint(condition=models.Q(gross_weight__gt=0), name="product_gross_positive"),
        ]

    def __str__(self):
        return f"{self.code} {self.name}"

    def save(self, *args, **kwargs):
        self.net_weight = net_weight(self.gross_weight, self.stone_weight or 0)
        if not self.barcode:
            self.barcode = self.code
        super().save(*args, **kwargs)

    @property
    def total_net_weight(self) -> Decimal:
        return self.net_weight * self.quantity_on_hand


class StockMovement(ImmutableModel):
    class Type(models.TextChoices):
        OPENING = "opening", "Opening balance"
        PURCHASE = "purchase", "Purchase"
        SALE = "sale", "Sale"
        SALE_RETURN = "sale_return", "Sales return"
        PURCHASE_RETURN = "purchase_return", "Return to supplier"
        ADJUSTMENT = "adjustment", "Approved adjustment"
        WEIGHT_CORRECTION = "weight_correction", "Weight correction"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="movements")
    type = models.CharField(max_length=20, choices=Type.choices, db_index=True)
    quantity = models.IntegerField(help_text="Signed: + in, - out")
    net_weight = models.DecimalField(**WEIGHT, help_text="Signed net gold weight moved")
    unit_cost = money_field()
    quantity_after = models.IntegerField()
    ref_type = models.CharField(max_length=40, blank=True)
    ref_id = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["product", "-created_at"]), models.Index(fields=["ref_type", "ref_id"])]


class InventoryAdjustment(TimeStamped):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending approval"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name="adjustments")
    quantity_delta = models.IntegerField(default=0)
    new_gross_weight = models.DecimalField(**WEIGHT, null=True, blank=True)
    new_stone_weight = models.DecimalField(**WEIGHT, null=True, blank=True)
    reason = models.CharField(max_length=500)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True)
    stock_count = models.ForeignKey("StockCount", null=True, blank=True, on_delete=models.PROTECT,
                                    related_name="adjustments")

    class Meta:
        ordering = ["-created_at"]


class StockCount(TimeStamped):
    class Status(models.TextChoices):
        OPEN = "open", "In progress"
        FINALIZED = "finalized", "Finalized"
        CANCELLED = "cancelled", "Cancelled"

    name = models.CharField(max_length=150)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT,
                                 help_text="Limit count to one category (optional)")
    started_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                     related_name="+")
    finalized_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]


class StockCountLine(models.Model):
    count = models.ForeignKey(StockCount, on_delete=models.CASCADE, related_name="lines")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    expected_quantity = models.IntegerField()
    counted_quantity = models.IntegerField(null=True, blank=True)
    counted_gross_weight = models.DecimalField(**WEIGHT, null=True, blank=True)
    counted_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="+")
    counted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("count", "product")]

    @property
    def difference(self):
        return None if self.counted_quantity is None else self.counted_quantity - self.expected_quantity


class ScrapGoldMovement(ImmutableModel):
    """Old/broken gold received from customers (exchange/buy-back) or sent to
    refinery. Tracked by karat and weight, not as sellable products."""

    class Type(models.TextChoices):
        RECEIVED = "received", "Received from customer"
        SENT_TO_REFINERY = "sent_to_refinery", "Sent to refinery / sold"
        ADJUSTMENT = "adjustment", "Adjustment"

    karat = models.ForeignKey(Karat, on_delete=models.PROTECT)
    type = models.CharField(max_length=20, choices=Type.choices)
    weight = models.DecimalField(**WEIGHT, help_text="Signed grams")
    value = money_field(help_text="Signed EGP cost basis")
    ref_type = models.CharField(max_length=40, blank=True)
    ref_id = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
