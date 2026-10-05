import requests
import json

WAY_ID = 232259368
URL = f"https://api.openstreetmap.org/api/0.6/way/{WAY_ID}/history.json"

headers = {
    "User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"
}

print("Downloading way history...")
r = requests.get(URL, headers=headers, timeout=30)

print("STATUS:", r.status_code)

if r.status_code == 200:
    data = r.json()

    with open("osm_way_history.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print("SUCCESS!")
    print("Saved: osm_way_history.json")
    print("Versions:", len(data.get("elements", [])))

    for e in data.get("elements", []):
        print(
            "Version:", e.get("version"),
            "| Timestamp:", e.get("timestamp"),
            "| Visible:", e.get("visible"),
            "| Tags:", e.get("tags")
        )

else:
    print("ERROR:")
    print(r.text[:1000])
