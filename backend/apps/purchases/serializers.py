from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import Category, JewelryType, Product
from apps.parties.models import Supplier
from apps.pricing.models import Karat
from apps.treasury.models import MoneyAccount, PaymentMethod

from .models import PurchaseInvoice, PurchaseLine, PurchasePayment, PurchaseReturn

D = dict(max_digits=16, decimal_places=2)


class NewProductIn(serializers.Serializer):
    code = serializers.CharField(required=False, allow_blank=True, max_length=40)
    barcode = serializers.CharField(required=False, allow_blank=True, max_length=64)
    name = serializers.CharField(max_length=200)
    name_en = serializers.CharField(required=False, allow_blank=True, max_length=200)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.filter(is_active=True))
    jewelry_type = serializers.PrimaryKeyRelatedField(queryset=JewelryType.objects.all(), required=False,
                                                      allow_null=True)
    karat = serializers.PrimaryKeyRelatedField(queryset=Karat.objects.filter(is_active=True))
    tracking = serializers.ChoiceField(choices=Product.Tracking.choices, default="piece")
    gross_weight = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    stone_weight = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=0, default=0)
    pricing_mode = serializers.ChoiceField(choices=Product.PricingMode.choices, default="by_weight")
    making_charge_type = serializers.ChoiceField(choices=["per_gram", "fixed", "percent"], default="per_gram")
    making_charge_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    stones_value = serializers.DecimalField(**D, min_value=0, default=0)
    selling_price = serializers.DecimalField(**D, required=False, allow_null=True)
    reorder_level = serializers.IntegerField(min_value=0, default=0)
    description = serializers.CharField(required=False, allow_blank=True)

    def validate(self, a):
        for f in ("code", "barcode"):
            if a.get(f) and Product.objects.filter(**{f: a[f]}).exists():
                raise serializers.ValidationError({f: "Already in use."})
        return a


class PurchaseLineIn(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False, allow_null=True)
    new_product = NewProductIn(required=False)
    quantity = serializers.IntegerField(min_value=1, default=1)
    unit_cost = serializers.DecimalField(**D, required=False, allow_null=True, min_value=0)
    gold_price_per_gram = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    making_cost_per_gram = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    other_cost = serializers.DecimalField(**D, min_value=0, default=0)

    def validate(self, a):
        if bool(a.get("product")) == bool(a.get("new_product")):
            raise serializers.ValidationError("Each line needs either an existing product or a new product.")
        return a


class PurchasePaymentIn(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    account = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True), required=False,
                                                 allow_null=True)
    amount = serializers.DecimalField(**D, min_value=Decimal("0.01"))
    reference_no = serializers.CharField(required=False, allow_blank=True)


class PurchaseIn(serializers.Serializer):
    supplier = serializers.PrimaryKeyRelatedField(queryset=Supplier.objects.filter(is_active=True))
    supplier_invoice_no = serializers.CharField(required=False, allow_blank=True)
    date = serializers.DateField(required=False)
    lines = PurchaseLineIn(many=True)
    vat_amount = serializers.DecimalField(**D, min_value=0, default=0)
    payments = PurchasePaymentIn(many=True, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class PurchaseLineSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    karat_code = serializers.CharField(source="karat.code", read_only=True)

    class Meta:
        model = PurchaseLine
        exclude = ["invoice"]


class PurchasePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchasePayment
        exclude = ["invoice"]


class PurchaseInvoiceSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    lines = PurchaseLineSerializer(many=True, read_only=True)
    payments = PurchasePaymentSerializer(many=True, read_only=True)

    class Meta:
        model = PurchaseInvoice
        fields = ["id", "number", "supplier", "supplier_name", "supplier_invoice_no", "date", "total_weight",
                  "subtotal", "vat_amount", "total", "paid_amount", "credit_amount", "notes", "lines", "payments",
                  "created_at"]


class PurchaseReturnIn(serializers.Serializer):
    line = serializers.PrimaryKeyRelatedField(queryset=PurchaseLine.objects.all())
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(max_length=300)


class PurchaseReturnSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseReturn
        fields = ["id", "number", "invoice", "line", "quantity", "amount", "reason", "created_at"]
