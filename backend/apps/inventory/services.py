from decimal import Decimal

from django.db import transaction
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone

from apps.core.audit import audit
from apps.core.exceptions import BusinessError
from apps.core.models import DocumentSequence
from gold_engine import inventory_value, net_weight as calc_net_weight

from .models import InventoryAdjustment, Product, StockCount, StockCountLine, StockMovement

IN_STOCK = [Product.Status.AVAILABLE, Product.Status.RESERVED]


def next_product_code() -> str:
    return DocumentSequence.next("P", 0).replace("P-0-", "P")


def move_stock(product: Product, mtype: str, qty: int, user, *, ref_type="", ref_id="", note="",
               unit_cost=None) -> StockMovement:
    """The ONLY way quantity_on_hand changes. Locks the product row so two
    cashiers can never sell the same piece."""
    if qty == 0:
        raise BusinessError("Stock movement quantity cannot be zero.")
    with transaction.atomic():
        p = Product.objects.select_for_update().get(pk=product.pk)
        new_qty = p.quantity_on_hand + qty
        if new_qty < 0:
            raise BusinessError(
                f"Insufficient stock for {p.code}: available {p.quantity_on_hand}, requested {-qty}.",
                code="insufficient_stock")
        if p.tracking == Product.Tracking.PIECE and new_qty > 1:
            raise BusinessError(f"{p.code} is a serialized piece; quantity cannot exceed 1.")
        if qty < 0 and p.status not in IN_STOCK:
            raise BusinessError(f"{p.code} is not available (status: {p.get_status_display()}).",
                                code="not_available")
        p.quantity_on_hand = new_qty
        if new_qty == 0 and p.status in IN_STOCK:
            p.status = (Product.Status.RETURNED_TO_SUPPLIER if mtype == StockMovement.Type.PURCHASE_RETURN
                        else Product.Status.SOLD)
        elif new_qty > 0 and p.status in (Product.Status.SOLD, Product.Status.RETURNED_TO_SUPPLIER):
            p.status = Product.Status.AVAILABLE
        p.save(update_fields=["quantity_on_hand", "status", "updated_at"])
        product.quantity_on_hand, product.status = p.quantity_on_hand, p.status
        return StockMovement.objects.create(
            product=p, type=mtype, quantity=qty, net_weight=p.net_weight * qty,
            unit_cost=p.purchase_cost if unit_cost is None else unit_cost,
            quantity_after=new_qty, ref_type=ref_type, ref_id=str(ref_id), note=note[:300], created_by=user,
        )


@transaction.atomic
def create_product(user, data: dict, opening_quantity: int = 0, request=None) -> Product:
    if not data.get("code"):
        data["code"] = next_product_code()
    p = Product(**data, created_by=user)
    if p.tracking == Product.Tracking.PIECE and opening_quantity > 1:
        raise BusinessError("A serialized piece can only have quantity 1.")
    if p.pricing_mode == Product.PricingMode.FIXED and not p.selling_price:
        raise BusinessError("Fixed-price items need a selling price.", field="selling_price")
    p.full_clean(exclude=["net_weight", "barcode"])
    p.save()
    if opening_quantity:
        move_stock(p, StockMovement.Type.OPENING, opening_quantity, user, ref_type="product", ref_id=p.pk,
                   note="Opening balance")
    audit(user, "product.created", p, f"{p.code} {p.name}", {"qty": opening_quantity}, request=request)
    return p


# ---------------------------------------------------------------- adjustments


def request_adjustment(user, product: Product, reason: str, quantity_delta: int = 0,
                       new_gross_weight=None, new_stone_weight=None, stock_count=None) -> InventoryAdjustment:
    reason = (reason or "").strip()
    if len(reason) < 5:
        raise BusinessError("A clear reason (at least 5 characters) is required for every adjustment.",
                            field="reason")
    if quantity_delta == 0 and new_gross_weight is None and new_stone_weight is None:
        raise BusinessError("The adjustment changes nothing.")
    if new_gross_weight is not None or new_stone_weight is not None:
        calc_net_weight(new_gross_weight if new_gross_weight is not None else product.gross_weight,
                        new_stone_weight if new_stone_weight is not None else product.stone_weight)
    adj = InventoryAdjustment.objects.create(
        product=product, quantity_delta=quantity_delta, new_gross_weight=new_gross_weight,
        new_stone_weight=new_stone_weight, reason=reason, requested_by=user, stock_count=stock_count)
    audit(user, "adjustment.requested", adj, f"{product.code} Δqty {quantity_delta}: {reason}")
    return adj


