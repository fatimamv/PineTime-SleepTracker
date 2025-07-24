# PineTimeApp

## Overview

PineTimeApp is a backend API built with FastAPI and Python, designed for providing access to sleep raw data from Pine Time smartwatch as well as some calculated metrics. This guide will help you set up and run the project using Docker (recommended) or locally on your machine. It also includes instructions for running the React Native app.

---

## Prerequisites

- **Docker** (recommended for easiest backend setup)
- Alternatively, for local backend development:
  - **Python 3.10**
  - **pip** (Python package manager)
  - **virtualenv** (optional but recommended)
- For the mobile app:
  - **Node.js** and **npm** or **yarn**
  - **Android Studio** and/or **Xcode** (for running on Android/iOS)
  - **React Native CLI** (installed globally with `npm install -g react-native-cli`)

---

## 1. Clone the Repository

```sh
git clone https://github.com/yourusername/PineTimeApp.git
cd PineTimeApp
```

---

## 2. Running the Backend with Docker (Recommended)

1. **Build the Docker image:**
   ```sh
   docker build -t pinetimeapp .
   ```
2. **Run the Docker container:**
   ```sh
   docker run -p 8000:8000 pinetimeapp
   ```
3. The API will be available at: [http://localhost:8000](http://localhost:8000)

---

## 3. Running the Backend Locally (Without Docker)

1. **Create a virtual environment:**
   ```sh
   python3 -m venv venv
   source venv/bin/activate
   ```
2. **Upgrade pip and install dependencies:**
   ```sh
   pip install --upgrade pip
   pip install -r requirements.txt
   pip install spectrum
   ```
3. **Start the API server:**
   ```sh
   uvicorn backend.metrics.api:app --host 0.0.0.0 --port 8000
   ```
4. The API will be available at: [http://localhost:8000](http://localhost:8000)

---

## 4. Running the React Native App

1. **Install dependencies:**
   ```sh
   npm install
   # or
   yarn install
   ```
2. **Start the Metro bundler:**
   ```sh
   npm start
   # or
   yarn start
   ```
3. **Run the app on your device or emulator:**
   - For Android:
     ```sh
     npm run android
     # or
     yarn android
     ```
   - For iOS (on MacOS):
     ```sh
     npm run ios
     # or
     yarn ios
     ```

---

## 5. Additional Notes

- If you need to install system dependencies for the backend (for example, on Ubuntu), you may need:
  ```sh
  sudo apt-get update
  sudo apt-get install build-essential gcc gfortran python3-dev libatlas-base-dev libopenblas-dev liblapack-dev
  ```
- For MacOS, you may need to use Homebrew to install some libraries if you run into errors.

---
