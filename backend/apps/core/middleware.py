import logging
import time

logger = logging.getLogger("goldshop.request")


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start = time.monotonic()
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            logger.info(
                "request",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status": response.status_code,
                    "duration_ms": round((time.monotonic() - start) * 1000, 1),
                    "user_id": getattr(getattr(request, "user", None), "pk", None),
                },
            )
        return response
