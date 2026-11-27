from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.audit import audit
from apps.core.exceptions import BusinessError
from apps.core.models import DocumentSequence

from .models import METHOD_ACCOUNT_KIND, Expense, MoneyAccount, MoneyTransaction


def account_for(method: str, account: MoneyAccount | None = None) -> MoneyAccount:
    if account is not None:
        if not account.is_active:
            raise BusinessError(f"Account '{account.name}' is inactive.")
        return account
    kind = METHOD_ACCOUNT_KIND.get(method)
    if kind is None:
        raise BusinessError(f"Unknown payment method '{method}'.")
    acc = (MoneyAccount.objects.filter(kind=kind, is_active=True).order_by("-is_default", "id").first())
    if acc is None:
        raise BusinessError(f"No active {kind} account is configured. Add one in Treasury settings.",
                            code="no_account")
    return acc


def post(account, ttype, amount, description, user, *, method="", reference_no="", ref_type="", ref_id="",
         allow_negative=False) -> MoneyTransaction:
    amount = Decimal(amount)
    if amount == 0:
        raise BusinessError("Transaction amount cannot be zero.")
    with transaction.atomic():
        acc = MoneyAccount.objects.select_for_update().get(pk=account.pk)
        if amount < 0 and not allow_negative and acc.kind == MoneyAccount.Kind.CASH:
            bal = acc.transactions.aggregate(s=Sum("amount"))["s"] or Decimal("0")
            if bal + amount < 0:
                raise BusinessError(f"Insufficient cash in '{acc.name}': balance {bal}, needed {-amount}.",
                                    code="insufficient_cash")
        return MoneyTransaction.objects.create(
            account=acc, type=ttype, method=method, amount=amount, description=description[:300],
            reference_no=reference_no, ref_type=ref_type, ref_id=str(ref_id), created_by=user)


@transaction.atomic
def transfer(user, src: MoneyAccount, dst: MoneyAccount, amount: Decimal, note: str = ""):
    if src.pk == dst.pk:
        raise BusinessError("Source and destination accounts must differ.")
    if amount <= 0:
        raise BusinessError("Transfer amount must be positive.")
    ref = DocumentSequence.next("TRF", timezone.localdate().year)
    out = post(src, MoneyTransaction.Type.TRANSFER, -amount, f"Transfer to {dst.name} {note}".strip(), user,
               ref_type="transfer", ref_id=ref)
    inn = post(dst, MoneyTransaction.Type.TRANSFER, amount, f"Transfer from {src.name} {note}".strip(), user,
               ref_type="transfer", ref_id=ref)
    audit(user, "treasury.transfer", out, f"{amount} {src.name} → {dst.name}")
    return out, inn


@transaction.atomic
def record_expense(user, *, category, amount, account, date, description, request=None) -> Expense:
    if amount <= 0:
        raise BusinessError("Expense amount must be positive.", field="amount")
    e = Expense.objects.create(number=DocumentSequence.next("EXP", date.year), category=category, amount=amount,
                               account=account, date=date, description=description, created_by=user)
    post(account, MoneyTransaction.Type.EXPENSE, -amount, f"{e.number} {description}", user,
         ref_type="expense", ref_id=e.pk)
    audit(user, "expense.recorded", e, f"{e.number} {amount}", request=request)
    return e


@transaction.atomic
def void_expense(user, expense: Expense, reason: str, request=None) -> Expense:
    e = Expense.objects.select_for_update().get(pk=expense.pk)
    if e.is_void:
        raise BusinessError("Expense already voided.")
    if len((reason or "").strip()) < 5:
        raise BusinessError("A reason is required to void an expense.", field="reason")
    e.is_void, e.void_reason = True, reason
    e.save()
    post(e.account, MoneyTransaction.Type.REVERSAL, e.amount, f"Void {e.number}: {reason}", user,
         ref_type="expense", ref_id=e.pk, allow_negative=True)
    audit(user, "expense.voided", e, reason, request=request)
    return e
