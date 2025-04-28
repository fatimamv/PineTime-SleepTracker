FROM python:3.10-slim AS build

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    gfortran \
    python3-all \
    python3-venv \
    python3-distutils \
    python3-dev \
    python3-setuptools \
    pkg-config \
    libatlas-base-dev \
    libopenblas-dev \
    liblapack-dev \
    libffi-dev \
    git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Paso 1: Librerías base y conflictivas primero
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install cython && \
    pip install --prefer-binary --only-binary=:all: numpy==1.23.5 pandas==1.3.5 scipy==1.9.3 scikit-learn==1.0.2
    
# Paso 2: Librerías científicas
RUN . /opt/venv/bin/activate && \
    pip install pyActigraphy==1.2.2 pyhrv==0.4.1 neurokit2==0.2.7 statsmodels==0.13.5

# Paso 3: Otras dependencias
RUN . /opt/venv/bin/activate && \
    pip install fastapi==0.110.0 uvicorn==0.29.0 lmfit pyexcel plotly requests peakutils==1.3.4 lxml postgrest==0.13.2

# Paso 4: Clon de spm1d
RUN . /opt/venv/bin/activate && \
    pip install git+https://github.com/0todd0000/spm1d.git

# Paso 5: Supabase 
RUN . /opt/venv/bin/activate && \
    pip install supabase==1.0.3

# Paso Final: Asegurar versión correcta de numpy
RUN . /opt/venv/bin/activate && \
    pip install numpy==1.23.5

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
