from rest_framework import serializers

from .models import (Category, InventoryAdjustment, JewelryType, Product, ScrapGoldMovement, StockCount,
                     StockCountLine, StockMovement)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "code", "name_ar", "name_en", "is_active", "sort_order"]


class JewelryTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = JewelryType
        fields = ["id", "code", "name_ar", "name_en", "is_active"]


COST_FIELDS = ("purchase_cost",)


class ProductSerializer(serializers.ModelSerializer):
    karat_code = serializers.CharField(source="karat.code", read_only=True)
    category_name_ar = serializers.CharField(source="category.name_ar", read_only=True)
    category_name_en = serializers.CharField(source="category.name_en", read_only=True)
    jewelry_type_name_en = serializers.CharField(source="jewelry_type.name_en", read_only=True, default=None)
    jewelry_type_name_ar = serializers.CharField(source="jewelry_type.name_ar", read_only=True, default=None)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    opening_quantity = serializers.IntegerField(write_only=True, required=False, min_value=0, default=0)
    code = serializers.CharField(required=False, allow_blank=True, max_length=40)
    barcode = serializers.CharField(required=False, allow_blank=True, max_length=64)

    class Meta:
        model = Product
        fields = ["id", "code", "barcode", "name", "name_en", "category", "category_name_ar", "category_name_en",
                  "jewelry_type", "jewelry_type_name_ar", "jewelry_type_name_en", "karat", "karat_code", "tracking",
                  "gross_weight", "stone_weight", "net_weight", "quantity_on_hand", "reorder_level", "pricing_mode",
                  "making_charge_type", "making_charge_value", "stones_value", "selling_price", "purchase_cost",
                  "supplier", "supplier_name", "purchase_date", "description", "image", "status", "created_at",
                  "updated_at", "opening_quantity"]
        read_only_fields = ["net_weight", "quantity_on_hand"]

    def validate(self, attrs):
        if self.instance is not None:
            # weights, karat and stock change only through approved adjustments
            for f in ("gross_weight", "stone_weight", "karat", "tracking"):
                if f in attrs and getattr(self.instance, f) != attrs[f]:
                    raise serializers.ValidationError(
                        {f: "This field can only be changed through an approved inventory adjustment."})
            if "status" in attrs and attrs["status"] in (Product.Status.SOLD, Product.Status.RETURNED_TO_SUPPLIER):
                raise serializers.ValidationError({"status": "Set by sales/returns only."})
        for f in ("code", "barcode"):
            v = attrs.get(f)
            if v:
                qs = Product.objects.filter(**{f: v})
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                if qs.exists():
                    raise serializers.ValidationError({f: "Already in use."})
        return attrs

    def to_representation(self, obj):
        d = super().to_representation(obj)
        req = self.context.get("request")
        if req and not req.user.has_cap("inventory.view_cost"):
            for f in COST_FIELDS:
                d.pop(f, None)
        return d


class ProductBriefSerializer(serializers.ModelSerializer):
    karat_code = serializers.CharField(source="karat.code", read_only=True)

    class Meta:
        model = Product
        fields = ["id", "code", "barcode", "name", "karat", "karat_code", "net_weight", "quantity_on_hand", "status"]


class StockMovementSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    type_display = serializers.CharField(source="get_type_display", read_only=True)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = ["id", "product", "product_code", "product_name", "type", "type_display", "quantity", "net_weight",
                  "unit_cost", "quantity_after", "ref_type", "ref_id", "note", "created_by_name", "created_at"]


class AdjustmentSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source="product.code", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)
    requested_by_name = serializers.CharField(source="requested_by.display_name", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.display_name", read_only=True, default=None)

    class Meta:
        model = InventoryAdjustment
        fields = ["id", "product", "product_code", "product_name", "quantity_delta", "new_gross_weight",
                  "new_stone_weight", "reason", "status", "requested_by", "requested_by_name", "decided_by_name", "decided_at",
                  "decision_note", "stock_count", "created_at"]
        read_only_fields = ["status", "requested_by", "decided_at", "decision_note", "stock_count"]


class DecisionSerializer(serializers.Serializer):
    approve = serializers.BooleanField()
    note = serializers.CharField(required=False, allow_blank=True, max_length=300)


class StockCountLineSerializer(serializers.ModelSerializer):
    product = ProductBriefSerializer(read_only=True)
    difference = serializers.IntegerField(read_only=True)

    class Meta:
        model = StockCountLine
        fields = ["id", "product", "expected_quantity", "counted_quantity", "counted_gross_weight", "difference",
                  "counted_at"]


class StockCountSerializer(serializers.ModelSerializer):
    started_by_name = serializers.CharField(source="started_by.display_name", read_only=True)
    progress = serializers.SerializerMethodField()

    class Meta:
        model = StockCount
        fields = ["id", "name", "status", "category", "notes", "started_by_name", "finalized_at", "created_at",
                  "progress"]
        read_only_fields = ["status", "finalized_at"]

    def get_progress(self, obj):
        lines = list(obj.lines.all())
        counted = [l for l in lines if l.counted_quantity is not None]
        return {"total": len(lines), "counted": len(counted),
                "discrepancies": sum(1 for l in counted if l.difference)}


class CountScanSerializer(serializers.Serializer):
    barcode = serializers.CharField(required=False)
    product = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all(), required=False)
    counted_quantity = serializers.IntegerField(min_value=0, default=1)
    counted_gross_weight = serializers.DecimalField(max_digits=12, decimal_places=3, required=False, allow_null=True)
    increment = serializers.BooleanField(default=True)


class ScrapSerializer(serializers.ModelSerializer):
    karat_code = serializers.CharField(source="karat.code", read_only=True)

    class Meta:
        model = ScrapGoldMovement
        fields = ["id", "karat", "karat_code", "type", "weight", "value", "ref_type", "ref_id", "note", "created_at"]

