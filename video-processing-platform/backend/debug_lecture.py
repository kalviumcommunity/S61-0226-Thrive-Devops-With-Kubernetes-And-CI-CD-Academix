import urllib.request
import json

url = 'http://127.0.0.1:8000/api/lectures/introduction-to-programming-612c01b1'
try:
    with urllib.request.urlopen(url, timeout=10) as response:
        lecture = json.loads(response.read().decode())
        print('Lecture:', lecture.get('title'))
        print('Summary field:', repr(lecture.get('aiSummary', 'MISSING')))
        print('Transcript Count:', len(lecture.get('transcript', [])))
        print('Key Concepts:', lecture.get('keyConcepts', []))
except Exception as e:
    print('Error:', str(e))
