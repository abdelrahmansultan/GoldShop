from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.audit import audit
from apps.core.models import ShopSettings

from .models import GoldPrice, Karat, PriceSource
from .serializers import BulkPriceSerializer, GoldPriceSerializer, KaratSerializer, PriceSourceSerializer
from .services import price_board, record_prices


class KaratViewSet(viewsets.ModelViewSet):
    queryset = Karat.objects.all()
    serializer_class = KaratSerializer
    permission_classes = [Cap("settings.manage", read="inventory.view")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None

    def perform_update(self, s):
        if "purity" in s.validated_data and s.instance.products.exists():
            from apps.core.exceptions import BusinessError
            raise BusinessError("Purity cannot change once products use this karat.")
        k = s.save()
        audit(self.request.user, "karat.updated", k, k.code, s.validated_data, request=self.request)


class PriceSourceViewSet(viewsets.ModelViewSet):
    queryset = PriceSource.objects.order_by("name")
    serializer_class = PriceSourceSerializer
    permission_classes = [Cap("prices.manage", read="inventory.view")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None


class GoldPriceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """History is read-only; new prices are added with POST /prices/record/."""
    queryset = GoldPrice.objects.select_related("karat", "source", "entered_by")
    serializer_class = GoldPriceSerializer
    permission_classes = [Cap("prices.manage", read="inventory.view")]
    filterset_fields = {"karat": ["exact"], "source": ["exact"], "effective_at": ["gte", "lte", "date"]}
    ordering_fields = ["effective_at"]

    @action(detail=False, methods=["post"])
    def record(self, request):
        s = BulkPriceSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        rows = record_prices(request.user, s.validated_data["entries"], s.validated_data.get("source"),
                             s.validated_data.get("effective_at"), s.validated_data.get("note", ""), request=request)
        return Response(GoldPriceSerializer(rows, many=True).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def board(request):
    stale_hours = ShopSettings.load().price_stale_after_hours
    rows = []
    for r in price_board():
        p = r["price"]
        rows.append({
            "karat": KaratSerializer(r["karat"]).data,
            "price": GoldPriceSerializer(p).data if p else None,
            "is_stale": r["is_stale"],
        })
    return Response({"as_of": timezone.now(), "stale_after_hours": stale_hours, "rows": rows})
