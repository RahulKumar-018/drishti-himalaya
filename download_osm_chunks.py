import requests
import json

chunks = [
    ("west", 29.0, 76.5, 30.2, 78.0),
    ("central", 29.0, 78.0, 30.2, 79.2),
    ("east", 29.0, 79.2, 31.2, 81.0),
    ("north", 30.2, 76.5, 31.5, 81.0),
]

headers = {
    "User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"
}

all_elements = []

for name, south, west, north, east in chunks:
    print(f"\nDownloading {name} chunk...")

    query = f'''
    [out:json][timeout:120][date:"2018-06-01T00:00:00Z"];
    way["highway"]["cutting"]({south},{west},{north},{east});
    out tags geom;
    '''

    r = requests.post(
        "https://overpass-api.de/api/interpreter",
        data=query,
        headers=headers,
        timeout=180,
    )

    print("STATUS:", r.status_code)

    if r.status_code != 200:
        print(r.text[:1000])
        continue

    data = r.json()
    elements = data.get("elements", [])

    print("WAYS:", len(elements))

    all_elements.extend(elements)

# Deduplicate by OSM way ID
unique = {}
for e in all_elements:
    if e.get("type") == "way":
        unique[e["id"]] = e

elements = list(unique.values())

positive = [
    e for e in elements
    if e.get("tags", {}).get("cutting", "").lower()
    in {"yes", "left", "right"}
]

negative = [
    e for e in elements
    if e.get("tags", {}).get("cutting", "").lower()
    in {"no", "track"}
]

target = [
    e for e in elements
    if e.get("id") == 232259368
]

print("\n========== RESULT ==========")
print("TOTAL UNIQUE WAYS:", len(elements))
print("POSITIVE:", len(positive))
print("NEGATIVE:", len(negative))
print(
    "WAY 232259368:",
    "FOUND" if target else "NOT FOUND"
)

if target:
    print("TARGET TAGS:", target[0].get("tags"))

with open("osm_historical_chunks.json", "w", encoding="utf-8") as f:
    json.dump(
        {"type": "FeatureCollection", "elements": elements},
        f,
        indent=2
    )

print("\nSaved: osm_historical_chunks.json")
