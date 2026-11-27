from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import CAPABILITIES, Role, User, role_defaults


class UserSerializer(serializers.ModelSerializer):
    capabilities = serializers.ListField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False)
    custom_capabilities = serializers.ListField(child=serializers.CharField(), allow_null=True, required=False)
    role_defaults = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "display_name", "email", "phone", "role", "language",
                  "is_active", "last_login", "capabilities", "custom_capabilities", "role_defaults", "password"]
        read_only_fields = ["last_login"]

    def get_role_defaults(self, obj):
        return role_defaults(obj.role)

    def validate(self, attrs):
        actor = self.context["request"].user
        target = self.instance
        actor_is_owner = actor.is_superuser or actor.role == Role.OWNER
        if not actor_is_owner:
            # Managers who were given "users.manage" can administer staff, never the owner,
            # and can never hand out a permission they do not hold themselves.
            if target is not None and (target.is_superuser or target.role == Role.OWNER):
                raise serializers.ValidationError("Only the owner can change the owner account.")
            if attrs.get("role") == Role.OWNER:
                raise serializers.ValidationError({"role": "Only the owner can create another owner."})
            role = attrs.get("role", target.role if target else Role.CASHIER)
            if "custom_capabilities" in attrs:
                caps = attrs["custom_capabilities"]
            else:
                caps = target.custom_capabilities if target is not None else None
            granted = role_defaults(role) if caps is None else caps
            beyond = [c for c in granted if not actor.has_cap(c)]
            if beyond:
                raise serializers.ValidationError(
                    {"custom_capabilities": f"You cannot grant permissions you do not have: {', '.join(beyond)}"})
        if target is not None and target.pk == actor.pk and attrs.get("is_active") is False:
            raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
        return attrs

    def validate_custom_capabilities(self, value):
        if value is None:
            return None
        unknown = [c for c in value if c not in CAPABILITIES]
        if unknown:
            raise serializers.ValidationError(f"Unknown permissions: {', '.join(unknown)}")
        return sorted(set(value))

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, data):
        pw = data.pop("password", None)
        if not pw:
            raise serializers.ValidationError({"password": "Password is required"})
        user = User(**data)
        user.set_password(pw)
        user.save()
        return user

    def update(self, user, data):
        pw = data.pop("password", None)
        for k, v in data.items():
            setattr(user, k, v)
        if pw:
            user.set_password(pw)
        user.save()
        return user


class MeSerializer(serializers.ModelSerializer):
    capabilities = serializers.ListField(read_only=True)
    display_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "display_name", "email", "phone", "role", "language", "capabilities"]
        read_only_fields = ["username", "role"]


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField()
    new_password = serializers.CharField()

    def validate_new_password(self, v):
        validate_password(v, self.context["request"].user)
        return v


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data["user"] = MeSerializer(self.user).data
        return data
