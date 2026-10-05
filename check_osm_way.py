import requests
import json

WAY_ID = 232259368

urls = [
    f"https://api.openstreetmap.org/api/0.6/way/{WAY_ID}.json",
]

headers = {
    "User-Agent": "Drishti-Himalaya/1.0 (hackathon project)"
}

for url in urls:
    print("Checking OSM way:", WAY_ID)
    print("URL:", url)

    try:
        r = requests.get(url, headers=headers, timeout=30)

        print("STATUS:", r.status_code)

        if r.status_code == 200:
            data = r.json()

            with open(
                "osm_target_way.json",
                "w",
                encoding="utf-8"
            ) as f:
                json.dump(data, f, indent=2)

            print("\nSUCCESS!")
            print("Way found:", WAY_ID)
            print("Saved: osm_target_way.json")

            for element in data.get("elements", []):
                print("\nTYPE:", element.get("type"))
                print("ID:", element.get("id"))
                print("TAGS:", element.get("tags"))

            break

        else:
            print("ERROR:")
            print(r.text[:1000])

    except Exception as e:
        print("REQUEST ERROR:", e)
