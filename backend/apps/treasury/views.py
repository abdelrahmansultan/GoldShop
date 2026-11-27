from django.db.models import DecimalField, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.audit import audit
from apps.core.exceptions import BusinessError

from . import services
from .models import Expense, ExpenseCategory, MoneyAccount, MoneyTransaction
from .serializers import (CashMovementSerializer, ExpenseCategorySerializer, ExpenseSerializer,
                          MoneyAccountSerializer, MoneyTransactionSerializer, TransferSerializer)


class MoneyAccountViewSet(viewsets.ModelViewSet):
    serializer_class = MoneyAccountSerializer
    permission_classes = [Cap("treasury.manage", read="sales.create")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None

    def get_queryset(self):
        return MoneyAccount.objects.annotate(
            balance=Coalesce(Sum("transactions__amount"), Value(0),
                             output_field=DecimalField(max_digits=16, decimal_places=2)))

    def list(self, request, *args, **kwargs):
        data = self.get_serializer(self.get_queryset(), many=True).data
        if not request.user.has_cap("treasury.view"):
            for d in data:
                d.pop("balance")
        return Response(data)

    def perform_create(self, s):
        if s.validated_data.get("is_default"):
            MoneyAccount.objects.filter(kind=s.validated_data["kind"]).update(is_default=False)
        a = s.save()
        audit(self.request.user, "account.created", a, a.name, request=self.request)

    def perform_update(self, s):
        if s.validated_data.get("is_default"):
            MoneyAccount.objects.filter(kind=s.instance.kind).exclude(pk=s.instance.pk).update(is_default=False)
        a = s.save()
        audit(self.request.user, "account.updated", a, a.name, s.validated_data, request=self.request)


class MoneyTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = MoneyTransaction.objects.select_related("account", "created_by")
    serializer_class = MoneyTransactionSerializer
    permission_classes = [Cap("treasury.view")]
    filterset_fields = {"account": ["exact"], "type": ["exact"], "method": ["exact"],
                        "created_at": ["gte", "lte", "date"]}
    search_fields = ["description", "reference_no"]

    @action(detail=False, methods=["post"], permission_classes=[Cap("treasury.manage")])
    def transfer(self, request):
        s = TransferSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        out, inn = services.transfer(request.user, d["source"], d["destination"], d["amount"], d.get("note", ""))
        return Response(MoneyTransactionSerializer([out, inn], many=True).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"], permission_classes=[Cap("treasury.manage")])
    def movement(self, request):
        s = CashMovementSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        if d["type"] == "opening" and d["account"].transactions.exists():
            raise BusinessError("Opening balance can only be entered on an account with no transactions.")
        sign = -1 if d["type"] == "withdrawal" else 1
        tx = services.post(d["account"], d["type"], sign * d["amount"], d["description"], request.user)
        audit(request.user, f"treasury.{d['type']}", tx, f"{d['amount']} {d['account'].name}", request=request)
        return Response(MoneyTransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all()
    serializer_class = ExpenseCategorySerializer
    permission_classes = [Cap("treasury.manage", read="treasury.view")]
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None


class ExpenseViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    queryset = Expense.objects.select_related("category", "account")
    serializer_class = ExpenseSerializer
    permission_classes = [Cap("treasury.manage", read="treasury.view")]
    filterset_fields = {"category": ["exact"], "account": ["exact"], "date": ["gte", "lte", "exact"],
                        "is_void": ["exact"]}
    search_fields = ["number", "description"]

    def perform_create(self, s):
        s.instance = services.record_expense(self.request.user, request=self.request, **s.validated_data)

    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        e = services.void_expense(request.user, self.get_object(), request.data.get("reason", ""), request=request)
        return Response(self.get_serializer(e).data)


@api_view(["GET"])
def payment_methods(request):
    from .models import PaymentMethod
    return Response([{"value": v, "label": l} for v, l in PaymentMethod.choices])
