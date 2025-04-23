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

RUN apt-get update && apt-get install -y build-essential git

# Crea venv y compila libs
RUN python -m venv /opt/venv && \
    . /opt/venv/bin/activate && \
    pip install --upgrade pip setuptools wheel && \
    pip install pandas==2.1.4 scipy==1.10.1 scikit-learn==1.3.2 && \
    pip install pyActigraphy==1.2.2 --no-deps && \
    pip install pyhrv==0.4.1 neurokit2==0.2.7 && \
    pip install fastapi==0.110.0 uvicorn==0.29.0 supabase==2.3.2 && \
    pip install lmfit && \
    pip install statsmodels==0.13.5 && \
    pip install numba==0.56.4 && \
    pip install git+https://github.com/0todd0000/spm1d.git && \
    pip install pyexcel && \
    pip install accelerometer==7.0.0

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
