from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from apps.core.audit import audit
from apps.core.exceptions import BusinessError
from apps.core.models import ShopSettings

from .models import GoldPrice, Karat, PriceSource


def manual_source() -> PriceSource:
    src, _ = PriceSource.objects.get_or_create(name="Manual", defaults={"kind": PriceSource.Kind.MANUAL})
    return src


def current_price(karat: Karat, at=None) -> GoldPrice:
    at = at or timezone.now()
    p = GoldPrice.objects.filter(karat=karat, effective_at__lte=at).select_related("source").first()
    if p is None:
        raise BusinessError(f"No gold price has been entered for {karat.code}K. Enter today's price first.",
                            code="no_price")
    return p


def is_today(price: GoldPrice) -> bool:
    return timezone.localdate(price.effective_at) == timezone.localdate()


def price_for_sale(karat: Karat) -> GoldPrice:
    """Current price, and when the shop requires daily pricing, it must be from today."""
    p = current_price(karat)
    if ShopSettings.load().require_daily_price and not is_today(p):
        raise BusinessError(
            f"Today's gold price for {karat.code}K has not been entered yet. A manager must enter today's prices "
            "before selling.", code="price_not_today")
    return p


def price_board(at=None) -> list[dict]:
    """Latest price per active karat with staleness info. Missing prices are
    reported as missing — never filled in or derived silently."""
    at = at or timezone.now()
    cfg = ShopSettings.load()
    stale_after = timedelta(hours=cfg.price_stale_after_hours)
    rows = []
    for k in Karat.objects.filter(is_active=True):
        p = GoldPrice.objects.filter(karat=k, effective_at__lte=at).select_related("source", "entered_by").first()
        rows.append({
            "karat": k,
            "price": p,
            "is_stale": p is None or (at - p.effective_at) > stale_after
                        or (cfg.require_daily_price and timezone.localdate(p.effective_at) != timezone.localdate(at)),
        })
    return rows


@transaction.atomic
def record_prices(user, entries: list[dict], source: PriceSource | None = None, effective_at=None,
                  note: str = "", request=None) -> list[GoldPrice]:
    """entries: [{"karat": Karat, "buy_price": Decimal, "sell_price": Decimal}]"""
    if not entries:
        raise BusinessError("Enter at least one price.")
    source = source or manual_source()
    effective_at = effective_at or timezone.now()
    if effective_at > timezone.now() + timedelta(minutes=5):
        raise BusinessError("Prices cannot be dated in the future.", field="effective_at")
    seen = set()
    created = []
    for e in entries:
        k = e["karat"]
        if k.pk in seen:
            raise BusinessError(f"{k.code}K appears more than once.")
        seen.add(k.pk)
        gp = GoldPrice(karat=k, buy_price=e["buy_price"], sell_price=e["sell_price"], source=source,
                       effective_at=effective_at, entered_by=user, note=note)
        gp.full_clean()
        gp.save()
        created.append(gp)
        audit(user, "price.recorded", gp, f"{k.code}K buy {gp.buy_price} sell {gp.sell_price} ({source.name})",
              {"karat": k.code, "buy": gp.buy_price, "sell": gp.sell_price, "source": source.name,
               "effective_at": effective_at}, request=request)
    return created
