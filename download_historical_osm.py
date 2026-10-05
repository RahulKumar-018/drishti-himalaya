import requests

query = r'''
[out:json][timeout:180][date:"2018-06-01T00:00:00Z"];
area["ISO3166-2"="IN-UK"]->.uk;
way["highway"]["cutting"](area.uk);
out tags geom;
'''

print("Downloading historical Uttarakhand OSM cutting ways...")
print("Date: 2018-06-01")

r = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=query,
    headers={"User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"},
    timeout=240,
)

print("STATUS:", r.status_code)
print("SIZE:", len(r.content), "bytes")

if r.status_code != 200:
    print(r.text[:3000])
    raise SystemExit(1)

data = r.json()
elements = data.get("elements", [])

print("TOTAL WAYS:", len(elements))

positive = [
    e for e in elements
    if e.get("tags", {}).get("cutting", "").lower() in {"yes", "left", "right"}
]

negative = [
    e for e in elements
    if e.get("tags", {}).get("cutting", "").lower() in {"no", "track"}
]

print("POSITIVE:", len(positive))
print("NEGATIVE:", len(negative))

target = [
    e for e in elements
    if e.get("type") == "way" and e.get("id") == 232259368
]

print("WAY 232259368:", "FOUND" if target else "NOT FOUND")

with open("osm_historical_uttarakhand.json", "wb") as f:
    f.write(r.content)

print("Saved: osm_historical_uttarakhand.json")
