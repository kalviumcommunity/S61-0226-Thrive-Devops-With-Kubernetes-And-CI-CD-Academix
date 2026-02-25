import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

print("API Key:", GOOGLE_API_KEY[:20] + "..." if GOOGLE_API_KEY else "NOT SET")

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = "Provide a 2-3 sentence guide to learning programming"
        response = model.generate_content(prompt)
        print("✓ Gemini API is working!")
        print("Response:", response.text)
    except Exception as e:
        print("✗ Gemini API error:", str(e))
else:
    print("✗ API key not set!")
