"""External gold price providers.

A provider returns real quotes or raises. It must never synthesize a price.
To add one: subclass PriceProvider, implement fetch(), and register it.
Credentials come from environment variables, never from the database.
"""
import logging
from dataclasses import dataclass
from decimal import Decimal

from django.utils import timezone

logger = logging.getLogger(__name__)
REGISTRY: dict[str, type["PriceProvider"]] = {}


@dataclass
class Quote:
    karat_code: str
    buy_price: Decimal
    sell_price: Decimal


class ProviderUnavailable(Exception):
    pass


class PriceProvider:
    key = ""

    def fetch(self) -> list[Quote]:  # pragma: no cover - interface
        raise NotImplementedError


def register(cls):
    REGISTRY[cls.key] = cls
    return cls


def sync_source(source) -> int:
    """Fetch from a provider-backed PriceSource and store quotes.
    On any failure, records the error and stores nothing."""
    from .models import Karat
    from .services import record_prices

    cls = REGISTRY.get(source.provider_key)
    if cls is None:
        source.last_error, source.last_error_at = f"Unknown provider '{source.provider_key}'", timezone.now()
        source.save(update_fields=["last_error", "last_error_at"])
        return 0
    try:
        quotes = cls().fetch()
        karats = {k.code: k for k in Karat.objects.filter(is_active=True)}
        entries = [{"karat": karats[q.karat_code], "buy_price": q.buy_price, "sell_price": q.sell_price}
                   for q in quotes if q.karat_code in karats]
        if not entries:
            raise ProviderUnavailable("Provider returned no usable quotes")
        record_prices(None, entries, source=source, note=f"Auto-sync from {source.name}")
    except Exception as exc:  # noqa: BLE001 - any failure must leave prices untouched
        logger.warning("price provider failed", extra={"path": source.provider_key})
        source.last_error, source.last_error_at = str(exc)[:500], timezone.now()
        source.save(update_fields=["last_error", "last_error_at"])
        return 0
    source.last_success_at, source.last_error = timezone.now(), ""
    source.save(update_fields=["last_success_at", "last_error"])
    return len(entries)
