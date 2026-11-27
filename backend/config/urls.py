from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenBlacklistView, TokenRefreshView

from apps.accounts import views as acc
from apps.core import views as core
from apps.inventory import views as inv
from apps.parties import views as parties
from apps.pricing import views as pricing
from apps.purchases import views as purchases
from apps.reports import views as reports
from apps.sales import views as sales
from apps.treasury import views as treasury

r = DefaultRouter()
r.register("users", acc.UserViewSet)
r.register("karats", pricing.KaratViewSet)
r.register("price-sources", pricing.PriceSourceViewSet)
r.register("prices", pricing.GoldPriceViewSet)
r.register("categories", inv.CategoryViewSet)
r.register("jewelry-types", inv.JewelryTypeViewSet)
r.register("products", inv.ProductViewSet)
r.register("stock-movements", inv.StockMovementViewSet)
r.register("adjustments", inv.AdjustmentViewSet)
r.register("stock-counts", inv.StockCountViewSet)
r.register("scrap-gold", inv.ScrapViewSet)
r.register("customers", parties.CustomerViewSet, basename="customer")
r.register("suppliers", parties.SupplierViewSet, basename="supplier")
r.register("accounts", treasury.MoneyAccountViewSet, basename="moneyaccount")
r.register("transactions", treasury.MoneyTransactionViewSet)
r.register("expense-categories", treasury.ExpenseCategoryViewSet)
r.register("expenses", treasury.ExpenseViewSet)
r.register("sales", sales.SalesInvoiceViewSet)
r.register("sales-returns", sales.SalesReturnViewSet)
r.register("purchases", purchases.PurchaseInvoiceViewSet)
r.register("audit-log", reports.AuditViewSet)

api = [
    path("auth/login/", acc.LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/logout/", TokenBlacklistView.as_view()),
    path("auth/me/", acc.MeView.as_view()),
    path("auth/change-password/", acc.change_password),
    path("health/", core.health),
    path("settings/", core.shop_settings),
    path("search/", core.search),
    path("notifications/", core.notifications),
    path("backups/", core.backups),
    path("price-board/", pricing.board),
    path("inventory/valuation/", inv.valuation),
    path("payment-methods/", treasury.payment_methods),
    path("reports/dashboard/", reports.dashboard),
    path("reports/sales/", reports.sales_report),
    path("reports/sales.csv", reports.sales_report_csv),
    path("reports/daily-close/", reports.daily_close),
    path("reports/inventory/", reports.inventory_report),
    path("reports/balances/<str:kind>/", reports.balances),
    path("", include(r.urls)),
]

urlpatterns = [path("admin/", admin.site.urls), path("api/v1/", include(api))]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
