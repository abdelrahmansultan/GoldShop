from decimal import Decimal

from rest_framework import serializers

from .models import GoldPrice, Karat, PriceSource


class KaratSerializer(serializers.ModelSerializer):
    class Meta:
        model = Karat
        fields = ["id", "code", "name_ar", "name_en", "purity", "is_active", "sort_order"]


class PriceSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PriceSource
        fields = ["id", "name", "kind", "provider_key", "is_active", "notes", "last_success_at", "last_error",
                  "last_error_at"]
        read_only_fields = ["last_success_at", "last_error", "last_error_at"]


class GoldPriceSerializer(serializers.ModelSerializer):
    karat_code = serializers.CharField(source="karat.code", read_only=True)
    source_name = serializers.CharField(source="source.name", read_only=True)
    entered_by_name = serializers.CharField(source="entered_by.display_name", read_only=True, default=None)
    prev_buy = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=None)
    prev_sell = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, default=None)
    buy_change = serializers.SerializerMethodField()
    sell_change = serializers.SerializerMethodField()

    class Meta:
        model = GoldPrice
        fields = ["id", "karat", "karat_code", "buy_price", "sell_price", "prev_buy", "prev_sell", "buy_change",
                  "sell_change", "source", "source_name", "effective_at", "entered_by", "entered_by_name", "note",
                  "created_at"]

    @staticmethod
    def _diff(new, old):
        return None if old is None else str(new - old)

    def get_buy_change(self, o):
        return self._diff(o.buy_price, getattr(o, "prev_buy", None))

    def get_sell_change(self, o):
        return self._diff(o.sell_price, getattr(o, "prev_sell", None))


class PriceEntrySerializer(serializers.Serializer):
    karat = serializers.PrimaryKeyRelatedField(queryset=Karat.objects.filter(is_active=True))
    buy_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))
    sell_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0.01"))


class BulkPriceSerializer(serializers.Serializer):
    entries = PriceEntrySerializer(many=True)
    source = serializers.PrimaryKeyRelatedField(queryset=PriceSource.objects.filter(is_active=True), required=False)
    effective_at = serializers.DateTimeField(required=False)
    note = serializers.CharField(required=False, allow_blank=True, max_length=300)
