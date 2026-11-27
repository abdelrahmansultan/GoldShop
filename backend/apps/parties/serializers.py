from decimal import Decimal

from rest_framework import serializers

from apps.treasury.models import MoneyAccount, PaymentMethod

from .models import Customer, Supplier


class CustomerSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "national_id", "address", "notes", "is_active", "credit_limit", "balance",
                  "created_at"]


class SupplierSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = Supplier
        fields = ["id", "name", "phone", "national_id", "address", "notes", "is_active", "tax_registration_no",
                  "balance", "created_at"]


class LedgerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=16, decimal_places=2)
    description = serializers.CharField()
    ref_type = serializers.CharField()
    ref_id = serializers.CharField()
    created_at = serializers.DateTimeField()


class PartyPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    method = serializers.ChoiceField(choices=PaymentMethod.choices)
    account = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True), required=False)
    reference_no = serializers.CharField(required=False, allow_blank=True, max_length=100)
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)


