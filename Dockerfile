FROM node:22-bookworm-slim AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/yarn.lock ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; \
    yarn install --frozen-lockfile --non-interactive
COPY frontend/ ./
RUN yarn build

FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080
WORKDIR /app
COPY backend/requirements.txt /app/backend/requirements.txt
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export PIP_CERT=/run/secrets/build_ca; fi; \
    pip install --no-cache-dir -r /app/backend/requirements.txt \
    && groupadd --gid 10001 catalogue \
    && useradd --uid 10001 --gid catalogue --no-create-home catalogue
COPY --chown=catalogue:catalogue backend /app/backend
COPY --from=frontend-build --chown=catalogue:catalogue /build/frontend/build /app/frontend/build
USER catalogue
WORKDIR /app/backend
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ['PORT']+'/api/health',timeout=4).read()"
CMD ["sh", "-c", "python wait_for_mongo.py && exec uvicorn server:app --host 0.0.0.0 --port ${PORT}"]
