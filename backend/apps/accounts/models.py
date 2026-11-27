from django.contrib.auth.models import AbstractUser
from django.db import models


class Role(models.TextChoices):
    OWNER = "owner", "Owner"
    MANAGER = "manager", "Manager"
    ACCOUNTANT = "accountant", "Accountant"
    CASHIER = "cashier", "Cashier"
    INVENTORY = "inventory", "Inventory clerk"


# capability -> roles allowed. Single source of truth for authorization,
# exposed to the frontend so it can hide (not just disable) unavailable actions.
CAPABILITIES: dict[str, set[str]] = {
    "dashboard.financial": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "prices.manage": {Role.OWNER, Role.MANAGER},
    "inventory.view": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT, Role.CASHIER, Role.INVENTORY},
    "inventory.manage": {Role.OWNER, Role.MANAGER, Role.INVENTORY},
    "inventory.view_cost": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "inventory.adjust.request": {Role.OWNER, Role.MANAGER, Role.INVENTORY},
    "inventory.adjust.approve": {Role.OWNER, Role.MANAGER},
    "inventory.count": {Role.OWNER, Role.MANAGER, Role.INVENTORY},
    "sales.create": {Role.OWNER, Role.MANAGER, Role.CASHIER},
    "sales.view": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT, Role.CASHIER},
    "sales.return": {Role.OWNER, Role.MANAGER},
    "sales.discount_override": {Role.OWNER, Role.MANAGER},
    "purchases.manage": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "parties.manage": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT, Role.CASHIER},
    "treasury.view": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "treasury.manage": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "reports.view": {Role.OWNER, Role.MANAGER, Role.ACCOUNTANT},
    "audit.view": {Role.OWNER, Role.MANAGER},
    "users.manage": {Role.OWNER},
    "settings.manage": {Role.OWNER},
    "backup.manage": {Role.OWNER},
}


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CASHIER)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    language = models.CharField(max_length=2, choices=[("ar", "Arabic"), ("en", "English")], default="ar")

    def has_cap(self, cap: str) -> bool:
        if not self.is_active:
            return False
        if self.is_superuser:
            return True
        return self.role in CAPABILITIES.get(cap, set())

    @property
    def capabilities(self) -> list[str]:
        return sorted(c for c in CAPABILITIES if self.has_cap(c))

    @property
    def display_name(self) -> str:
        return self.full_name or self.username
