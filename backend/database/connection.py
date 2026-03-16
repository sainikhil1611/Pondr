from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from .models import ALL_MODELS
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_DB_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB_NAME", "pondr")

client: AsyncIOMotorClient = None


async def connect_db():
    global client
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    await init_beanie(database=db, document_models=ALL_MODELS)
    return db


async def close_db():
    global client
    if client:
        client.close()


def get_database():
    if client is None:
        raise RuntimeError("Database not initialized. Call connect_db() first.")
    return client[MONGO_DB]
