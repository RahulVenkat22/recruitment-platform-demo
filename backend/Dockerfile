# CI resolves this tag to a digest and supplies BASE_IMAGE for immutable releases.
ARG BASE_IMAGE=python:3.12-slim
FROM ${BASE_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod
WORKDIR /app
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --home-dir /app --shell /usr/sbin/nologin app
COPY requirements.lock ./
RUN pip install --require-hashes --requirement requirements.lock
COPY . .
RUN DJANGO_SETTINGS_MODULE=config.settings.build python manage.py collectstatic --noinput \
    && mkdir -p /app/media && chown app:app /app/media
RUN chown 10001:10001 /tmp && chmod 1777 /tmp
USER 10001:10001
VOLUME ["/tmp"]
EXPOSE 8200
CMD ["gunicorn", "--config", "gunicorn.conf.py", "config.wsgi:application"]
