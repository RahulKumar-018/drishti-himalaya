import osmium

PBF_FILE = "northern-zone-latest.osm.pbf"

class Handler(osmium.SimpleHandler):

    def __init__(self):
        super().__init__()
        self.total_ways = 0
        self.cutting_yes = 0
        self.examples = []

    def way(self, w):
        self.total_ways += 1

        tags = {k: v for k, v in w.tags}

        if tags.get("cutting", "").lower() == "yes":
            self.cutting_yes += 1

            if len(self.examples) < 10:
                self.examples.append({
                    "id": w.id,
                    "tags": tags
                })

print("Reading PBF...")
print()

h = Handler()

h.apply_file(PBF_FILE)

print("TOTAL WAYS:", h.total_ways)
print("CUTTING=YES:", h.cutting_yes)

print()
print("Examples:")

for e in h.examples:
    print(
        "WAY:",
        e["id"],
        "|",
        e["tags"]
    )
