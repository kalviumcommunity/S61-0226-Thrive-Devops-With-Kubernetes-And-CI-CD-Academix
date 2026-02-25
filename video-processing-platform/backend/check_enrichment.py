import urllib.request
import json

url = 'http://127.0.0.1:8000/api/lectures'
try:
    with urllib.request.urlopen(url, timeout=10) as response:
        lectures = json.loads(response.read().decode())
        print('Total lectures:', len(lectures))
        print()
        for i, lecture in enumerate(lectures[:3], 1):
            print('Lecture', i, '-', lecture.get('title', 'Unknown'))
            print('  Slug:', lecture.get('slug'))
            print('  Duration:', lecture.get('duration', 'N/A'))
            print('  Summary:', 'YES' if lecture.get('aiSummary') else 'NO')
            print('  Transcript segments:', len(lecture.get('transcript', [])))
            print('  Key concepts:', len(lecture.get('keyConcepts', [])))
            if lecture.get('aiSummary'):
                print('  Summary:', lecture.get('aiSummary')[:100] + '...')
            print()
except Exception as e:
    print('Error:', str(e))
