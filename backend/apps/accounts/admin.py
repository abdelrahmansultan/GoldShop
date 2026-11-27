from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class GoldUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Shop", {"fields": ("role", "full_name", "phone", "language")}),)
    list_display = ["username", "full_name", "role", "is_active", "last_login"]
