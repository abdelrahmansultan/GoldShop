from decimal import Decimal

from rest_framework.renderers import JSONRenderer
from rest_framework.utils.encoders import JSONEncoder


class DecimalStringEncoder(JSONEncoder):
    """Money and weights must never pass through binary floats on the wire."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return str(obj)
        return super().default(obj)


class ExactJSONRenderer(JSONRenderer):
    encoder_class = DecimalStringEncoder
