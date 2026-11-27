import django_filters
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.audit import audit
from apps.core.exceptions import BusinessError

from . import services
from .models import (Category, InventoryAdjustment, JewelryType, Product, ScrapGoldMovement, StockCount,
                     StockMovement)
from .serializers import (AdjustmentSerializer, CategorySerializer, CountScanSerializer, DecisionSerializer,
                          JewelryTypeSerializer, ProductSerializer, ScrapSerializer, StockCountLineSerializer,
                          StockCountSerializer, StockMovementSerializer)


class LookupViewSet(viewsets.ModelViewSet):
    permission_classes = [Cap("inventory.manage", read="inventory.view")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None


class CategoryViewSet(LookupViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class JewelryTypeViewSet(LookupViewSet):
    queryset = JewelryType.objects.all()
    serializer_class = JewelryTypeSerializer


class ProductFilter(django_filters.FilterSet):
    min_weight = django_filters.NumberFilter(field_name="net_weight", lookup_expr="gte")
    max_weight = django_filters.NumberFilter(field_name="net_weight", lookup_expr="lte")
    in_stock = django_filters.BooleanFilter(method="filter_in_stock")
    status = django_filters.MultipleChoiceFilter(choices=Product.Status.choices)

    class Meta:
        model = Product
        fields = ["karat", "category", "jewelry_type", "tracking", "supplier", "status", "pricing_mode"]

    def filter_in_stock(self, qs, name, value):
        if value is None:
            return qs
        cond = Q(quantity_on_hand__gt=0, status__in=services.IN_STOCK)
        return qs.filter(cond) if value else qs.exclude(cond)


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("karat", "category", "jewelry_type", "supplier")
    serializer_class = ProductSerializer
    permission_classes = [Cap("inventory.manage", read="inventory.view")]
    filterset_class = ProductFilter
    search_fields = ["code", "barcode", "name", "name_en", "description"]
    ordering_fields = ["created_at", "net_weight", "code", "quantity_on_hand"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def perform_create(self, s):
        data = dict(s.validated_data)
        opening = data.pop("opening_quantity", 0)
        if "purchase_cost" in data and not self.request.user.has_cap("inventory.view_cost"):
            data.pop("purchase_cost")
        s.instance = services.create_product(self.request.user, data, opening, request=self.request)

    def perform_update(self, s):
        s.validated_data.pop("opening_quantity", None)
        if not self.request.user.has_cap("inventory.view_cost"):
            s.validated_data.pop("purchase_cost", None)
        p = s.save()
        audit(self.request.user, "product.updated", p, p.code,
              {k: v for k, v in s.validated_data.items() if k != "image"}, request=self.request)

    @action(detail=False, url_path=r"barcode/(?P<code>[^/]+)")
    def by_barcode(self, request, code=None):
        p = Product.objects.filter(Q(barcode=code) | Q(code=code)).select_related("karat", "category").first()
        if not p:
            return Response({"detail": "No item with this barcode.", "code": "not_found"}, status=404)
        return Response(self.get_serializer(p).data)

    @action(detail=True)
    def movements(self, request, pk=None):
        qs = self.get_object().movements.select_related("created_by")
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(StockMovementSerializer(page, many=True).data)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related("product", "created_by")
    serializer_class = StockMovementSerializer
    permission_classes = [Cap("inventory.view")]
    filterset_fields = {"product": ["exact"], "type": ["exact"], "created_at": ["gte", "lte", "date"],
                        "ref_type": ["exact"], "ref_id": ["exact"]}
    search_fields = ["product__code", "product__name", "note"]


class AdjustmentViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = InventoryAdjustment.objects.select_related("product", "requested_by", "decided_by")
    serializer_class = AdjustmentSerializer
    permission_classes = [Cap("inventory.adjust.request", read="inventory.view")]
    filterset_fields = ["status", "product", "stock_count"]

    def perform_create(self, s):
        d = s.validated_data
        s.instance = services.request_adjustment(self.request.user, d["product"], d.get("reason", ""),
                                                 d.get("quantity_delta", 0), d.get("new_gross_weight"),
                                                 d.get("new_stone_weight"))

    @action(detail=True, methods=["post"], permission_classes=[Cap("inventory.adjust.approve")])
    def decide(self, request, pk=None):
        s = DecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        adj = services.decide_adjustment(request.user, self.get_object(), s.validated_data["approve"],
                                         s.validated_data.get("note", ""), request=request)
        return Response(AdjustmentSerializer(adj).data)


class StockCountViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = StockCount.objects.select_related("started_by").prefetch_related("lines")
    serializer_class = StockCountSerializer
    permission_classes = [Cap("inventory.count", read="inventory.view")]

    def perform_create(self, s):
        s.instance = services.start_stock_count(self.request.user, s.validated_data["name"],
                                                s.validated_data.get("category"))

    @action(detail=True)
    def lines(self, request, pk=None):
        c = self.get_object()
        qs = c.lines.select_related("product__karat").order_by("product__code")
        only = request.query_params.get("filter")
        if only == "uncounted":
            qs = qs.filter(counted_quantity__isnull=True)
        elif only == "counted":
            qs = qs.filter(counted_quantity__isnull=False)
        data = StockCountLineSerializer(qs, many=True).data
        if only == "discrepancies":
            data = [d for d in data if d["difference"]]
        return Response(data)

    @action(detail=True, methods=["post"])
    def scan(self, request, pk=None):
        c = self.get_object()
        s = CountScanSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        product = d.get("product") or Product.objects.filter(Q(barcode=d.get("barcode")) |
                                                            Q(code=d.get("barcode"))).first()
        if product is None:
            raise BusinessError("Unknown barcode.", code="not_found")
        line = services.record_count(request.user, c, product, d["counted_quantity"], d.get("counted_gross_weight"),
                                     increment=d["increment"])
        return Response(StockCountLineSerializer(line).data)

    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        adjs = services.finalize_stock_count(request.user, self.get_object(),
                                             request.data.get("uncounted_as_missing", True))
        return Response({"adjustments": AdjustmentSerializer(adjs, many=True).data})

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        c = self.get_object()
        if c.status != StockCount.Status.OPEN:
            raise BusinessError("Only an open count can be cancelled.")
        c.status = StockCount.Status.CANCELLED
        c.save()
        audit(request.user, "stockcount.cancelled", c, c.name, request=request)
        return Response(StockCountSerializer(c).data)


class ScrapViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ScrapGoldMovement.objects.select_related("karat")
    serializer_class = ScrapSerializer
    permission_classes = [Cap("inventory.view")]
    filterset_fields = ["karat", "type"]


@api_view(["GET"])
def valuation(request):
    if not request.user.has_cap("inventory.view"):
        return Response(status=status.HTTP_403_FORBIDDEN)
    rows = services.stock_by_karat()
    if not request.user.has_cap("inventory.view_cost"):
        for r in rows:
            r.pop("cost", None)
    return Response(rows)

