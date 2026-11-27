from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User


class UserSerializer(serializers.ModelSerializer):
    capabilities = serializers.ListField(read_only=True)
    display_name = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "display_name", "email", "phone", "role", "language",
                  "is_active", "last_login", "capabilities", "password"]
        read_only_fields = ["last_login"]

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
