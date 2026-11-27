from rest_framework.permissions import BasePermission


def Cap(*caps, read: str | None = None):
    """Permission factory: Cap("inventory.manage", read="inventory.view")
    -> safe methods need `read` (if given), unsafe need all of `caps`."""

    class _Cap(BasePermission):
        message = "You do not have permission to perform this action."

        def has_permission(self, request, view):
            u = request.user
            if not (u and u.is_authenticated):
                return False
            if read and request.method in ("GET", "HEAD", "OPTIONS"):
                return u.has_cap(read)
            return all(u.has_cap(c) for c in caps)

    _Cap.__name__ = "Cap_" + "_".join(c.replace(".", "_") for c in caps)
    return _Cap
