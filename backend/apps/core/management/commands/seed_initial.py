from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.inventory.models import Category, JewelryType
from apps.pricing.models import Karat, PriceSource
from apps.treasury.models import ExpenseCategory, MoneyAccount

KARATS = [("24", "عيار 24", "24 Karat", "0.9990", 1), ("22", "عيار 22", "22 Karat", "0.9160", 2),
          ("21", "عيار 21", "21 Karat", "0.8750", 3), ("18", "عيار 18", "18 Karat", "0.7500", 4)]
CATEGORIES = [("rings", "خواتم", "Rings"), ("bracelets", "أساور", "Bracelets"), ("necklaces", "قلائد", "Necklaces"),
              ("chains", "سلاسل", "Chains"), ("earrings", "حلقان", "Earrings"),
              ("wedding-rings", "دبل", "Wedding rings"), ("coins", "جنيهات ذهب", "Coins"),
              ("bars", "سبائك", "Gold bars"), ("sets", "أطقم", "Sets"), ("other", "أخرى", "Other")]
TYPES = [("italian", "إيطالي", "Italian"), ("gulf", "خليجي", "Gulf"), ("turkish", "تركي", "Turkish"),
         ("egyptian", "مصري", "Egyptian"), ("stones", "بفصوص", "With stones")]
EXPENSES = [("إيجار", "Rent"), ("كهرباء ومياه", "Utilities"), ("رواتب", "Salaries"), ("صيانة", "Maintenance"),
            ("نثريات", "Miscellaneous"), ("دمغة ومصاريف حكومية", "Hallmarking & government fees")]


class Command(BaseCommand):
    help = "Create reference data (karats, categories, accounts) and an owner account. Idempotent. No prices."

    def add_arguments(self, p):
        p.add_argument("--owner-username", default="owner")
        p.add_argument("--owner-password")

    def handle(self, *a, **o):
        for code, ar, en, purity, order in KARATS:
            Karat.objects.get_or_create(code=code, defaults=dict(name_ar=ar, name_en=en, purity=Decimal(purity),
                                                                 sort_order=order))
        for i, (code, ar, en) in enumerate(CATEGORIES):
            Category.objects.get_or_create(code=code, defaults=dict(name_ar=ar, name_en=en, sort_order=i))
        for code, ar, en in TYPES:
            JewelryType.objects.get_or_create(code=code, defaults=dict(name_ar=ar, name_en=en))
        for ar, en in EXPENSES:
            ExpenseCategory.objects.get_or_create(name_en=en, defaults=dict(name_ar=ar))
        PriceSource.objects.get_or_create(name="Manual", defaults={"kind": "manual"})
        PriceSource.objects.get_or_create(name="GoldAPI", defaults={
            "kind": "provider", "provider_key": "goldapi", "notes": "International XAU/EGP price (goldapi.io)"})
        MoneyAccount.objects.get_or_create(name="الخزينة الرئيسية", defaults={"kind": "cash", "is_default": True})
        if o["owner_password"] and not User.objects.filter(username=o["owner_username"]).exists():
            User.objects.create_superuser(o["owner_username"], "", o["owner_password"], role="owner",
                                          full_name="Owner")
            self.stdout.write(f"Owner '{o['owner_username']}' created.")
        self.stdout.write(self.style.SUCCESS("Reference data ready. Enter today's gold prices before selling."))
