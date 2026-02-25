import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    try:
        print("Available models:")
        for model in genai.list_models():
            if "generateContent" in model.supported_generation_methods:
                print(f"  ✓ {model.name}")
    except Exception as e:
        print("Error listing models:", str(e))
