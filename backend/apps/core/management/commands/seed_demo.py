"""Demo dataset for trying the system: users, today's prices, stock, a
supplier purchase, customers and a few sales. Uses the real services, so
every ledger, movement and audit row is consistent. Never run on a live shop."""
from decimal import Decimal as D

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.inventory.models import Category, JewelryType, Product
from apps.inventory.services import create_product
from apps.parties.models import Customer, Supplier
from apps.pricing.models import Karat
from apps.pricing.services import record_prices
from apps.purchases.services import post_purchase
from apps.sales.services import post_sale
from apps.treasury.models import MoneyAccount
from apps.treasury.services import post

DEMO_USERS = [
    ("owner", "Gold@2026", "owner", "صاحب المحل"),
    ("manager", "Gold@2026", "manager", "مدير المحل"),
    ("cashier", "Gold@2026", "cashier", "الكاشير"),
    ("stock", "Gold@2026", "inventory", "أمين المخزن"),
    ("accountant", "Gold@2026", "accountant", "المحاسب"),
]

# (karat, buy, sell) — sample figures for testing only, NOT live market prices.
DEMO_PRICES = [("24", "4560.00", "4620.00"), ("22", "4180.00", "4235.00"),
               ("21", "3990.00", "4040.00"), ("18", "3420.00", "3465.00")]

# code, name, category, karat, gross, stones_w, making/g, stones value, tracking, qty, type
DEMO_ITEMS = [
    ("R-1001", "خاتم سوليتير", "rings", "18", "4.250", "0.350", "250", "6500", "piece", 1, "stones"),
    ("R-1002", "خاتم سادة", "rings", "21", "5.100", "0", "120", "0", "piece", 1, "egyptian"),
    ("R-1003", "خاتم بفص زركون", "rings", "21", "6.300", "0.400", "150", "800", "piece", 1, "stones"),
    ("W-2001", "دبلة سادة", "wedding-rings", "21", "7.450", "0", "90", "0", "piece", 1, "egyptian"),
    ("W-2002", "دبلة إيطالي", "wedding-rings", "18", "5.800", "0", "180", "0", "piece", 1, "italian"),
    ("B-3001", "أسورة مبرومة", "bracelets", "21", "15.200", "0", "110", "0", "piece", 1, "egyptian"),
    ("B-3002", "أسورة خليجي", "bracelets", "21", "22.750", "0", "95", "0", "piece", 1, "gulf"),
    ("B-3003", "غويشة تركي", "bracelets", "21", "18.400", "0", "100", "0", "piece", 1, "turkish"),
    ("N-4001", "سلسلة كارتير", "chains", "18", "9.600", "0", "160", "0", "piece", 1, "italian"),
    ("N-4002", "سلسلة حبل", "chains", "21", "12.300", "0", "85", "0", "piece", 1, "egyptian"),
    ("N-4003", "عقد بفصوص", "necklaces", "18", "14.900", "1.200", "220", "4200", "piece", 1, "stones"),
    ("E-5001", "حلق دلاية", "earrings", "18", "3.400", "0.200", "200", "600", "piece", 1, "italian"),
    ("E-5002", "حلق سادة", "earrings", "21", "4.050", "0", "130", "0", "piece", 1, "egyptian"),
    ("S-6001", "طقم شبكة", "sets", "21", "38.600", "0", "120", "0", "piece", 1, "gulf"),
]


