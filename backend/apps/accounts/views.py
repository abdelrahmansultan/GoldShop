from django.conf import settings
from django.core.cache import cache
from rest_framework import generics, status, viewsets
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.audit import audit

from .models import User
from .permissions import Cap
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, UserSerializer


def _lock_key(username: str) -> str:
    return f"login-fail:{(username or '').strip().lower()[:150]}"


class LoginView(TokenObtainPairView):
    """JWT login with per-username lockout and audit of every attempt."""
    serializer_class = LoginSerializer
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        username = str(request.data.get("username", ""))
        key = _lock_key(username)
        failures = cache.get(key, 0)
        if failures >= settings.LOGIN_MAX_FAILURES:
            audit(None, "auth.login_blocked", None, username, request=request, entity="auth")
            return Response({"detail": f"Too many failed attempts. Try again in {settings.LOGIN_LOCKOUT_MINUTES} minutes.",
                             "code": "locked"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        try:
            response = super().post(request, *args, **kwargs)
        except (AuthenticationFailed, InvalidToken) as exc:
            # Respond instead of raising so ATOMIC_REQUESTS does not roll back the audit row.
            cache.set(key, failures + 1, settings.LOGIN_LOCKOUT_MINUTES * 60)
            audit(None, "auth.login_failed", None, username, {"failures": failures + 1}, request=request,
                  entity="auth")
            return Response({"detail": str(exc.detail), "code": "invalid_credentials"},
                            status=status.HTTP_401_UNAUTHORIZED)
        cache.delete(key)
        user = User.objects.filter(username=username).first()
        audit(user, "auth.login", user, username, request=request)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer

    def get_object(self):
        return self.request.user


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    s = ChangePasswordSerializer(data=request.data, context={"request": request})
    s.is_valid(raise_exception=True)
    if not request.user.check_password(s.validated_data["old_password"]):
        return Response({"detail": "Current password is incorrect", "code": "bad_password"}, status=400)
    request.user.set_password(s.validated_data["new_password"])
    request.user.save()
    audit(request.user, "user.password_changed", request.user, request=request)
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def capability_catalog(request):
    """Screens/permissions for the users screen, with each role's defaults."""
    from .models import CAPABILITY_GROUPS, Role, role_defaults
    return Response({"groups": [{"key": k, "capabilities": caps} for k, caps in CAPABILITY_GROUPS],
                     "roles": {r.value: role_defaults(r.value) for r in Role}})


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer
    permission_classes = [Cap("users.manage")]
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate instead of delete
    search_fields = ["username", "full_name", "phone"]

    def perform_create(self, s):
        u = s.save()
        audit(self.request.user, "user.created", u, f"{u.username} ({u.role})",
              {"custom_capabilities": u.custom_capabilities}, request=self.request)

    def perform_update(self, s):
        u = s.save()
        audit(self.request.user, "user.updated", u, u.username,
              {k: v for k, v in s.validated_data.items() if k != "password"}, request=self.request)
