"""
AgriTrade Analytics — Python analytics/ML microservice.
Runs alongside your existing Node/Express server, reading from the
same MongoDB. Your React dashboard calls this service directly for
all analytics/prediction/recommendation endpoints.

Run locally:
    pip install -r requirements.txt
    uvicorn app.main:app --reload --port 8000

Then visit http://localhost:8000/docs for interactive API docs.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.analytics import router as analytics_router

app = FastAPI(title="AgriTrade Analytics Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your React app's origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analytics_router)


@app.get("/")
def root():
    return {"status": "AgriTrade Analytics Service is online"}


@app.get("/api/health")
def health():
    return {"status": "ok"}
