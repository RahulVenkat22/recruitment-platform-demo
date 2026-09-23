# Django API image: gunicorn on 8200, static files served by whitenoise, non-root.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app --shell /usr/sbin/nologin app

# psycopg[binary] and argon2-cffi ship wheels, so no compiler is needed.
COPY requirements.txt ./
RUN pip install --requirement requirements.txt

COPY . .

# Admin and docs static files, hashed and compressed for whitenoise. No database access.
RUN DJANGO_SECRET_KEY=build-time-only python manage.py collectstatic --noinput \
    && chown -R app:app /app

USER app

EXPOSE 8200

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8200", \
     "--workers", "3", \
     "--timeout", "300", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
