from django.contrib import admin

from .models import AuditLog, ShopSettings


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["created_at", "user", "action", "entity", "entity_id", "summary"]
    list_filter = ["action", "entity"]
    search_fields = ["summary", "entity_id"]

    def has_change_permission(self, *a):
        return False

    def has_delete_permission(self, *a):
        return False


admin.site.register(ShopSettings)
