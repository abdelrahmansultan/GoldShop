from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate, TruncMonth
from django.utils import timezone

from apps.inventory.models import Product
from apps.inventory.services import IN_STOCK, low_stock, pending_discrepancies, stock_by_karat
from apps.parties.models import Customer, Supplier
from apps.purchases.models import PurchaseInvoice
from apps.sales.models import InvoicePayment, SalesInvoice, SalesInvoiceLine, SalesReturn
from apps.treasury.models import Expense, MoneyTransaction

ZERO = Decimal("0")
DEC = DecimalField(max_digits=18, decimal_places=2)


def _sum(qs, expr):
    return qs.aggregate(v=Coalesce(Sum(expr), Value(ZERO), output_field=DEC))["v"]


def day_bounds(d: date):
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(d, time.min), tz)
    return start, start + timedelta(days=1)


def range_bounds(d1: date, d2: date):
    return day_bounds(d1)[0], day_bounds(d2)[1]


def sales_summary(start, end) -> dict:
    inv = SalesInvoice.objects.filter(issued_at__gte=start, issued_at__lt=end)
    ret = SalesReturn.objects.filter(created_at__gte=start, created_at__lt=end)
    gross_sales = _sum(inv, "grand_total")
    vat = _sum(inv, "vat_amount")
    cogs = _sum(inv, "cost_of_goods")
    returns = _sum(ret, "amount")
    returns_vat = _sum(ret, "vat_amount")
    returns_cogs = _sum(ret, "cost_of_goods")
    revenue = (gross_sales - vat) - (returns - returns_vat)
    return {
        "invoices": inv.count(),
        "gross_sales": gross_sales,
        "returns": returns,
        "net_sales": gross_sales - returns,
        "vat": vat - returns_vat,
        "revenue_ex_vat": revenue,
        "cost_of_goods": cogs - returns_cogs,
        "gross_profit": revenue - (cogs - returns_cogs),
        "old_gold_received": _sum(inv, "old_gold_value"),
        "weight_sold": inv.aggregate(w=Coalesce(Sum("total_weight"), Value(ZERO),
                                                output_field=DecimalField(max_digits=16, decimal_places=3)))["w"],
    }


def _party_totals(model):
    bal = Coalesce(Sum("ledger__amount"), Value(ZERO), output_field=DEC)
    return sum(model.objects.annotate(b=bal).filter(b__gt=0).values_list("b", flat=True), ZERO)


