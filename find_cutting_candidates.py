import requests
import json

OVERPASS = "https://overpass-api.de/api/interpreter"

# Uttarakhand OSM relation
RELATION_ID = 3649

query = f"""
[out:json][timeout:60];
area({RELATION_ID})->.uttarakhand;
way["highway"]["cutting"](area.uttarakhand);
out tags;
"""

headers = {
    "User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"
}

print("Searching Uttarakhand cutting ways...")

try:
    r = requests.post(
        OVERPASS,
        data=query,
        headers=headers,
        timeout=90
    )

    print("STATUS:", r.status_code)

    if r.status_code != 200:
        print(r.text[:1500])
        raise SystemExit

    data = r.json()
    ways = data.get("elements", [])

    print("CUTTING WAYS:", len(ways))

    for way in ways[:10]:
        print(
            "WAY:",
            way.get("id"),
            "|",
            way.get("tags", {})
        )

    with open(
        "uttarakhand_cutting_candidates.json",
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            {
                "source": "OpenStreetMap",
                "state": "Uttarakhand",
                "count": len(ways),
                "elements": ways
            },
            f,
            indent=2
        )

    print("\nSaved: uttarakhand_cutting_candidates.json")

except requests.exceptions.Timeout:
    print("REQUEST TIMED OUT")
except Exception as e:
    print("ERROR:", e)
