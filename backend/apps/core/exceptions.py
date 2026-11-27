from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_handler

from gold_engine import EngineError


class BusinessError(Exception):
    """A rule violation the user can fix (insufficient stock, missing price...)."""

    def __init__(self, message, code="business_rule", field=None):
        super().__init__(message)
        self.message, self.code, self.field = message, code, field


def exception_handler(exc, context):
    if isinstance(exc, BusinessError):
        body = {"detail": exc.message, "code": exc.code}
        if exc.field:
            body["field"] = exc.field
        return Response(body, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, EngineError):
        return Response({"detail": str(exc), "code": "calculation"}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, DjangoValidationError):
        msg = "; ".join(exc.messages)
        return Response({"detail": msg, "code": "validation"}, status=status.HTTP_400_BAD_REQUEST)
    return drf_handler(exc, context)
