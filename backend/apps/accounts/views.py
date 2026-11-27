from rest_framework import generics, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.core.audit import audit

from .models import User
from .permissions import Cap
from .serializers import ChangePasswordSerializer, LoginSerializer, MeSerializer, UserSerializer


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_scope = "login"


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


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.order_by("username")
    serializer_class = UserSerializer
    permission_classes = [Cap("users.manage")]
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate instead of delete
    search_fields = ["username", "full_name", "phone"]

    def perform_create(self, s):
        u = s.save()
        audit(self.request.user, "user.created", u, f"{u.username} ({u.role})", request=self.request)

    def perform_update(self, s):
        u = s.save()
        audit(self.request.user, "user.updated", u, u.username,
              {k: v for k, v in s.validated_data.items() if k != "password"}, request=self.request)
