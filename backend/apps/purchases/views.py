from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.exceptions import BusinessError

from . import services
from .models import PurchaseInvoice
from .serializers import PurchaseIn, PurchaseInvoiceSerializer, PurchaseReturnIn, PurchaseReturnSerializer


class PurchaseInvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PurchaseInvoice.objects.select_related("supplier").prefetch_related("lines__product", "lines__karat",
                                                                                   "payments")
    serializer_class = PurchaseInvoiceSerializer
    permission_classes = [Cap("purchases.manage")]
    filterset_fields = {"supplier": ["exact"], "date": ["gte", "lte", "exact"]}
    search_fields = ["number", "supplier_invoice_no", "supplier__name"]

    def create(self, request):
        s = PurchaseIn(data=request.data)
        s.is_valid(raise_exception=True)
        inv = services.post_purchase(request.user, s.validated_data, request=request)
        return Response(self.get_serializer(self.get_queryset().get(pk=inv.pk)).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="return")
    def return_items(self, request, pk=None):
        inv = self.get_object()
        s = PurchaseReturnIn(data=request.data)
        s.is_valid(raise_exception=True)
        if s.validated_data["line"].invoice_id != inv.pk:
            raise BusinessError("Line does not belong to this invoice.")
        ret = services.return_to_supplier(request.user, s.validated_data["line"], s.validated_data["quantity"],
                                          s.validated_data["reason"], request=request)
        return Response(PurchaseReturnSerializer(ret).data, status=status.HTTP_201_CREATED)
