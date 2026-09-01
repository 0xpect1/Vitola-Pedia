#!/usr/bin/env python3
import json, re, sys

BASE = '/Users/xc/Documents/GitHub/Cigar Picker'

new_cigars = [
  {
    "id": "camacho-limited-edition-2026",
    "name": "Camacho Limited Edition 2026",
    "brand": "Camacho",
    "origin": "Honduras",
    "region": "Danlí",
    "wrapper": "Ecuadorian",
    "binder": "Honduran",
    "filler": "Honduran, Nicaraguan, Dominican",
    "strength": 4,
    "smokingTime": 70,
    "price": 17,
    "rating": 90,
    "flavors": ["Spice", "Cream", "Herbs", "Cedar", "Pepper"],
    "size": "Perfecto",
    "length": 6,
    "ringGauge": 56,
    "popularity": 6,
    "description": "The Camacho Limited Edition 2026 is the second release in Camacho's Boldly Built by Masters series, honoring the brand's Master Blending Competence Center. Handcrafted in Honduras as a 6\" \u00d7 56 perfecto, it combines an Ecuadorian wrapper, Honduran binder, and filler tobaccos from Honduras, Nicaragua, and the Dominican Republic. The medium-intense blend delivers evolving notes of spice, cream, and herbs across 60 to 80 minutes. Limited to 4,000 boxes of 15 worldwide.",
    "pairings": ["Cask-Strength Bourbon (Booker's, Elijah Craig Barrel Proof)", "Oaked Chardonnay (Kistler, Far Niente)", "Dark Roast Espresso", "Aged Gouda"],
    "yearFounded": 1962,
    "limited": True
  },
  {
    "id": "powstanie-sbc-26",
    "name": "Powstanie SBC 26",
    "brand": "Powstanie",
    "origin": "Nicaragua",
    "region": "Estel\u00ed",
    "wrapper": "Ecuadorian Sumatra / Mexican San Andr\u00e9s (Barber Pole)",
    "binder": "Brazilian Mata Fina",
    "filler": "Dominican Piloto Mejorado, Nicaraguan Condega/Estel\u00ed/Pueblo Nuevo",
    "strength": 4,
    "smokingTime": 60,
    "price": 18,
    "rating": 91,
    "flavors": ["Earth", "Black Pepper", "Cedar", "Cream", "Spice"],
    "size": "Corona Gorda",
    "length": 5.5,
    "ringGauge": 46,
    "popularity": 5,
    "description": "The Powstanie SBC 26 is the sixth installment in the Surrounded by Champions limited edition series, a passion project by co-founder Gregg Szczepankiewicz. This 5\u00bd\" \u00d7 46 Corona Gorda features a barber-pole wrapper of Ecuadorian Sumatra-seed and Mexican San Andr\u00e9s tobaccos, a Brazilian Mata Fina binder, and filler combining Dominican Piloto Mejorado ligero with Nicaraguan tobaccos from Condega, Estel\u00ed, and Pueblo Nuevo. Made at F\u00e1brica de Tabacos NicaSue\u00f1o S.A. in Nicaragua. Limited to 500 boxes of 20 cigars (10,000 total).",
    "pairings": ["High-Rye Bourbon (Bulleit, Old Grand-Dad Bond)", "Oaky Cabernet Sauvignon (Caymus, Silver Oak)", "Dark Chocolate (85%+ cacao)", "Espresso"],
    "yearFounded": 2015,
    "limited": True,
    "buyLinks": [
      {"retailer": "Mardo Cigars", "url": "https://mardocigars.com/products/powstanie-sbc-26", "price": 18}
    ]
  },
  {
    "id": "emilio-suave-sumatra-robusto",
    "name": "Emilio Suave Sumatra Robusto",
    "brand": "Emilio",
    "origin": "Nicaragua",
    "region": "Estel\u00ed",
    "wrapper": "Sumatra (Indonesian)",
    "binder": "Ecuadorian Habano",
    "filler": "Nicaraguan",
    "strength": 2,
    "smokingTime": 45,
    "price": 10,
    "rating": 87,
    "flavors": ["Spice", "Sweetness", "Cream", "Cedar", "Earth"],
    "size": "Robusto",
    "length": 5,
    "ringGauge": 50,
    "popularity": 3,
    "description": "The Emilio Suave Sumatra is a limited-edition variant of Emilio's popular Suave line, crafted at Fabrica Oveja Negra in Estel\u00ed, Nicaragua. Master blender James Brown replaced the traditional Suave wrapper with Sumatra tobacco from Indonesia, layered over an Ecuadorian Habano binder and Nicaraguan fillers. The result is a balanced, mild-to-medium smoke with spice, complexity, and the subtle sweetness the Suave line is known for. Limited to 250 boxes of 20 per vitola.",
    "pairings": ["Wheat Beer (Weihenstephaner, Blue Moon)", "Light Roast Coffee", "Manchego Cheese", "Shortbread Cookies"],
    "yearFounded": 2012,
    "limited": True
  },
  {
    "id": "hooten-young-midnight-hammer",
    "name": "Hooten Young Midnight Hammer",
    "brand": "Hooten Young",
    "origin": "Nicaragua",
    "region": "Estel\u00ed",
    "wrapper": "Mexican San Andr\u00e9s Maduro",
    "binder": "Nicaraguan",
    "filler": "Nicaraguan",
    "strength": 5,
    "smokingTime": 90,
    "price": 16,
    "rating": 85,
    "flavors": ["Espresso", "Dark Cocoa", "Cedar", "Spice", "Earth"],
    "size": "Torpedo",
    "length": 6,
    "ringGauge": 60,
    "popularity": 4,
    "description": "The Hooten Young Midnight Hammer is a limited-edition 6\" \u00d7 60 torpedo inspired by the B-2 Spirit stealth bomber and Operation Midnight Hammer. Handcrafted at Tabacalera CM in Nicaragua, it features a dark Mexican San Andr\u00e9s Maduro wrapper over Nicaraguan binder and filler, with a distinctive unfinished shaggy foot. The full-bodied profile delivers notes of espresso, dark cocoa, charred cedar, and measured spice. Only 2,000 cigars were released in the inaugural run.",
    "pairings": ["High-Proof Bourbon (Booker's, Knob Creek Single Barrel)", "Imperial Stout (Ten FIDY, Old Rasputin)", "Dark Chocolate (90%+ cacao)", "Double Espresso"],
    "yearFounded": 2018,
    "limited": True,
    "buyLinks": [
      {"retailer": "Famous Smoke Shop", "url": "https://www.famous-smoke.com/hooten-young-operation-midnight-hammer-torpedo-cigars-maduro", "price": None}
    ]
  },
  {
    "id": "fuente-fuente-opusx-rexilient",
    "name": "Fuente Fuente OpusX ReXilient",
    "brand": "Arturo Fuente",
    "origin": "Dominican Republic",
    "region": "Santiago",
    "wrapper": "Dominican (OpusX)",
    "binder": "Dominican",
    "filler": "Dominican",
    "strength": 5,
    "smokingTime": 75,
    "price": 26.75,
    "rating": 92,
    "flavors": ["Cedar", "Pepper", "Earth", "Leather", "Sweetness"],
    "size": "Churchill",
    "length": 7,
    "ringGauge": 48,
    "popularity": 7,
    "description": "The Fuente Fuente OpusX ReXilient is a limited-edition commemorative release honoring the 25th anniversary of the September 11 terrorist attacks. Each 20-count box contains 16 Churchill-sized cigars (7\" \u00d7 48) and four box-pressed cigars wrapped in an American flag motif, arranged to symbolize the Twin Towers. Based on the legendary OpusX blend with modifications, the cigars are made at Tabacalera A. Fuente y Cia. in the Dominican Republic. Arturo Fuente donates $11 per box to Tunnels to Towers, supporting veterans, Gold Star families, and fallen first responders.",
    "pairings": ["Aged Bourbon (Pappy Van Winkle, Buffalo Trace Antique Collection)", "Vintage Port (Graham's 20 Year, Dow's)", "Black Coffee", "Dark Chocolate"],
    "yearFounded": 1912,
    "limited": True
  }
]