@transaction.atomic
def decide_adjustment(user, adj: InventoryAdjustment, approve: bool, note: str = "", request=None):
    adj = InventoryAdjustment.objects.select_for_update().get(pk=adj.pk)
    if adj.status != InventoryAdjustment.Status.PENDING:
        raise BusinessError("This adjustment has already been decided.")
    if adj.requested_by_id == user.pk and user.role != "owner" and not user.is_superuser:
        raise BusinessError("You cannot approve your own adjustment request.", code="segregation")
    adj.status = InventoryAdjustment.Status.APPROVED if approve else InventoryAdjustment.Status.REJECTED
    adj.decided_by, adj.decided_at, adj.decision_note = user, timezone.now(), note[:300]
    adj.save()
    if approve:
        p = Product.objects.select_for_update().get(pk=adj.product_id)
        if adj.new_gross_weight is not None or adj.new_stone_weight is not None:
            old_net = p.net_weight
            if adj.new_gross_weight is not None:
                p.gross_weight = adj.new_gross_weight
            if adj.new_stone_weight is not None:
                p.stone_weight = adj.new_stone_weight
            p.save()
            if p.quantity_on_hand:
                # zero-quantity movement row that records the weight delta for the audit trail
                StockMovement.objects.create(
                    product=p, type=StockMovement.Type.WEIGHT_CORRECTION, quantity=0,
                    net_weight=(p.net_weight - old_net) * p.quantity_on_hand, unit_cost=p.purchase_cost,
                    quantity_after=p.quantity_on_hand, ref_type="adjustment", ref_id=str(adj.pk),
                    note=adj.reason[:300], created_by=user)
        if adj.quantity_delta:
            move_stock(p, StockMovement.Type.ADJUSTMENT, adj.quantity_delta, user, ref_type="adjustment",
                       ref_id=adj.pk, note=adj.reason)
    audit(user, "adjustment.approved" if approve else "adjustment.rejected", adj, adj.reason, request=request)
    return adj


# ---------------------------------------------------------------- physical count


@transaction.atomic
def start_stock_count(user, name: str, category=None) -> StockCount:
    if StockCount.objects.filter(status=StockCount.Status.OPEN).exists():
        raise BusinessError("Another stock count is already in progress. Finalize or cancel it first.")
    c = StockCount.objects.create(name=name, category=category, started_by=user)
    qs = Product.objects.filter(status__in=IN_STOCK, quantity_on_hand__gt=0)
    if category:
        qs = qs.filter(category=category)
    StockCountLine.objects.bulk_create(
        [StockCountLine(count=c, product=p, expected_quantity=p.quantity_on_hand) for p in qs])
    audit(user, "stockcount.started", c, name)
    return c


def record_count(user, count: StockCount, product: Product, counted_quantity: int, gross_weight=None,
                 increment: bool = False) -> StockCountLine:
    if count.status != StockCount.Status.OPEN:
        raise BusinessError("This stock count is closed.")
    if counted_quantity < 0:
        raise BusinessError("Counted quantity cannot be negative.")
    line, _ = StockCountLine.objects.get_or_create(count=count, product=product,
                                                    defaults={"expected_quantity": 0})
    line.counted_quantity = (line.counted_quantity or 0) + counted_quantity if increment else counted_quantity
    if gross_weight is not None:
        line.counted_gross_weight = gross_weight
    line.counted_by, line.counted_at = user, timezone.now()
    line.save()
    return line