class Command(BaseCommand):
    help = "Load a demo dataset for testing. Refuses to run if sales already exist."

    def add_arguments(self, p):
        p.add_argument("--force", action="store_true", help="Run even if data exists (testing only)")

    @transaction.atomic
    def handle(self, *a, **o):
        from apps.sales.models import SalesInvoice
        if SalesInvoice.objects.exists() and not o["force"]:
            raise CommandError("Data already exists; demo data is only for a fresh database.")
        call_command("seed_initial", verbosity=0)

        users = {}
        for username, pw, role, name in DEMO_USERS:
            u = User.objects.filter(username=username).first()
            if not u:
                u = User.objects.create_user(username, password=pw, role=role, full_name=name,
                                             is_superuser=(role == "owner"), is_staff=(role == "owner"))
            users[role] = u
        owner, manager, cashier = users["owner"], users["manager"], users["cashier"]

        karats = {k.code: k for k in Karat.objects.all()}
        record_prices(manager, [{"karat": karats[c], "buy_price": D(b), "sell_price": D(s)} for c, b, s in DEMO_PRICES],
                      note="أسعار تجريبية — للتجربة فقط")

        cash = MoneyAccount.objects.get(kind="cash", is_default=True)
        bank, _ = MoneyAccount.objects.get_or_create(name="البنك الأهلي", defaults={"kind": "bank", "is_default": True,
                                                                                    "bank_name": "البنك الأهلي المصري"})
        post(cash, "opening", D("150000"), "رصيد افتتاحي (تجريبي)", owner)
        post(bank, "opening", D("500000"), "رصيد افتتاحي (تجريبي)", owner)

        supplier, _ = Supplier.objects.get_or_create(name="ورشة النور للمشغولات", defaults={"phone": "01000000001"})
        Supplier.objects.get_or_create(name="مصنع الصفوة", defaults={"phone": "01000000002"})
        cats = {c.code: c for c in Category.objects.all()}
        types = {t.code: t for t in JewelryType.objects.all()}
        prices = {c: D(b) for c, b, _ in DEMO_PRICES}

        lines = []
        for code, name, cat, k, gross, stone, making, stones_v, tracking, qty, jt in DEMO_ITEMS:
            lines.append({"new_product": {
                "code": code, "barcode": code, "name": name, "category": cats[cat], "karat": karats[k],
                "jewelry_type": types[jt], "tracking": tracking, "gross_weight": D(gross), "stone_weight": D(stone),
                "making_charge_type": "per_gram", "making_charge_value": D(making), "stones_value": D(stones_v)},
                "quantity": qty, "gold_price_per_gram": prices[k], "making_cost_per_gram": D(making) / 2,
                "other_cost": D(stones_v) * D("0.7")})
        post_purchase(manager, {"supplier": supplier, "supplier_invoice_no": "DEMO-001", "lines": lines,
                                "payments": [{"method": "bank_transfer", "amount": D("150000")}]})

        # quantity-based items: gold pounds (coins) and a 10 g bar, fixed price
        coin = create_product(manager, {"code": "C-7001", "barcode": "C-7001", "name": "جنيه ذهب عيار 21",
                                        "category": cats["coins"], "karat": karats["21"], "tracking": "quantity",
                                        "gross_weight": D("8.000"), "pricing_mode": "fixed",
                                        "making_charge_type": "fixed", "selling_price": D("32800"),
                                        "purchase_cost": D("32100"), "reorder_level": 3}, opening_quantity=10)
        create_product(manager, {"code": "BAR-10", "barcode": "BAR-10", "name": "سبيكة 10 جرام", "category": cats["bars"],
                                 "karat": karats["24"], "tracking": "quantity", "gross_weight": D("10.000"),
                                 "making_charge_type": "fixed", "making_charge_value": D("350"),
                                 "purchase_cost": D("45900"), "reorder_level": 2}, opening_quantity=5)

        ahmed, _ = Customer.objects.get_or_create(name="أحمد محمود", defaults={"phone": "01011111111",
                                                                               "credit_limit": D("50000")})
        Customer.objects.get_or_create(name="منى السيد", defaults={"phone": "01022222222"})

        def sell(code, payments, **kw):
            p = Product.objects.get(code=code)
            return post_sale(cashier, {"lines": [{"product": p, "quantity": kw.pop("quantity", 1)}],
                                       "payments": payments, **kw})

        from apps.sales.services import price_sale
        # Sale 1: cash, walk-in
        p = Product.objects.get(code="R-1002")
        due = price_sale(cashier, {"lines": [{"product": p, "quantity": 1}]})["totals"].net_payable
        sell("R-1002", [{"method": "cash", "amount": due}], customer_name="عميل نقدي")
        # Sale 2: two coins by card
        due = price_sale(cashier, {"lines": [{"product": coin, "quantity": 2}]})["totals"].net_payable
        sell("C-7001", [{"method": "card", "amount": due, "reference_no": "AUTH-4821"}], quantity=2)
        # Sale 3: exchange — customer trades in 6 g of old 21K, pays the rest, part on account
        p = Product.objects.get(code="B-3001")
        old = [{"karat": karats["21"], "weight": D("6.000"), "deduction_percent": D("0"), "deduction_per_gram": D("0")}]
        due = price_sale(cashier, {"lines": [{"product": p, "quantity": 1}], "old_gold": old})["totals"].net_payable
        post_sale(cashier, {"customer": ahmed, "lines": [{"product": p, "quantity": 1}], "old_gold": old,
                            "payments": [{"method": "cash", "amount": due - D("5000")}]})

        self.stdout.write(self.style.SUCCESS(
            "Demo data loaded. Logins (password Gold@2026): owner, manager, cashier, stock, accountant"))
