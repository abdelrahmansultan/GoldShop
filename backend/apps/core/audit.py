from .models import AuditLog


def client_ip(request):
    if request is None:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    return (fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")) or None


def audit(user, action: str, obj=None, summary: str = "", data=None, request=None, entity: str = ""):
    return AuditLog.objects.create(
        user=user if (user is not None and user.is_authenticated) else None,
        action=action,
        entity=entity or (obj._meta.label if obj is not None else ""),
        entity_id=str(getattr(obj, "pk", "") or ""),
        summary=summary[:500],
        data=_jsonable(data or {}),
        ip_address=client_ip(request),
    )


def _jsonable(v):
    from datetime import date, datetime
    from decimal import Decimal

    if isinstance(v, dict):
        return {str(k): _jsonable(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_jsonable(x) for x in v]
    if isinstance(v, (Decimal, datetime, date)):
        return str(v)
    return v
