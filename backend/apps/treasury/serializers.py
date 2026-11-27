from decimal import Decimal

from rest_framework import serializers

from .models import Expense, ExpenseCategory, MoneyAccount, MoneyTransaction


class MoneyAccountSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(max_digits=16, decimal_places=2, read_only=True)

    class Meta:
        model = MoneyAccount
        fields = ["id", "name", "kind", "bank_name", "account_number", "is_default", "is_active", "balance"]


class MoneyTransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source="account.name", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default=None)

    class Meta:
        model = MoneyTransaction
        fields = ["id", "account", "account_name", "type", "type_display", "method", "amount", "description",
                  "reference_no", "ref_type", "ref_id", "created_by_name", "created_at"]


class ExpenseCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ExpenseCategory
        fields = ["id", "name_ar", "name_en", "is_active"]


class ExpenseSerializer(serializers.ModelSerializer):
    category_name_ar = serializers.CharField(source="category.name_ar", read_only=True)
    category_name_en = serializers.CharField(source="category.name_en", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)

    class Meta:
        model = Expense
        fields = ["id", "number", "category", "category_name_ar", "category_name_en", "amount", "account",
                  "account_name", "date", "description", "is_void", "void_reason", "created_at"]
        read_only_fields = ["number", "is_void", "void_reason"]


class TransferSerializer(serializers.Serializer):
    source = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True))
    destination = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True))
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    note = serializers.CharField(required=False, allow_blank=True, max_length=200)


class CashMovementSerializer(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(queryset=MoneyAccount.objects.filter(is_active=True))
    type = serializers.ChoiceField(choices=["opening", "deposit", "withdrawal"])
    amount = serializers.DecimalField(max_digits=16, decimal_places=2, min_value=Decimal("0.01"))
    description = serializers.CharField(max_length=300)
