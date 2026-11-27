from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.audit import audit

from .models import Customer, Supplier
from .serializers import CustomerSerializer, LedgerSerializer, PartyPaymentSerializer, SupplierSerializer

BAL = Coalesce(Sum("ledger__amount"), Value(0), output_field=DecimalField(max_digits=16, decimal_places=2))


class PartyViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "head", "options"]
    search_fields = ["name", "phone", "national_id"]
    ordering_fields = ["name", "balance", "created_at"]
    filterset_fields = ["is_active"]

    def get_queryset(self):
        qs = self.model.objects.annotate(balance=BAL)
        if self.request.query_params.get("has_balance") == "1":
            qs = qs.exclude(balance=0)
        return qs.order_by("name")

    def perform_create(self, s):
        obj = s.save()
        audit(self.request.user, f"{self.model._meta.model_name}.created", obj, obj.name, request=self.request)

    def perform_update(self, s):
        obj = s.save()
        audit(self.request.user, f"{self.model._meta.model_name}.updated", obj, obj.name, s.validated_data,
              request=self.request)

    @action(detail=True)
    def ledger(self, request, pk=None):
        obj = self.get_object()
        page = self.paginate_queryset(obj.ledger.all())
        return self.get_paginated_response(LedgerSerializer(page, many=True).data)


class CustomerViewSet(PartyViewSet):
    model = Customer
    serializer_class = CustomerSerializer
    permission_classes = [Cap("parties.manage")]

    @action(detail=True, methods=["post"], permission_classes=[Cap("sales.create")])
    def payment(self, request, pk=None):
        from apps.sales.services import receive_customer_payment
        s = PartyPaymentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        receive_customer_payment(request.user, self.get_object(), d["amount"], d["method"], d.get("account"),
                                 d.get("reference_no", ""), d.get("note", ""), request=request)
        return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data)


class SupplierViewSet(PartyViewSet):
    model = Supplier
    serializer_class = SupplierSerializer
    permission_classes = [Cap("purchases.manage", read="inventory.view")]

    @action(detail=True, methods=["post"], permission_classes=[Cap("purchases.manage")])
    def payment(self, request, pk=None):
        from apps.purchases.services import pay_supplier
        s = PartyPaymentSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        pay_supplier(request.user, self.get_object(), d["amount"], d["method"], d.get("account"),
                     d.get("reference_no", ""), d.get("note", ""), request=request)
        return Response(self.get_serializer(self.get_queryset().get(pk=pk)).data)