def build_entry(cigar, is_last=False):
    lines = ["  {"]
    for key, value in cigar.items():
        if key == "buyLinks":
            lines.append('    "buyLinks": [')
            for bl in value:
                lines.append('      {')
                lines.append('        "retailer": ' + json.dumps(bl["retailer"]) + ',')
                lines.append('        "url": ' + json.dumps(bl["url"]) + ',')
                lines.append('        "price": ' + json.dumps(bl["price"]))
                lines.append('      },')
            lines[-1] = lines[-1].rstrip(',')
            lines.append('    ],')
        else:
            lines.append('    "' + key + '": ' + json.dumps(value) + ',')
    lines[-1] = lines[-1].rstrip(',')
    lines.append("  }" + ("" if is_last else ","))
    return "\n".join(lines)

entries = "\n".join(build_entry(c, is_last=(i==4)) for i, c in enumerate(new_cigars))

# --- js/data.js ---
with open(BASE + '/js/data.js', 'r') as f:
    data_js = f.read()

# Find the closing pattern: last } followed by ];
m = re.search(r'(\n  )\}\n\];\s*$', data_js)
if not m:
    print("ERROR: Could not find insertion point in data.js")
    sys.exit(1)

data_js_new = data_js[:m.start()] + m.group(1) + "},\n" + entries + "\n];"
with open(BASE + '/js/data.js', 'w') as f:
    f.write(data_js_new)
print("data.js updated")

# --- data/cigars.json ---
with open(BASE + '/data/cigars.json', 'r') as f:
    cigars_json = f.read()

m2 = re.search(r'(\n  )\}\n\]\s*$', cigars_json)
if not m2:
    print("ERROR: Could not find insertion point in cigars.json")
    sys.exit(1)

cigars_json_new = cigars_json[:m2.start()] + m2.group(1) + "},\n" + entries + "\n]"
with open(BASE + '/data/cigars.json', 'w') as f:
    f.write(cigars_json_new)
print("cigars.json updated")

# Verify JSON
with open(BASE + '/data/cigars.json', 'r') as f:
    parsed = json.load(f)
print(f"cigars.json valid JSON: {len(parsed)} cigars")
print("Done!")
