FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PROXY_CONFIG_PATH=/app/config.json \
    PROXY_RUNTIME_CONFIG_PATH=/app/runtime_config.json \
    # LLM payloads are multi-MB strings allocated outside pymalloc; without a
    # cap glibc opens one 64MB arena per worker thread and container RSS
    # ratchets up to the daily watermark. (The proxy also malloc_trim()s once
    # a minute; fewer arenas make that trim able to actually return pages.)
    MALLOC_ARENA_MAX=2

WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser

RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/tmp /app/proxy_logs /app/data && \
    chown -R appuser:appuser /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 4894

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["python", "-u", "sse2json.py"]