def dashboard(user) -> dict:
    today = timezone.localdate()
    start, end = day_bounds(today)
    out: dict = {"date": today, "currency": "EGP"}

    karats = stock_by_karat()
    out["inventory"] = {
        "by_karat": karats,
        "total_net_weight": sum((r["net_weight"] for r in karats), ZERO),
        "total_pure_weight": sum((r["pure_weight"] for r in karats), ZERO),
        "total_scrap_weight": sum((r["scrap_weight"] for r in karats), ZERO),
        "total_value_at_buy": sum((r["value_at_buy"] or ZERO for r in karats), ZERO),
        "value_incomplete": any(r["price_missing"] and r["net_weight"] > 0 for r in karats),
        "available_products": Product.objects.filter(status__in=IN_STOCK, quantity_on_hand__gt=0).count(),
        "available_pieces": _sum(Product.objects.filter(status__in=IN_STOCK), "quantity_on_hand"),
        "low_stock": [{"id": p.id, "code": p.code, "name": p.name, "quantity_on_hand": p.quantity_on_hand,
                       "reorder_level": p.reorder_level} for p in low_stock()[:10]],
        "pending_discrepancies": pending_discrepancies().count(),
    }

    recent = SalesInvoice.objects.select_related("created_by").order_by("-issued_at")[:8]
    out["recent_invoices"] = [{"id": i.id, "number": i.number, "customer_name": i.customer_name,
                               "grand_total": i.grand_total, "issued_at": i.issued_at, "status": i.status}
                              for i in recent]

    if not user.has_cap("dashboard.financial"):
        out["today"] = {"invoices": SalesInvoice.objects.filter(issued_at__gte=start, issued_at__lt=end).count()}
        return out

    s = sales_summary(start, end)
    expenses = _sum(Expense.objects.filter(date=today, is_void=False), "amount")
    out["today"] = {
        **s,
        "purchases": _sum(PurchaseInvoice.objects.filter(date=today), "total"),
        "expenses": expenses,
        "net_profit": s["gross_profit"] - expenses,
    }
    tx = MoneyTransaction.objects.filter(account__is_active=True)
    out["balances"] = {
        "cash": _sum(tx.filter(account__kind="cash"), "amount"),
        "bank": _sum(tx.filter(account__kind="bank"), "amount"),
        "receivables": _party_totals(Customer),
        "payables": _party_totals(Supplier),
    }
    out["recent_transactions"] = [
        {"id": t.id, "type": t.type, "type_display": t.get_type_display(), "amount": t.amount,
         "account": t.account.name, "description": t.description, "created_at": t.created_at}
        for t in MoneyTransaction.objects.select_related("account").order_by("-created_at")[:8]]

    d30 = day_bounds(today - timedelta(days=29))[0]
    daily = (SalesInvoice.objects.filter(issued_at__gte=d30).annotate(d=TruncDate("issued_at"))
             .values("d").annotate(total=Sum("grand_total"), count=Count("id")).order_by("d"))
    by_day = {r["d"]: r for r in daily}
    out["daily_sales"] = [{"date": today - timedelta(days=i),
                           "total": by_day.get(today - timedelta(days=i), {}).get("total") or ZERO,
                           "count": by_day.get(today - timedelta(days=i), {}).get("count") or 0}
                          for i in range(29, -1, -1)]
    m12 = day_bounds(today.replace(day=1) - timedelta(days=335))[0]
    out["monthly_revenue"] = [
        {"month": r["m"].date().isoformat()[:7] if hasattr(r["m"], "date") else str(r["m"])[:7],
         "total": r["total"], "profit": r["profit"]}
        for r in SalesInvoice.objects.filter(issued_at__gte=m12).annotate(m=TruncMonth("issued_at")).values("m")
        .annotate(total=Sum("grand_total"),
                  profit=Sum(F("grand_total") - F("vat_amount") - F("cost_of_goods"), output_field=DEC))
        .order_by("m")]
    out["sales_by_method"] = list(
        InvoicePayment.objects.filter(invoice__issued_at__gte=d30, amount__gt=0).values("method")
        .annotate(total=Sum("amount"), count=Count("id")).order_by("-total"))
    out["top_categories"] = list(
        SalesInvoiceLine.objects.filter(invoice__issued_at__gte=d30)
        .values("product__category__name_ar", "product__category__name_en")
        .annotate(quantity=Sum("quantity"), weight=Sum("total_net_weight"), total=Sum("total"))
        .order_by("-total")[:6])
    out["top_items"] = list(
        SalesInvoiceLine.objects.filter(invoice__issued_at__gte=d30)
        .values("product_id", "product_code", "description", "karat_code")
        .annotate(quantity=Sum("quantity"), total=Sum("total")).order_by("-quantity", "-total")[:6])
    return out


def sales_report(d1: date, d2: date) -> dict:
    start, end = range_bounds(d1, d2)
    inv = SalesInvoice.objects.filter(issued_at__gte=start, issued_at__lt=end)
    days = (inv.annotate(d=TruncDate("issued_at")).values("d")
            .annotate(invoices=Count("id"), total=Sum("grand_total"), vat=Sum("vat_amount"),
                      weight=Sum("total_weight"), cogs=Sum("cost_of_goods"))
            .order_by("d"))
    by_karat = (SalesInvoiceLine.objects.filter(invoice__in=inv).values("karat_code")
                .annotate(weight=Sum("total_net_weight"), gold=Sum("gold_value"), making=Sum("making_charge"),
                          total=Sum("total"), quantity=Sum("quantity")).order_by("karat_code"))
    by_user = (inv.values("created_by__username", "created_by__full_name")
               .annotate(invoices=Count("id"), total=Sum("grand_total")).order_by("-total"))
    by_method = (InvoicePayment.objects.filter(invoice__in=inv).values("method")
                 .annotate(total=Sum("amount"), count=Count("id")).order_by("-total"))
    return {"from": d1, "to": d2, "summary": sales_summary(start, end), "by_day": list(days),
            "by_karat": list(by_karat), "by_user": list(by_user), "by_method": list(by_method),
            "expenses": _sum(Expense.objects.filter(date__gte=d1, date__lte=d2, is_void=False), "amount"),
            "purchases": _sum(PurchaseInvoice.objects.filter(date__gte=d1, date__lte=d2), "total")}

