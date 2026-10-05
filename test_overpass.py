import requests

query = r'''
[out:json][timeout:60];
area["ISO3166-2"="IN-UK"]->.uk;
way["highway"]["cutting"](area.uk);
out tags 5;
'''

response = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=query,
    headers={"User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"},
    timeout=90,
)

print("STATUS:", response.status_code)
print(response.text[:3000])
