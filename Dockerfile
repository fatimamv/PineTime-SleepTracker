FROM python:3.10-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        python3-distutils \
        python3-dev \
        gfortran \
        pkg-config \
        libatlas-base-dev \
        libopenblas-dev \
        liblapack-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Crea venv y compila libs
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# -------- Runtime image ----------
FROM python:3.10-slim

ENV VIRTUAL_ENV=/opt/venv
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# BLAS runtime libs
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libatlas-base-dev libopenblas-dev liblapack-dev && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /opt/venv /opt/venv
WORKDIR /app
COPY backend/ backend/

CMD ["uvicorn", "backend.metrics.api:app", "--host", "0.0.0.0", "--port", "8000"]
