# ─── Build stage ───────────────────────────────────────────────────────────
FROM python:3.10-slim AS build
ENV DEBIAN_FRONTEND=noninteractive

# 1) Instala dependencias del sistema necesarias
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential gcc gfortran python3-venv python3-distutils python3-dev \
      libatlas-base-dev libopenblas-dev liblapack-dev \
 && rm -rf /var/lib/apt/lists/*

# 2) Crea el entorno virtual
RUN python3 -m venv /opt/venv

# 3) Instala pip, setuptools, wheel
RUN /opt/venv/bin/pip install --upgrade pip setuptools wheel

# 4) Copia requirements
WORKDIR /app
COPY requirements.txt .

# 5) Instala `spectrum` y el resto
RUN /opt/venv/bin/pip install spectrum \
 && /opt/venv/bin/pip install -r requirements.txt

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM python:3.10-slim

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libatlas-base-dev libopenblas-dev liblapack-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY backend/ backend/

ENV PYTHONPATH="/app/backend/metrics:${PYTHONPATH}"
CMD ["uvicorn", "backend.metrics.api:app", "--host", "0.0.0.0", "--port", "8000"]