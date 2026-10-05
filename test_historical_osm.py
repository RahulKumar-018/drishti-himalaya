import requests

query = r'''
[out:json][timeout:180][date:"2023-02-01T00:00:00Z"];
(
  way["highway"]["cutting"](29.0,77.0,31.5,81.0);
);
out tags;
'''

r = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=query,
    headers={"User-Agent":"Drishti-Himalaya/1.0"},
    timeout=240,
)

print("STATUS:", r.status_code)

if r.status_code == 200:
    data = r.json()
    elements = data.get("elements", [])

    positive = [
        e for e in elements
        if e.get("tags", {}).get("cutting", "").lower() in {"yes","left","right"}
    ]

    target = [
        e for e in elements
        if e.get("id") == 232259368
    ]

    print("TOTAL:", len(elements))
    print("POSITIVE:", len(positive))
    print("WAY 232259368:", "FOUND" if target else "NOT FOUND")

    if target:
        print("TARGET TAGS:", target[0].get("tags", {}))
else:
    print(r.text[:2000])
