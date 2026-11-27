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


# Screen grouping used by the permissions editor (order = display order).
CAPABILITY_GROUPS: list[tuple[str, list[str]]] = [
    ("dashboard", ["dashboard.financial"]),
    ("sales", ["sales.create", "sales.view", "sales.return", "sales.discount_override", "parties.manage"]),
    ("prices", ["prices.manage"]),
    ("inventory", ["inventory.view", "inventory.manage", "inventory.view_cost", "inventory.adjust.request",
                   "inventory.adjust.approve", "inventory.count"]),
    ("purchases", ["purchases.manage"]),
    ("finance", ["treasury.view", "treasury.manage", "reports.view"]),
    ("admin", ["users.manage", "audit.view", "settings.manage", "backup.manage"]),
]


def role_defaults(role: str) -> list[str]:
    return sorted(c for c, roles in CAPABILITIES.items() if role in roles)


class User(AbstractUser):
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CASHIER)
    # None = use the role's default screens; a list = exactly these capabilities.
    custom_capabilities = models.JSONField(null=True, blank=True)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    language = models.CharField(max_length=2, choices=[("ar", "Arabic"), ("en", "English")], default="ar")

    def has_cap(self, cap: str) -> bool:
        if not self.is_active:
            return False
        if self.is_superuser or self.role == Role.OWNER:
            return True
        if self.custom_capabilities is not None:
            return cap in self.custom_capabilities
        return self.role in CAPABILITIES.get(cap, set())

    @property
    def capabilities(self) -> list[str]:
        return sorted(c for c in CAPABILITIES if self.has_cap(c))

    @property
    def display_name(self) -> str:
        return self.full_name or self.username
