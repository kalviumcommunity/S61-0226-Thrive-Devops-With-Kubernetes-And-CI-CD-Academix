import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()
api=os.getenv("GOOGLE_API_KEY")
print("Key set?", bool(api))
if api:
    genai.configure(api_key=api)
    prompt="""You are an expert educational content analyst. Create a concise, engaging 2-3 sentence summary for this lecture.

Title: Introduction to Programming
Description: In this course, you will learn basics of computer programming and computer science.
Transcript excerpt: "Welcome to the Introduction to Programming course! In this lecture, we will cover the fundamental concepts of programming, including variables, data types, and control structures. By the end of this course, you'll have a solid foundation to start your programming journey and create your own applications."

Summary (2-3 sentences, engaging and informative):"""
    resp=genai.GenerativeModel("gemini-2.5-flash").generate_content(prompt)
    print(resp.text)
