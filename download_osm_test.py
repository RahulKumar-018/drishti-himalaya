import requests

query = r'''
[out:json][timeout:180];
area["ISO3166-2"="IN-UK"]->.uk;
way["highway"]["cutting"](area.uk);
out tags geom;
'''

print("Downloading Uttarakhand OSM cutting ways...")

response = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=query,
    headers={"User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"},
    timeout=240,
)

print("STATUS:", response.status_code)
print("SIZE:", len(response.content), "bytes")

if response.status_code != 200:
    print(response.text[:2000])
    raise SystemExit(1)

with open("osm_uttarakhand_raw.json", "wb") as f:
    f.write(response.content)

data = response.json()
elements = data.get("elements", [])

print("TOTAL WAYS:", len(elements))

positive = [
    e for e in elements
    if e.get("tags", {}).get("cutting", "").lower() in {"yes", "left", "right"}
]

print("POSITIVE CUTTING:", len(positive))

mahakali = [
    e for e in elements
    if e.get("type") == "way" and e.get("id") == 232259368
]

print("MAHAKALI way/232259368:", "FOUND" if mahakali else "NOT FOUND")

print("\nFirst 3 ways:")
for e in elements[:3]:
    print(e["id"], e.get("tags", {}))
