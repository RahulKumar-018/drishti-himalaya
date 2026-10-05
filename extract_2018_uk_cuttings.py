import osmium
import json

PBF = "india-180101.osm.pbf"
OUTPUT = "uttarakhand_cuttings_2018.json"

SOUTH = 28.7
WEST  = 77.5
NORTH = 31.5
EAST  = 81.0

class Handler(osmium.SimpleHandler):

    def __init__(self):
        super().__init__()
        self.results = []

    def way(self, w):
        tags = {k: v for k, v in w.tags}

        if tags.get("cutting", "").lower() != "yes":
            return

        coords = []

        for node in w.nodes:
            try:
                lon = node.lon
                lat = node.lat

                if WEST <= lon <= EAST and SOUTH <= lat <= NORTH:
                    coords.append([lon, lat])
            except:
                pass

        if coords:
            self.results.append({
                "id": w.id,
                "tags": tags,
                "coordinates": coords
            })

h = Handler()

print("Scanning 2018 India OSM data...")
print("Please wait...")

h.apply_file(PBF, locations=True)

print()
print("UTTARAKHAND CUTTINGS:", len(h.results))

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(h.results, f, indent=2, ensure_ascii=False)

print("Saved:", OUTPUT)

for x in h.results:
    print(
        x["id"],
        "|",
        x["tags"].get("name", "Unnamed"),
        "|",
        x["tags"].get("highway", "-")
    )
