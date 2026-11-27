from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.exceptions import BusinessError
from apps.core.export import csv_response
from apps.core.models import AuditLog

from . import services


def _dates(request, default_days=30):
    today = timezone.localdate()
    try:
        d2 = date.fromisoformat(request.query_params.get("to") or today.isoformat())
        d1 = date.fromisoformat(request.query_params.get("from") or (d2 - timedelta(days=default_days - 1)).isoformat())
    except ValueError:
        raise BusinessError("Dates must be YYYY-MM-DD.")
    if d1 > d2:
        raise BusinessError("'from' must be before 'to'.")
    if (d2 - d1).days > 366 * 3:
        raise BusinessError("Date range too large (max 3 years).")
    return d1, d2


@api_view(["GET"])
def dashboard(request):
    return Response(services.dashboard(request.user))


@api_view(["GET"])
def sales_report(request):
    if not request.user.has_cap("reports.view"):
        return Response(status=403)
    return Response(services.sales_report(*_dates(request)))


class AuditSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.display_name", read_only=True, default=None)

    class Meta:
        model = AuditLog
        fields = ["id", "user", "user_name", "action", "entity", "entity_id", "summary", "data", "ip_address",
                  "created_at"]


class AuditViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("user")
    serializer_class = AuditSerializer
    permission_classes = [Cap("audit.view")]
    filterset_fields = {"user": ["exact"], "action": ["exact", "startswith"], "entity": ["exact"],
                        "entity_id": ["exact"], "created_at": ["gte", "lte", "date"]}
    search_fields = ["summary", "action", "entity_id"]


def _want_csv(request):
    return request.query_params.get("export") == "csv"


@api_view(["GET"])
def daily_close(request):
    if not request.user.has_cap("treasury.view"):
        return Response(status=403)
    try:
        d = date.fromisoformat(request.query_params.get("date") or timezone.localdate().isoformat())
    except ValueError:
        raise BusinessError("Date must be YYYY-MM-DD.")
    return Response(services.daily_close(d))


@api_view(["GET"])
def inventory_report(request):
    if not request.user.has_cap("inventory.view"):
        return Response(status=403)
    show_cost = request.user.has_cap("inventory.view_cost")
    rows = list(services.inventory_rows(request.query_params))
    if not show_cost:
        for r in rows:
            r.pop("unit_cost"), r.pop("total_cost")
    if _want_csv(request):
        cols = ["code", "name", "category_ar", "karat", "quantity", "gross_weight", "net_weight", "total_net_weight"]
        cols += ["unit_cost", "total_cost"] if show_cost else []
        cols += ["value_at_buy", "supplier"]
        return csv_response(f"inventory-{timezone.localdate()}.csv", cols, ([r[c] for c in cols] for r in rows))
    totals = {
        "items": sum(r["quantity"] for r in rows),
        "total_net_weight": sum((r["total_net_weight"] for r in rows), Decimal("0")),
        "value_at_buy": sum((r["value_at_buy"] or 0 for r in rows), Decimal("0")),
    }
    if show_cost:
        totals["total_cost"] = sum((r["total_cost"] for r in rows), Decimal("0"))
    return Response({"rows": rows, "totals": totals})


@api_view(["GET"])
def balances(request, kind):
    cap = "sales.view" if kind == "customers" else "purchases.manage"
    if kind not in ("customers", "suppliers") or not request.user.has_cap(cap) or not request.user.has_cap("reports.view"):
        return Response(status=403)
    rows = services.party_balances(kind)
    if _want_csv(request):
        return csv_response(f"{kind}-balances-{timezone.localdate()}.csv", ["name", "phone", "balance"],
                            ([r["name"], r["phone"], r["balance"]] for r in rows))
    return Response(rows)


@api_view(["GET"])
def sales_report_csv(request):
    if not request.user.has_cap("reports.view"):
        return Response(status=403)
    r = services.sales_report(*_dates(request))
    return csv_response(f"sales-{r['from']}-{r['to']}.csv", ["date", "invoices", "weight", "vat", "total", "cost"],
                        ([d["d"], d["invoices"], d["weight"], d["vat"], d["total"], d["cogs"]] for d in r["by_day"]))
