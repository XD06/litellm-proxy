FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PROXY_CONFIG_PATH=/app/config.json \
    PROXY_RUNTIME_CONFIG_PATH=/app/runtime_config.json

WORKDIR /app

RUN useradd --create-home --shell /usr/sbin/nologin appuser

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/tmp /app/proxy_logs /app/data && \
    chown -R appuser:appuser /app

USER appuser

EXPOSE 4894

CMD ["python", "-u", "sse2json.py"]
