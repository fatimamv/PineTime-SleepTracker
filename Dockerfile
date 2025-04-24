FROM python:3.10-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        g++ \
        python3-distutils \
        python3-dev \
        gfortran \
        pkg-config \
        libatlas-base-dev \
        libopenblas-dev \
        liblapack-dev \
        libffi-dev \
        libblas-dev \
        libquadmath0 \
        libgfortran5 \
        git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

RUN apt-get update && apt-get install -y build-essential git

# Crea venv y compila libs
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install cython && \
    pip install -r requirements.txt
    
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

ENV PYTHONPATH="/app/backend/metrics:${PYTHONPATH}"

CMD ["uvicorn", "backend.metrics.api:app", "--host", "0.0.0.0", "--port", "8000"]
