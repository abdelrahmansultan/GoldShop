from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.audit import audit
from apps.core.export import csv_response
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


def _with_previous(qs):
    """Annotate each price with the previous price of the same karat (the change log)."""
    prev = GoldPrice.objects.filter(karat=OuterRef("karat")).filter(
        Q(effective_at__lt=OuterRef("effective_at")) | Q(effective_at=OuterRef("effective_at"), id__lt=OuterRef("id"))
    ).order_by("-effective_at", "-id")
    return qs.annotate(prev_buy=Subquery(prev.values("buy_price")[:1]),
                       prev_sell=Subquery(prev.values("sell_price")[:1]))


class GoldPriceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Price change log. Read-only; new prices are added with POST /prices/record/."""
    serializer_class = GoldPriceSerializer
    permission_classes = [Cap("prices.manage", read="inventory.view")]
    filterset_fields = {"karat": ["exact"], "source": ["exact"], "entered_by": ["exact"],
                        "effective_at": ["gte", "lte", "date", "date__gte", "date__lte"]}
    ordering_fields = ["effective_at"]

    def get_queryset(self):
        return _with_previous(GoldPrice.objects.select_related("karat", "source", "entered_by"))

    def list(self, request, *args, **kwargs):
        if request.query_params.get("export") == "csv":
            qs = self.filter_queryset(self.get_queryset())[:20000]
            rows = GoldPriceSerializer(qs, many=True).data
            return csv_response("gold-price-log.csv",
                                ["effective_at", "karat", "buy_price", "buy_change", "sell_price", "sell_change",
                                 "source", "entered_by", "note"],
                                ([r["effective_at"], r["karat_code"], r["buy_price"], r["buy_change"], r["sell_price"],
                                  r["sell_change"], r["source_name"], r["entered_by_name"], r["note"]] for r in rows))
        return super().list(request, *args, **kwargs)

    @action(detail=False)
    def editors(self, request):
        """Users who have entered prices (for the log's filter)."""
        from apps.accounts.models import User
        ids = GoldPrice.objects.exclude(entered_by=None).values_list("entered_by", flat=True).distinct()
        return Response([{"id": u.id, "name": u.display_name} for u in User.objects.filter(id__in=list(ids))])

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
