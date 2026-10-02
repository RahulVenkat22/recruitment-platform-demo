import json
import logging
import re
from datetime import UTC, datetime

from django.conf import settings


class JsonFormatter(logging.Formatter):
    def format(self, record):
        message = record.getMessage()
        for key in (
            "SECRET_KEY",
            "OPENAI_API_KEY",
            "GEMINI_API_KEY",
            "VAPI_API_KEY",
            "VAPI_WEBHOOK_SECRET",
            "EMAIL_HOST_PASSWORD",
            "ORIGIN_VERIFY_SECRET",
        ):
            value = getattr(settings, key, "")
            if value:
                message = message.replace(value, "[redacted]")
        message = re.sub(r"(?:https?|rediss?|postgres(?:ql)?)://\S+", "[url]", message)
        message = re.sub(r"[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}", "[email]", message)
        message = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[token]", message)
        return json.dumps(
            {
                "time": datetime.now(UTC).isoformat(),
                "level": record.levelname,
                "logger": record.name,
                "message": message[:4000],
                **(
                    {"exception_type": record.exc_info[0].__name__}
                    if record.exc_info and record.exc_info[0]
                    else {}
                ),
            }
        )
