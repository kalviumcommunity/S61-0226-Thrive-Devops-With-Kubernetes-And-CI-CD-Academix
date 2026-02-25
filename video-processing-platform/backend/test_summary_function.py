import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from main import generate_ai_summary, MONGO_URL, MONGO_DB_NAME

async def run():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[MONGO_DB_NAME]
    lecture = await db.lectures.find_one({"slug": "introduction-to-programming-612c01b1"})
    title = lecture.get("title")
    description = lecture.get("description")
    transcript = lecture.get("transcript", [])
    print("Calling generate_ai_summary with", title, description, transcript)
    res = await generate_ai_summary(title, description, transcript)
    print("Result:", res)

if __name__ == "__main__":
    asyncio.run(run())