@transaction.atomic
def finalize_stock_count(user, count: StockCount, uncounted_as_missing: bool = True) -> list[InventoryAdjustment]:
    """Closes the count and raises *pending* adjustments for every discrepancy.
    Stock is not changed until a manager approves them."""
    count = StockCount.objects.select_for_update().get(pk=count.pk)
    if count.status != StockCount.Status.OPEN:
        raise BusinessError("This stock count is already closed.")
    adjustments = []
    for line in count.lines.select_related("product"):
        counted = line.counted_quantity
        if counted is None:
            if not uncounted_as_missing:
                continue
            counted = 0
        diff = counted - line.expected_quantity
        weight_changed = (line.counted_gross_weight is not None
                          and line.counted_gross_weight != line.product.gross_weight)
        if diff or weight_changed:
            adjustments.append(request_adjustment(
                user, line.product,
                f"Stock count #{count.pk} '{count.name}': expected {line.expected_quantity}, counted {counted}"
                + (f", weighed {line.counted_gross_weight}g" if weight_changed else ""),
                quantity_delta=diff,
                new_gross_weight=line.counted_gross_weight if weight_changed else None,
                stock_count=count))
    count.status, count.finalized_by, count.finalized_at = StockCount.Status.FINALIZED, user, timezone.now()
    count.save()
    audit(user, "stockcount.finalized", count, f"{len(adjustments)} discrepancies")
    return adjustments


# ---------------------------------------------------------------- valuation / summaries


def stock_by_karat() -> list[dict]:
    """Gold on hand by karat, valued at the current *buying* price (what the
    gold is realistically worth to the shop) and at selling price."""
    from apps.pricing.models import GoldPrice, Karat

    weight_expr = ExpressionWrapper(F("net_weight") * F("quantity_on_hand"),
                                    output_field=DecimalField(max_digits=16, decimal_places=3))
    agg = {
        r["karat"]: r
        for r in Product.objects.filter(status__in=IN_STOCK, quantity_on_hand__gt=0)
        .values("karat").annotate(weight=Sum(weight_expr), items=Sum("quantity_on_hand"),
                                  cost=Sum(ExpressionWrapper(F("purchase_cost") * F("quantity_on_hand"),
                                                             output_field=DecimalField(max_digits=18,
                                                                                       decimal_places=2))))
    }
    from .models import ScrapGoldMovement
    scrap = {r["karat"]: r["w"] for r in ScrapGoldMovement.objects.values("karat").annotate(w=Sum("weight"))}
    rows = []
    for k in Karat.objects.filter(is_active=True):
        a = agg.get(k.pk, {})
        w = a.get("weight") or Decimal("0")
        price = GoldPrice.objects.filter(karat=k, effective_at__lte=timezone.now()).first()
        rows.append({
            "karat_id": k.pk, "karat": k.code, "purity": k.purity,
            "items": a.get("items") or 0, "net_weight": w,
            "pure_weight": (w * k.purity).quantize(Decimal("0.001")),
            "scrap_weight": scrap.get(k.pk) or Decimal("0"),
            "cost": a.get("cost") or Decimal("0"),
            "buy_price": price.buy_price if price else None,
            "sell_price": price.sell_price if price else None,
            "value_at_buy": inventory_value(w + (scrap.get(k.pk) or 0), price.buy_price) if price else None,
            "value_at_sell": inventory_value(w, price.sell_price) if price else None,
            "price_missing": price is None,
        })
    return rows


def low_stock():
    return Product.objects.filter(tracking=Product.Tracking.QUANTITY, reorder_level__gt=0,
                                  quantity_on_hand__lte=F("reorder_level")).exclude(status=Product.Status.INACTIVE)


def pending_discrepancies():
    return InventoryAdjustment.objects.filter(status=InventoryAdjustment.Status.PENDING)


def category_summary():
    return (Product.objects.filter(status__in=IN_STOCK, quantity_on_hand__gt=0)
            .values("category__name_ar", "category__name_en")
            .annotate(items=Sum("quantity_on_hand"), products=Count("id",
                      filter=Q(quantity_on_hand__gt=0))))
