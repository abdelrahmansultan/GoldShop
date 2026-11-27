from rest_framework import serializers

from .models import ShopSettings


class ShopSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShopSettings
        exclude = ["id"]
        read_only_fields = ["currency", "updated_at"]
