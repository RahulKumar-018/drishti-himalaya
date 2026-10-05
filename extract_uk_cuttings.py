import osmium
import json

PBF = "northern-zone-latest.osm.pbf"
OUTPUT = "uttarakhand_cuttings.json"

# Approximate Uttarakhand bounding box
SOUTH = 28.7
WEST  = 77.5
NORTH = 31.5
EAST  = 81.0

class Handler(osmium.SimpleHandler):

    def __init__(self):
        super().__init__()
        self.cuttings = []

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

            except Exception:
                pass

        if coords:
            self.cuttings.append({
                "id": w.id,
                "tags": tags,
                "coordinates": coords
            })

h = Handler()

print("Reading PBF with coordinates...")
h.apply_file(PBF, locations=True)

print()
print("UTTARAKHAND BBOX CUTTINGS:", len(h.cuttings))

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(h.cuttings, f, indent=2, ensure_ascii=False)

print("Saved:", OUTPUT)

print()
for x in h.cuttings:
    print(
        "WAY:", x["id"],
        "|",
        x["tags"].get("name", "Unnamed"),
        "|",
        x["tags"].get("highway", "-"),
        "| POINTS:", len(x["coordinates"])
    )
