from datetime import date, timedelta

from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.accounts.permissions import Cap
from apps.core.exceptions import BusinessError
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
