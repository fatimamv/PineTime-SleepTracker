# ---- Fase build -------------------------------------------
    FROM python:3.10-slim AS build

    # Instala compiladores y libs necesarias para numpy/scipy
    RUN apt-get update && \
        apt-get install -y --no-install-recommends \
            build-essential gfortran pkg-config wget curl \
            libopenblas-dev liblapack-dev && \
        rm -rf /var/lib/apt/lists/*
    
    WORKDIR /app
    COPY requirements.txt .
    
    # Instala deps en un venv para aligerar la imagen final
    RUN python -m venv /opt/venv && \
        . /opt/venv/bin/activate && \
        pip install --upgrade pip && \
        pip install --no-cache-dir -r requirements.txt
    
    # ---- Fase runtime -----------------------------------------
    FROM python:3.10-slim
    
    ENV VIRTUAL_ENV=/opt/venv
    ENV PATH="$VIRTUAL_ENV/bin:$PATH"
    
    # Copia las libs ya compiladas
    COPY --from=build /opt/venv /opt/venv
    
    WORKDIR /app
    COPY backend/ backend/
    
    # Puerto que Railway inyecta en $PORT
    CMD ["uvicorn", "backend.metrics.api:app", "--host", "0.0.0.0", "--port", "8000"]
    