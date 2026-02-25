import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from main import enrich_existing_lectures, MONGO_URL, MONGO_DB_NAME

async def run():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[MONGO_DB_NAME]
    await enrich_existing_lectures(db)
    print("Done enrichment")

if __name__ == "__main__":
    asyncio.run(run())
