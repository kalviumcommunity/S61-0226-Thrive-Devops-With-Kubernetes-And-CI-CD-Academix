import urllib.request
import json

url = 'http://127.0.0.1:8000/api/enrich-existing'
try:
    req = urllib.request.Request(url, method='POST')
    with urllib.request.urlopen(req, timeout=60) as response:
        data = json.loads(response.read().decode())
        print('✓ Enrichment started!')
        print('  Lectures processed:', data.get('processed', 0))
        print('  Status:', data.get('status', 'unknown'))
except Exception as e:
    print('Error:', str(e))
