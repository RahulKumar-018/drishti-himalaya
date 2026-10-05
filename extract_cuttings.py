import osmium
import json

PBF_FILE = "northern-zone-latest.osm.pbf"
OUTPUT_FILE = "uttarakhand_cutting_current.json"

SOUTH = 28.7
WEST = 77.5
NORTH = 31.5
EAST = 81.0


def inside_bbox(lon, lat):
    return (
        WEST <= lon <= EAST
        and SOUTH <= lat <= NORTH
    )


class CuttingHandler(osmium.SimpleHandler):

    def __init__(self):
        super().__init__()
        self.ways = []

    def way(self, w):

        tags = {k: v for k, v in w.tags}

        if tags.get("cutting", "").lower() != "yes":
            return

        geometry = []

        for node in w.nodes:
            if not node.location.valid():
                continue

            lon = node.lon
            lat = node.lat

            geometry.append([lon, lat])

        if not geometry:
            return

        # Keep if ANY point lies inside Uttarakhand bbox
        if not any(
            inside_bbox(lon, lat)
            for lon, lat in geometry
        ):
            return

        self.ways.append({
            "id": w.id,
            "tags": tags,
            "geometry": geometry
        })


print("========================================")
print("Drishti Himalaya - Uttarakhand Extractor")
print("========================================")
print("Reading:", PBF_FILE)
print()

handler = CuttingHandler()

# IMPORTANT: locations=True
handler.apply_file(
    PBF_FILE,
    locations=True
)

print("Uttarakhand cutting ways:", len(handler.ways))

result = {
    "type": "FeatureCollection",
    "source": "OpenStreetMap",
    "region": "Uttarakhand",
    "feature": "cutting=yes",
    "count": len(handler.ways),
    "elements": handler.ways
}

with open(
    OUTPUT_FILE,
    "w",
    encoding="utf-8"
) as f:
    json.dump(
        result,
        f,
        indent=2,
        ensure_ascii=False
    )

print("Saved:", OUTPUT_FILE)

print()
print("First 20 ways:")

for way in handler.ways[:20]:
    print(
        way["id"],
        "|",
        way["tags"].get("name", "Unnamed"),
        "|",
        way["tags"].get("highway", "N/A")
    )
