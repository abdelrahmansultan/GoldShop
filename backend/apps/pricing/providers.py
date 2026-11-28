"""External (internet) gold price providers.

Rules:
  * A provider returns real market data or raises. It never synthesizes a price.
  * Karat prices are derived from the international 24K gram price using the
    Egyptian market convention (karat / 24), then the shop's buy/sell
    adjustment percentages are applied so the result matches the local market.
  * On any failure nothing is recorded; the last good price stays in force and
    the error is shown to the manager.

To add a provider: subclass PriceProvider, implement fetch_ounce(), register it.
"""
import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from decimal import Decimal, InvalidOperation

from django.utils import timezone

from gold_engine import q_money

logger = logging.getLogger(__name__)
REGISTRY: dict[str, type["PriceProvider"]] = {}
TROY_OUNCE_GRAMS = Decimal("31.1034768")


class ProviderUnavailable(Exception):
    """Message is shown to the manager."""


@dataclass
class Quote:
    karat_id: int
    karat_code: str
    buy_price: Decimal
    sell_price: Decimal


@dataclass
class MarketData:
    ounce_price: Decimal      # one troy ounce of 24K, in EGP
    currency: str
    provider_time: str        # provider's own timestamp (ISO)

    @property
    def gram_24k(self) -> Decimal:
        return self.ounce_price / TROY_OUNCE_GRAMS


class PriceProvider:
    key = ""
    label = ""
    signup_url = ""

    def fetch_ounce(self, api_key: str) -> MarketData:  # pragma: no cover - interface
        raise NotImplementedError


def register(cls):
    REGISTRY[cls.key] = cls
    return cls


def _decimal(v, what):
    try:
        d = Decimal(str(v))
    except (InvalidOperation, TypeError, ValueError):
        raise ProviderUnavailable(f"Provider returned an invalid {what}: {v!r}")
    if not d.is_finite() or d <= 0:
        raise ProviderUnavailable(f"Provider returned an invalid {what}: {v!r}")
    return d


def http_get_json(url: str, headers: dict, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "GoldShopERP/1.0", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed https URL
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ProviderUnavailable("The API key was rejected by the price provider. Check the key.") from e
        if e.code == 429:
            raise ProviderUnavailable("The price provider's request limit was reached. Try again later.") from e
        raise ProviderUnavailable(f"Price provider error (HTTP {e.code}).") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise ProviderUnavailable("Could not reach the price provider. Check the internet connection.") from e
    except ValueError as e:
        raise ProviderUnavailable("The price provider returned an unreadable response.") from e


@register
class GoldApiProvider(PriceProvider):
    """https://www.goldapi.io — returns XAU priced directly in EGP."""
    key = "goldapi"
    label = "GoldAPI.io"
    signup_url = "https://www.goldapi.io"
    URL = os.environ.get("GOLDAPI_URL", "https://www.goldapi.io/api/XAU/EGP")

    def fetch_ounce(self, api_key: str) -> MarketData:
        if not api_key:
            raise ProviderUnavailable("No API key configured for GoldAPI. Add it in the automatic pricing settings.")
        data = http_get_json(self.URL, {"x-access-token": api_key})
        if data.get("error"):
            raise ProviderUnavailable(f"GoldAPI: {str(data['error'])[:200]}")
        if str(data.get("currency", "EGP")).upper() != "EGP":
            raise ProviderUnavailable("GoldAPI returned a currency other than EGP.")
        ounce = _decimal(data.get("price"), "ounce price")
        ts = data.get("timestamp")
        when = datetime.fromtimestamp(int(ts), tz=dt_timezone.utc).isoformat() if ts else timezone.now().isoformat()
        return MarketData(ounce_price=ounce, currency="EGP", provider_time=when)


def karat_ratio(karat) -> Decimal:
    """Egyptian market convention: price(karat) = price(24K) × karat / 24.
    Falls back to the configured purity for non-numeric karat codes."""
    try:
        return Decimal(int(karat.code)) / Decimal(24)
    except (TypeError, ValueError):
        return Decimal(karat.purity)


def build_quotes(market: MarketData, karats, sell_adjust_percent, buy_adjust_percent) -> list[Quote]:
    sell_f = 1 + Decimal(sell_adjust_percent) / 100
    buy_f = 1 + Decimal(buy_adjust_percent) / 100
    if buy_f > sell_f:
        raise ProviderUnavailable("The buying adjustment must not be higher than the selling adjustment.")
    out = []
    for k in karats:
        base = market.gram_24k * karat_ratio(k)
        out.append(Quote(karat_id=k.pk, karat_code=k.code, buy_price=q_money(base * buy_f), sell_price=q_money(base * sell_f)))
    return out


def fetch(source):
    """Fetch market data for a provider-backed source and compute per-karat quotes.
    Records the raw quote / error on the source. Does not record prices."""
    from .models import Karat

    cls = REGISTRY.get(source.provider_key)
    try:
        if cls is None:
            raise ProviderUnavailable(f"Unknown price provider '{source.provider_key}'.")
        market = cls().fetch_ounce(source.api_key or os.environ.get(f"{source.provider_key.upper()}_KEY", ""))
        quotes = build_quotes(market, Karat.objects.filter(is_active=True), source.sell_adjust_percent,
                              source.buy_adjust_percent)
    except ProviderUnavailable as exc:
        source.last_error, source.last_error_at = str(exc)[:500], timezone.now()
        source.save(update_fields=["last_error", "last_error_at"])
        raise
    source.last_quote = {"ounce_price": str(market.ounce_price), "gram_24k": str(q_money(market.gram_24k)),
                         "currency": market.currency, "provider_time": market.provider_time,
                         "fetched_at": timezone.now().isoformat()}
    source.last_success_at, source.last_error = timezone.now(), ""
    source.save(update_fields=["last_quote", "last_success_at", "last_error"])
    return market, quotes


def sync_source(source, user=None) -> int:
    """Fetch and record prices (scheduled auto-apply). Returns number of prices recorded; 0 on failure."""
    from .models import Karat
    from .services import record_prices

    try:
        market, quotes = fetch(source)
    except ProviderUnavailable as exc:
        logger.warning("price sync failed: %s", exc)
        return 0
    karats = {k.pk: k for k in Karat.objects.filter(pk__in=[q.karat_id for q in quotes])}
    record_prices(user, [{"karat": karats[q.karat_id], "buy_price": q.buy_price, "sell_price": q.sell_price}
                         for q in quotes], source=source,
                  note=f"Automatic: ounce {market.ounce_price} EGP ({source.name})")
    return len(quotes)


def due_sources():
    """Provider sources with auto-apply whose interval has elapsed."""
    from .models import PriceSource

    now = timezone.now()
    for s in PriceSource.objects.filter(kind=PriceSource.Kind.PROVIDER, is_active=True, auto_apply=True):
        last = max(filter(None, [s.last_success_at, s.last_error_at]), default=None)
        if last is None or now - last >= timedelta(minutes=max(15, s.sync_interval_minutes)):
            yield s
