from decimal import Decimal

from rest_framework import serializers

from apps.inventory.models import Product
from apps.parties.models import Customer
from apps.pricing.models import Karat
from apps.treasury.models import MoneyAccount, PaymentMethod

from .models import InvoicePayment, OldGoldLine, SalesInvoice, SalesInvoiceLine, SalesReturn

D = dict(max_digits=16, decimal_places=2)


class SaleLineIn(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.select_related("karat"))
    quantity = serializers.IntegerField(min_value=1, default=1)
    discount = serializers.DecimalField(**D, min_value=0, required=False, default=0)
    price_per_gram = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
    making_charge_type = serializers.ChoiceField(choices=["per_gram", "fixed", "percent"], required=False)
    making_charge_value = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False,
                                                   allow_null=True)


class OldGoldIn(serializers.Serializer):
    karat = serializers.PrimaryKeyRelatedField(queryset=Karat.objects.filter(is_active=True))
    weight = serializers.DecimalField(max_digits=12, decimal_places=3, min_value=Decimal("0.001"))
    deduction_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, default=0)
    deduction_per_gram = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    description = serializers.CharField(required=False, allow_blank=True, max_length=200)


class PaymentIn(serializers.Serializer):
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    account = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True), required=False,
                                                 allow_null=True)
    amount = serializers.DecimalField(**D)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)


class SaleIn(serializers.Serializer):
    customer = serializers.PrimaryKeyRelatedField(queryset=Customer.objects.filter(is_active=True), required=False,
                                                  allow_null=True)
    customer_name = serializers.CharField(required=False, allow_blank=True, max_length=200)
    customer_phone = serializers.CharField(required=False, allow_blank=True, max_length=30)
    lines = SaleLineIn(many=True)
    old_gold = OldGoldIn(many=True, required=False)
    invoice_discount = serializers.DecimalField(**D, min_value=0, default=0)
    payments = PaymentIn(many=True, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=500)


class InvoiceLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalesInvoiceLine
        exclude = ["invoice"]


class OldGoldLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = OldGoldLine
        exclude = ["invoice"]


class InvoicePaymentSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = InvoicePayment
        fields = ["id", "method", "account", "account_name", "amount", "reference_no"]


class SalesInvoiceListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True)
    items = serializers.IntegerField(source="lines.count", read_only=True)

    class Meta:
        model = SalesInvoice
        fields = ["id", "number", "issued_at", "customer", "customer_name", "status", "total_weight", "grand_total",
                  "old_gold_value", "net_payable", "paid_amount", "credit_amount", "vat_amount", "created_by_name",
                  "items"]


class SalesInvoiceSerializer(SalesInvoiceListSerializer):
    lines = InvoiceLineSerializer(many=True, read_only=True)
    old_gold = OldGoldLineSerializer(many=True, read_only=True)
    payments = InvoicePaymentSerializer(many=True, read_only=True)
    returns = serializers.SerializerMethodField()

    class Meta(SalesInvoiceListSerializer.Meta):
        fields = SalesInvoiceListSerializer.Meta.fields + [
            "customer_phone", "gold_value", "making_charge", "stones_value", "line_discount", "invoice_discount",
            "vat_rate", "vat_policy", "notes", "lines", "old_gold", "payments", "returns", "cost_of_goods"]

    def get_returns(self, obj):
        return [{"id": r.id, "number": r.number, "amount": str(r.amount), "created_at": r.created_at,
                 "settlement": r.settlement} for r in obj.returns.all()]

    def to_representation(self, obj):
        d = super().to_representation(obj)
        req = self.context.get("request")
        if req and not req.user.has_cap("inventory.view_cost"):
            d.pop("cost_of_goods", None)
            for l in d["lines"]:
                l.pop("unit_cost", None)
        return d


class ReturnItemIn(serializers.Serializer):
    line = serializers.PrimaryKeyRelatedField(queryset=SalesInvoiceLine.objects.all())
    quantity = serializers.IntegerField(min_value=1)


class ReturnIn(serializers.Serializer):
    items = ReturnItemIn(many=True)
    reason = serializers.CharField(max_length=300)
    settlement = serializers.ChoiceField(choices=SalesReturn.Settlement.choices, default="refund")
    refund_method = serializers.ChoiceField(choices=PaymentMethod.choices, default="cash")
    refund_account = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True),
                                                        required=False, allow_null=True)


class SalesReturnSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    lines = serializers.SerializerMethodField()

    class Meta:
        model = SalesReturn
        fields = ["id", "number", "invoice", "invoice_number", "reason", "settlement", "refund_method", "amount",
                  "vat_amount", "created_at", "lines"]

    def get_lines(self, obj):
        return [{"product_code": l.invoice_line.product_code, "description": l.invoice_line.description,
                 "quantity": l.quantity, "amount": str(l.amount)} for l in obj.lines.select_related("invoice_line")]


