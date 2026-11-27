from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit import audit
from .models import ShopSettings
from .serializers import ShopSettingsSerializer


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok", "time": timezone.now()})


@api_view(["GET", "PATCH"])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def shop_settings(request):
    obj = ShopSettings.load()
    if request.method == "PATCH":
        if not request.user.has_cap("settings.manage"):
            return Response(status=status.HTTP_403_FORBIDDEN)
        s = ShopSettingsSerializer(obj, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        s.save()
        audit(request.user, "settings.updated", obj, "", {k: v for k, v in s.validated_data.items() if k != "logo"},
              request=request)
        return Response(s.data)
    return Response(ShopSettingsSerializer(obj).data)


@api_view(["GET"])
def search(request):
    """Global search across products, invoices, customers and suppliers."""
    from apps.inventory.models import Product
    from apps.parties.models import Customer, Supplier
    from apps.purchases.models import PurchaseInvoice
    from apps.sales.models import SalesInvoice

    q = (request.query_params.get("q") or "").strip()
    if len(q) < 2:
        return Response({"results": []})
    u, res = request.user, []
    if u.has_cap("inventory.view"):
        for p in Product.objects.select_related("karat").filter(Q(code__icontains=q) | Q(barcode=q) | Q(name__icontains=q))[:8]:
            res.append({"type": "product", "id": p.id, "title": f"{p.code} — {p.name}",
                        "subtitle": f"{p.karat.code}K · {p.net_weight} g", "status": p.status})
    if u.has_cap("sales.view"):
        for i in SalesInvoice.objects.filter(Q(number__icontains=q) | Q(customer_name__icontains=q) |
                                             Q(customer_phone__icontains=q))[:6]:
            res.append({"type": "sales_invoice", "id": i.id, "title": i.number,
                        "subtitle": f"{i.customer_name} · {i.grand_total} EGP"})
    if u.has_cap("parties.manage"):
        for c in Customer.objects.filter(Q(name__icontains=q) | Q(phone__icontains=q) | Q(national_id=q))[:6]:
            res.append({"type": "customer", "id": c.id, "title": c.name, "subtitle": c.phone})
    if u.has_cap("purchases.manage"):
        for s in Supplier.objects.filter(Q(name__icontains=q) | Q(phone__icontains=q))[:4]:
            res.append({"type": "supplier", "id": s.id, "title": s.name, "subtitle": s.phone})
        for pi in PurchaseInvoice.objects.filter(Q(number__icontains=q) | Q(supplier_invoice_no__icontains=q))[:4]:
            res.append({"type": "purchase_invoice", "id": pi.id, "title": pi.number, "subtitle": pi.supplier.name})
    return Response({"results": res})


@api_view(["GET"])
def notifications(request):
    """Actionable alerts computed live from the database."""
    from apps.inventory.models import StockCount
    from apps.inventory.services import low_stock, pending_discrepancies
    from apps.pricing.services import price_board

    items = []
    for r in price_board():
        if r["price"] is None:
            items.append({"level": "error", "code": "price_missing", "params": {"karat": r["karat"].code}})
        elif r["is_stale"]:
            items.append({"level": "warning", "code": "price_stale",
                          "params": {"karat": r["karat"].code, "since": r["price"].effective_at}})
    if request.user.has_cap("inventory.adjust.approve"):
        n = pending_discrepancies().count()
        if n:
            items.append({"level": "warning", "code": "adjustments_pending", "params": {"count": n}})
    ls = low_stock().count()
    if ls:
        items.append({"level": "info", "code": "low_stock", "params": {"count": ls}})
    if StockCount.objects.filter(status="open").exists():
        items.append({"level": "info", "code": "stock_count_open", "params": {}})
    return Response({"items": items})


@api_view(["GET", "POST"])
def backups(request):
    from .backup import create_backup, list_backups

    if not request.user.has_cap("backup.manage"):
        return Response(status=status.HTTP_403_FORBIDDEN)
    if request.method == "POST":
        try:
            path = create_backup("manual")
        except Exception as exc:  # noqa: BLE001
            return Response({"detail": f"Backup failed: {exc}", "code": "backup_failed"}, status=500)
        audit(request.user, "backup.created", None, path.name, entity="backup", request=request)
        return Response({"name": path.name}, status=201)
    return Response(list_backups())
