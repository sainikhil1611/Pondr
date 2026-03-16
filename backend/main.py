import os
import json
import traceback
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root (parent of backend/) so it works when running from backend/ or root
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)
load_dotenv()  # still allow cwd .env to override

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from database.connection import connect_db, close_db
from api import auth, users, graph, gemini, youtube, assess, search, calendar, speech
# from api import decay, gamification  # commented out — secondary features

# #region agent log
import logging as _logging
_debug_logger = _logging.getLogger("debug.500")

def _debug_log_500(path: str, error: str, tb: str):
    _debug_logger.error("500 %s: %s", path, error)
    payload = {"location": "main.py:exception_handler", "message": "500 uncaught", "data": {"path": path, "error": error, "traceback": tb}, "hypothesisId": "H5", "timestamp": datetime.utcnow().isoformat()}
    line = json.dumps(payload) + "\n"
    _dir = os.path.dirname(os.path.abspath(__file__))
    for log_path in [os.path.join(_dir, "..", ".cursor", "debug.log"), os.path.join(_dir, "debug.log")]:
        try:
            log_path = os.path.normpath(log_path)
            d = os.path.dirname(log_path)
            if d:
                os.makedirs(d, exist_ok=True)
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(line)
            break
        except Exception:
            continue
# #endregion


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    yield
    await close_db()


app = FastAPI(
    title="pondr API",
    version="1.0.0",
    description="AI-Powered Adaptive Learning Platform",
    lifespan=lifespan,
)

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
ngrok_url = os.getenv("NGROK_URL", "")
if ngrok_url:
    cors_origins.append(ngrok_url.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.ngrok-free\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(graph.router, prefix="/api/graph", tags=["graph"])
# app.include_router(decay.router, prefix="/api/decay", tags=["decay"])
app.include_router(gemini.router, prefix="/api/gemini", tags=["gemini"])
app.include_router(youtube.router, prefix="/api/youtube", tags=["youtube"])
# app.include_router(gamification.router, prefix="/api/gamification", tags=["gamification"])
app.include_router(assess.router, prefix="/api/assess", tags=["assessment"])
app.include_router(search.router, prefix="/api/search", tags=["search"])
app.include_router(calendar.router, prefix="/api/calendar", tags=["calendar"])
app.include_router(speech.router, prefix="/api/speech", tags=["speech"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Log any uncaught exception to debug.log (H5) then return 500."""
    # #region agent log
    _debug_log_500(request.url.path, str(exc), traceback.format_exc())
    # #endregion
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "pondr"}
