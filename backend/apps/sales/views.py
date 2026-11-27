from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import Cap

from . import services
from .models import SalesInvoice, SalesReturn
from .serializers import (ReturnIn, SaleIn, SalesInvoiceListSerializer, SalesInvoiceSerializer,
                          SalesReturnSerializer)


def _preview_payload(calc):
    t = calc["totals"]
    lines = []
    for p, r in zip(calc["prepared"], calc["results"]):
        d = r.as_dict()
        d.update(product=p["product"].pk, product_code=p["product"].code, description=p["product"].name,
                 karat=p["product"].karat.code, gold_price_id=p["gp"].pk, price_overridden=p["overridden"],
                 making_charge_type=str(p["mc_type"]), making_charge_value=str(p["mc_value"]))
        lines.append(d)
    old = []
    for o in calc["old"]:
        d = o["result"].as_dict()
        d.update(karat=o["input"]["karat"].code, gold_price_id=o["gp"].pk)
        old.append(d)
    out = t.as_dict()
    out.update(lines=lines, old_gold=old, paid=str(calc["paid"]), credit=str(calc["credit"]),
               invoice_discount=str(calc["invoice_discount"]), vat_rate=str(calc["vat_rate"]))
    return out


class SalesInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SalesInvoice.objects.select_related("customer", "created_by").prefetch_related(
        "lines", "old_gold", "payments__account", "returns")
    permission_classes = [Cap("sales.create", read="sales.view")]
    filterset_fields = {"status": ["exact"], "customer": ["exact"], "issued_at": ["gte", "lte", "date"],
                        "created_by": ["exact"]}
    search_fields = ["number", "customer_name", "customer_phone", "lines__product_code"]
    ordering_fields = ["issued_at", "grand_total"]

    def get_serializer_class(self):
        return SalesInvoiceListSerializer if self.action == "list" else SalesInvoiceSerializer

    @action(detail=False, methods=["post"])
    def preview(self, request):
        s = SaleIn(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(_preview_payload(services.price_sale(request.user, s.validated_data)))

    def create(self, request):
        s = SaleIn(data=request.data)
        s.is_valid(raise_exception=True)
        inv = services.post_sale(request.user, s.validated_data, request=request)
        inv = self.get_queryset().get(pk=inv.pk)
        return Response(SalesInvoiceSerializer(inv, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="return", permission_classes=[Cap("sales.return")])
    def return_items(self, request, pk=None):
        s = ReturnIn(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        ret = services.return_sale(request.user, self.get_object(), d["items"], d["reason"], d["settlement"],
                                   d.get("refund_method", "cash"), d.get("refund_account"), request=request)
        return Response(SalesReturnSerializer(ret).data, status=status.HTTP_201_CREATED)


class SalesReturnViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SalesReturn.objects.select_related("invoice")
    serializer_class = SalesReturnSerializer
    permission_classes = [Cap("sales.view")]
    filterset_fields = {"invoice": ["exact"], "created_at": ["gte", "lte", "date"]}
    search_fields = ["number", "invoice__number"]
