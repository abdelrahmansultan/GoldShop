from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.core.models import MONEY, ImmutableModel, TimeStamped


class PaymentMethod(models.TextChoices):
    CASH = "cash", "Cash"
    CARD = "card", "Bank card"
    BANK_TRANSFER = "bank_transfer", "Bank transfer"
    INSTAPAY = "instapay", "InstaPay"
    WALLET = "wallet", "Mobile wallet"
    CHEQUE = "cheque", "Cheque"


METHOD_ACCOUNT_KIND = {
    PaymentMethod.CASH: "cash",
    PaymentMethod.CARD: "bank",
    PaymentMethod.BANK_TRANSFER: "bank",
    PaymentMethod.INSTAPAY: "bank",
    PaymentMethod.WALLET: "bank",
    PaymentMethod.CHEQUE: "bank",
}


class MoneyAccount(TimeStamped):
    class Kind(models.TextChoices):
        CASH = "cash", "Cash box"
        BANK = "bank", "Bank account"

    name = models.CharField(max_length=100, unique=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    bank_name = models.CharField(max_length=100, blank=True)
    account_number = models.CharField(max_length=50, blank=True)
    is_default = models.BooleanField(default=False, help_text="Default account for its kind")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["kind", "name"]

    def __str__(self):
        return self.name

    def ledger_balance(self):
        return self.transactions.aggregate(s=Sum("amount"))["s"] or 0


class MoneyTransaction(ImmutableModel):
    class Type(models.TextChoices):
        OPENING = "opening", "Opening balance"
        SALE_RECEIPT = "sale_receipt", "Sale receipt"
        SALE_REFUND = "sale_refund", "Sales refund"
        OLD_GOLD_PAYOUT = "old_gold_payout", "Old gold paid out"
        CUSTOMER_PAYMENT = "customer_payment", "Customer payment"
        PURCHASE_PAYMENT = "purchase_payment", "Supplier payment"
        PURCHASE_REFUND = "purchase_refund", "Supplier refund"
        EXPENSE = "expense", "Expense"
        TRANSFER = "transfer", "Transfer"
        DEPOSIT = "deposit", "Owner deposit"
        WITHDRAWAL = "withdrawal", "Owner withdrawal"
        REVERSAL = "reversal", "Reversal"

    account = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT, related_name="transactions")
    type = models.CharField(max_length=20, choices=Type.choices, db_index=True)
    method = models.CharField(max_length=20, choices=PaymentMethod.choices, blank=True)
    amount = models.DecimalField(**MONEY, help_text="Signed: + money in, - money out")
    description = models.CharField(max_length=300)
    reference_no = models.CharField(max_length=100, blank=True, help_text="Card auth / transfer ref")
    ref_type = models.CharField(max_length=40, blank=True)
    ref_id = models.CharField(max_length=40, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["ref_type", "ref_id"])]


class ExpenseCategory(TimeStamped):
    name_ar = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name_en"]
        verbose_name_plural = "expense categories"

    def __str__(self):
        return self.name_en


class Expense(TimeStamped):
    number = models.CharField(max_length=30, unique=True)
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT)
    amount = models.DecimalField(**MONEY)
    account = models.ForeignKey(MoneyAccount, on_delete=models.PROTECT)
    date = models.DateField(db_index=True)
    description = models.CharField(max_length=300)
    is_void = models.BooleanField(default=False)
    void_reason = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [models.CheckConstraint(condition=models.Q(amount__gt=0), name="expense_amount_positive")]
