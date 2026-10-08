FROM node:24-bookworm-slim AS frontend
WORKDIR /src
COPY package.json package-lock.json tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY frontend ./frontend
RUN npm ci && npm run build

FROM ollama/ollama:0.12.3 AS ollama

FROM python:3.12-slim-bookworm
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       libgl1 \
       libglib2.0-0 \
       supervisor \
       tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ollama /bin/ollama /usr/local/bin/ollama

RUN groupadd --system csrassist \
    && useradd --system --gid csrassist --create-home csrassist

WORKDIR /opt/csr-assist
COPY requirements.lock ./
RUN python -m venv /opt/csr-assist/venv \
    && /opt/csr-assist/venv/bin/pip install \
       --index-url "${PIP_INDEX_URL}" \
       --no-cache-dir \
       -r requirements.lock

COPY backend ./backend
COPY sample-documents ./sample-documents
COPY docs/BUSINESS-REQUIREMENTS.md ./sample-documents/BUSINESS-REQUIREMENTS.md
COPY --from=frontend /src/backend/csr_assist/static ./backend/csr_assist/static
COPY docker/supervisord.conf /etc/supervisor/conf.d/csr-assist.conf
COPY docker/entrypoint.sh /usr/local/bin/csr-assist-entrypoint
COPY docker/demo-entrypoint.sh /usr/local/bin/csr-assist-demo-entrypoint

RUN chmod 0755 \
       /usr/local/bin/csr-assist-entrypoint \
       /usr/local/bin/csr-assist-demo-entrypoint \
    && sed -i 's/\r$//' \
       /usr/local/bin/csr-assist-entrypoint \
       /usr/local/bin/csr-assist-demo-entrypoint \
    && mkdir -p /data/documents /data/index /data/config /data/models \
    && chown -R csrassist:csrassist /opt/csr-assist /data /home/csrassist

EXPOSE 8080
VOLUME ["/data/documents", "/data/index", "/data/config", "/data/models"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/opt/csr-assist/venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=3)"]
ENTRYPOINT ["/usr/local/bin/csr-assist-entrypoint"]
