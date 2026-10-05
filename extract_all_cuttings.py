import osmium
import json

PBF = "northern-zone-latest.osm.pbf"
OUTPUT = "all_northern_cuttings.json"

class Handler(osmium.SimpleHandler):

    def __init__(self):
        super().__init__()
        self.cutting = []

    def way(self, w):
        tags = {k: v for k, v in w.tags}

        if tags.get("cutting", "").lower() == "yes":
            self.cutting.append({
                "id": w.id,
                "tags": tags
            })

h = Handler()

print("Reading PBF...")
h.apply_file(PBF)

print()
print("TOTAL CUTTING WAYS:", len(h.cutting))

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(
        h.cutting,
        f,
        indent=2,
        ensure_ascii=False
    )

print("Saved:", OUTPUT)

print()
print("FIRST 20:")

for x in h.cutting[:20]:
    print(
        "WAY:",
        x["id"],
        "| NAME:",
        x["tags"].get("name", "Unnamed"),
        "| HIGHWAY:",
        x["tags"].get("highway", "-")
    )
