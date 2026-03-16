"""Speech-to-text and text-to-speech endpoints using ElevenLabs API."""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import os
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

ELEVENLABS_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"


@router.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """
    Receive an audio file from the frontend, forward it to ElevenLabs
    Speech-to-Text API, and return the transcribed text.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    audio_bytes = await audio.read()
    logger.info(f"[Speech] Received audio: {len(audio_bytes)} bytes, filename={audio.filename}, content_type={audio.content_type}")
    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    # ElevenLabs STT expects multipart form with 'file' field and 'model_id'
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                ELEVENLABS_STT_URL,
                headers={"xi-api-key": api_key},
                files={"file": (audio.filename or "recording.webm", audio_bytes, audio.content_type or "audio/webm")},
                data={"model_id": "scribe_v1", "language_code": "eng"},
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="ElevenLabs API timed out")

    if resp.status_code != 200:
        detail = resp.text[:300] if resp.text else "Unknown error"
        logger.error(f"[Speech] ElevenLabs error {resp.status_code}: {detail}")
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs API error: {detail}",
        )

    data = resp.json()
    text = data.get("text", "").strip()
    logger.info(f"[Speech] Transcription result: '{text}'")
    if not text:
        raise HTTPException(status_code=422, detail="Could not transcribe audio")

    return {"text": text}


# ── Text-to-Speech ──────────────────────────────────────────────────

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech"
# Default voice: "Rachel" — a clear, professional female voice
DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"


class TTSRequest(BaseModel):
    text: str
    voice_id: str | None = None


@router.post("/tts")
async def text_to_speech(req: TTSRequest):
    """
    Convert text to speech using ElevenLabs TTS API.
    Returns an audio/mpeg stream.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ELEVENLABS_API_KEY not configured")

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No text provided")
    # Cap at 5000 chars to avoid excessive API usage
    if len(text) > 5000:
        text = text[:5000]

    voice_id = req.voice_id or DEFAULT_VOICE_ID
    url = f"{ELEVENLABS_TTS_URL}/{voice_id}"

    logger.info(f"[TTS] Generating speech for {len(text)} chars, voice={voice_id}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.post(
                url,
                headers={
                    "xi-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "text": text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.75,
                        "style": 0.0,
                        "use_speaker_boost": True,
                    },
                },
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail="ElevenLabs TTS API timed out")

    if resp.status_code != 200:
        detail = resp.text[:300] if resp.text else "Unknown error"
        logger.error(f"[TTS] ElevenLabs error {resp.status_code}: {detail}")
        raise HTTPException(
            status_code=resp.status_code,
            detail=f"ElevenLabs TTS error: {detail}",
        )

    logger.info(f"[TTS] Got audio response: {len(resp.content)} bytes")

    return StreamingResponse(
        iter([resp.content]),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )