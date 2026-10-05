import requests

query = r'''
[out:json][timeout:60][date:"2018-06-01T00:00:00Z"];
way["highway"]["cutting"](29.55,80.44,29.61,80.51);
out tags geom;
'''

r = requests.post(
    "https://overpass-api.de/api/interpreter",
    data=query,
    headers={"User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"},
    timeout=90,
)

print("STATUS:", r.status_code)
print("SIZE:", len(r.content), "bytes")

if r.status_code == 200:
    data = r.json()
    elements = data.get("elements", [])
    print("WAYS:", len(elements))

    for e in elements:
        if e.get("id") == 232259368:
            print("TARGET WAY FOUND:", e.get("tags"))
else:
    print(r.text[:2000])
