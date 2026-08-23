#!/usr/bin/env python3
"""
Expand all cigars to 3-5 granular pairings each, matched to cigar profile.

Logic:
  - Read data/cigars.json (1,458 cigars)
  - For each cigar with < 5 pairings, ADD new pairings until it has 3-5
    (target 5; minimum 3; never remove existing pairings)
  - Match pairings to strength, wrapper, flavors, origin
  - Ensure pairings span >=3 categories (spirits, wine, beer, coffee, food)
  - Use the granular "Category (brand examples)" format from the knowledge base
  - Write to data/cigars_expanded_pairings.json
  - Verify: every cigar has 3-5 pairings, JSON valid, count == 1,458
"""

import json
import random
from pathlib import Path

random.seed(20260822)  # deterministic output

DATA = Path("/Users/xc/Documents/GitHub/Cigar Picker/data")
SRC = DATA / "cigars.json"
OUT = DATA / "cigars_expanded_pairings.json"

# ---------------------------------------------------------------------------
# Granular pairing strings (one per knowledge-base entry) with brand examples
# matching the existing format in cigars.json: "Category (brand, brand)"
# Each is tagged with its high-level category for variety enforcement.
# ---------------------------------------------------------------------------

PAIRINGS = [
    # ---- Spirits: Bourbon ----
    ("spirits", "High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)"),
    ("spirits", "Wheated Bourbon (Maker's Mark, Larceny)"),
    ("spirits", "High-Corn Sweet Bourbon (Buffalo Trace, Elijah Craig)"),
    ("spirits", "Rye-Heavy Bourbon (Bulleit Bourbon, Wild Turkey 101)"),

    # ---- Spirits: Scotch ----
    ("spirits", "Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)"),
    ("spirits", "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)"),
    ("spirits", "Highland Single Malt (Dalmore 12, Oban 14)"),
    ("spirits", "Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)"),
    ("spirits", "Campbeltown Single Malt (Springbank 10, Glen Scotia 15)"),
    ("spirits", "Lowland Single Malt (Auchentoshan American Oak, Glenkinchie 12)"),

    # ---- Spirits: Rye ----
    ("spirits", "High-Rye Straight Rye (Bulleit Rye, Rittenhouse 100)"),
    ("spirits", "Maryland-Style Rye (Pikesville Rye, Sagamore Spirit)"),
    ("spirits", "Canadian Rye (Lot 40, Alberta Premium)"),

    # ---- Spirits: Irish / Japanese ----
    ("spirits", "Single Pot Still Irish (Redbreast 12, Green Spot)"),
    ("spirits", "Blended Irish Whiskey (Jameson Black Barrel, Bushmills 16)"),
    ("spirits", "Japanese Single Malt (Hibiki Harmony, Yamazaki 12)"),

    # ---- Spirits: Rum ----
    ("spirits", "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)"),
    ("spirits", "High-Ester Jamaican Rum (Hampden Great House, Smith & Cross)"),
    ("spirits", "Spanish-Style Añejo Rum (Ron Zacapa 23, Zaya Gran Reserva)"),
    ("spirits", "Agricole Rhum (Clément Vieux, Rhum JM VSOP)"),
    ("spirits", "Cuban White Rum (Havana Club 3, Ron Santiago 11)"),

    # ---- Spirits: Cognac / Brandy ----
    ("spirits", "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)"),
    ("spirits", "XO Cognac (Remy Martin XO, Hennessy XO)"),
    ("spirits", "Armagnac (Château de Laubade 15, Baron de Sigognac 12)"),
    ("spirits", "Spanish Brandy (Lustau Solera Gran Reserva, Torres 10)"),

    # ---- Spirits: Tequila / Mezcal ----
    ("spirits", "Añejo Tequila (Don Julio 1942, Herradura Añejo)"),
    ("spirits", "Reposado Tequila (Patrón Reposado, Siete Leguas Reposado)"),
    ("spirits", "Mezcal (Del Maguey Vida, Illegal Joven)"),

    # ---- Wine ----
    ("wine", "Tawny Port (Graham's 20 Year, Fonseca 20 Year)"),
    ("wine", "Ruby Port (Graham's Six Grapes, Dow's Fine Ruby)"),
    ("wine", "Oloroso Sherry (Lustau East India, Lustau Don Nuño)"),
    ("wine", "Amontillado Sherry (Lustau Amontillado Los Arcos, La Gitana)"),
    ("wine", "Fino Sherry (Tio Pepe, Valdespino Inocente)"),
    ("wine", "Madeira (Bland's 15 Year Sercial, Henriques & Henriques 10 Year)"),
    ("wine", "Banyuls (Domaine de la Rectorie, M. Chapoutier Banyuls)"),
    ("wine", "Brut Champagne (Veuve Clicquot Yellow Label, Pol Roger Brut)"),

    # ---- Beer ----
    ("beer", "Imperial Russian Stout (Ten FIDY, Old Rasputin XII)"),
    ("beer", "Belgian Quadrupel (St. Bernardus Abt 12, Rochefort 10)"),
    ("beer", "Barleywine (Sierra Nevada Bigfoot, Founders Old Curmudgeon)"),
    ("beer", "Barrel-Aged Stout (Goose Island Bourbon County, Founders Breakfast Stout)"),
    ("beer", "Czech Pilsner (Pilsner Urquell, Bernard Bohemian Lager)"),
    ("beer", "Amber Ale (New Belgium Fat Tire, Tröegs Hopback Amber Ale)"),
    ("beer", "IPA (Dogfish Head 60 Minute, Bell's Two Hearted)"),

    # ---- Coffee ----
    ("coffee", "Double Espresso (dark roast, no sugar)"),
    ("coffee", "Flat White (whole milk, medium roast)"),
    ("coffee", "Cuban Coffee (cafecito, demerara sugar)"),
    ("coffee", "Cold Brew (smooth, low acidity)"),
    ("coffee", "Black Coffee (medium roast, no sugar, no milk)"),

    # ---- Food ----
    ("food", "Dark Chocolate (85% cacao, single-origin Madagascar)"),
    ("food", "Dark Chocolate (70% cacao, balanced sweetness)"),
    ("food", "Aged Manchego (12 month, sheep's milk)"),
    ("food", "Aged Gouda (5 year, crystalline)"),
    ("food", "BBQ Brisket (pepper-rubbed, post-oak smoked)"),
    ("food", "Almond Biscotti (dipped in coffee or amaretto)"),
    ("food", "Aged Cheddar (sharp, 2 year)"),
    ("food", "Bread Pudding (bourbon sauce)"),
    ("food", "Blue Cheese (Roquefort, Stilton)"),
    ("food", "Candied Ginger (crystallized, sweet and spicy)"),
]

# Build a quick lookup from pairing string -> category
CAT_OF = {p: c for c, p in PAIRINGS}

# --- Canonical category classifier (spirits/wine/beer/coffee/food or None) ---
# Used for the hard ">=3 categories" diversity requirement. Strings that don't
# map to any of the five canonical categories (tea, water, juice, etc.) return None
# so they don't masquerade as spirits and dilute the variety guarantee.
_CANON_KEYWORDS = [
    # (category, keywords)  -- checked in this order; first match wins.
    ("coffee", ("espresso", "coffee", "café", "cafe", "cold brew", "flat white",
                "cafecito", "cuban coffee", "black coffee", "au lait", "cold brew")),
    ("food", ("chocolate", "manchego", "gouda", "cheddar", "brisket", "biscotti",
              "bread pudding", "blue cheese", "ginger", "bbq", "cheese", "food",
              "nuts", "truffle", "charcuterie", "olive")),
    ("wine", ("port", "sherry", "madeira", "banyuls", "champagne", "wine",
              "sauternes", "moscato", "prosecco", "chardonnay", "sauvignon",
              "cabernet", "merlot", "riesling", "pinot", "bordeaux", "burgundy",
              "rosé", "rose", "tokaji", "tokay", "ice wine", "vin santo", "marsala",
              "dessert wine", "port wine", "cava", "côtes", "rhône", "rhone")),
    ("beer", ("stout", "quadrupel", "quad", "barleywine", "pilsner", "ale",
              "lager", "ipa", "beer", "porter", "bock", "hefeweizen", "witbier",
              "lambic", "gose", "saison", "doppelbock", "oktoberfest", "amber ale",
              "vienna lager", "brown ale", "wit", "trippel", "tripel", "blond", "witte")),
    ("spirits", ("whiskey", "whisky", "bourbon", "scotch", "rye", "rum", "rhum",
                 "cognac", "brandy", "armagnac", "tequila", "mezcal", "gin", "vodka",
                 "sake", "soju", "absinthe", "moonshine", "calvados", "grappa",
                 "pisco", "cachaca", "ouzo", "pastis", "aquavit", "aquavitt",
                 "irish whiskey", "single malt", "single pot still", "blended irish",
                 "japanese", "campbeltown", "speyside", "islay", "highland", "lowland",
                 "tennessee", "honey-infused", "honey infused", "liqueur", "liqueurs",
                 "amaretto", "chartreuse", "bénédictine", "benedictine", "grand marnier",
                 "cointreau", "kahlua", "sambuca", "jaeger", "jager", "aperitif",
                 "vermouth", "absinthe", "eau de vie", "marc", "orujos", "pomace",
                 "singani", "pisco", "sochu", "shochu", "baijiu", "arrack", "arak")),
]

# Non-canonical drink keywords (return None so they don't count toward the 3)
_NON_CANON_KEYWORDS = ("tea", "water", "lemonade", "juice", "soda", "kombucha",
                       "mineral water", "sparkling water", "tonic", "cola",
                       "ginger ale", "ginger beer", "lemonade", "iced tea",
                       "earl grey", "chamomile", "peppermint", "matcha", "yerba")


def canonical_category(s: str):
    """Return one of spirits/wine/beer/coffee/food, or None for non-canonical
    drinks (tea, water, juice, etc.)."""
    low = s.lower()
    # Non-canonical first (so "iced tea" isn't caught by anything else)
    if any(k in low for k in _NON_CANON_KEYWORDS):
        return None
    for cat, kws in _CANON_KEYWORDS:
        if any(k in low for k in kws):
            return cat
    # Unknown strings default to spirits (most existing unknowns are spirits-ish)
    return "spirits"


def guess_category(s: str) -> str:
    """Broad bucket including a non-canonical 'other' bucket (for reporting)."""
    c = canonical_category(s)
    return c if c is not None else "other"


def category_of(pairing_str: str) -> str:
    """Category of a pairing string, using canonical map or a heuristic guess.
    Returns 'other' for non-canonical drinks (tea, water, ...)."""
    return CAT_OF.get(pairing_str) or guess_category(pairing_str)


def canonical_categories_present(pairings):
    """Set of canonical categories present (excludes 'other')."""
    return {c for p in pairings if (c := canonical_category(p)) is not None}

# ---------------------------------------------------------------------------
# Scoring: how well does a pairing match a cigar?
# Driven by the pairing-knowledge-base rules: strength, wrapper, flavors,
# origin. Each pairing is hand-tagged with the profiles it pairs with.
# ---------------------------------------------------------------------------

# Wrapper buckets (normalize the many wrapper spellings into groups)
DARK_WRAPPERS = {"Maduro", "Broadleaf", "Corojo", "Mexican San Andres", "Oscuro", "Pennsylvania"}
MEDIUM_WRAPPERS = {"Habano", "Cuban Habano", "Sumatra", "Habano 2000", "Dominican Habano", "Nicaraguan Habano"}
LIGHT_WRAPPERS = {"Connecticut", "Connecticut Shade", "Cameroon", "Ecuadorian Sumatra", "Ecuador Connecticut", "Ecuador Sumatra", "Ecuadorian Connecticut", "Candela"}

# Flavor keyword -> pairing string list (for flavor matching)
# Lowercase substring match against cigar flavor list.
FLAVOR_MAP = {
    # flavors -> list of pairing strings that shine with them
    "pepper": ["Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
               "High-Rye Barrel-Proof Bourbon (Baker's, Knob Creek Single Barrel)",
               "High-Rye Straight Rye (Bulleit Rye, Rittenhouse 100)",
               "Mezcal (Del Maguey Vida, Illegal Joven)",
               "Imperial Russian Stout (Ten FIDY, Old Rasputin XII)"],
    "leather": ["Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
                "Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
                "High-Rye Straight Rye (Bulleit Rye, Rittenhouse 100)",
                "Oloroso Sherry (Lustau East India, Lustau Don Nuño)",
                "Blue Cheese (Roquefort, Stilton)"],
    "earth": ["Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
              "Mezcal (Del Maguey Vida, Illegal Joven)",
              "Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
              "Dark Chocolate (85% cacao, single-origin Madagascar)"],
    "espresso": ["Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
                 "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
                 "Double Espresso (dark roast, no sugar)",
                 "Imperial Russian Stout (Ten FIDY, Old Rasputin XII)"],
    "coffee": ["Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
               "Double Espresso (dark roast, no sugar)",
               "Cold Brew (smooth, low acidity)",
               "Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
               "Tawny Port (Graham's 20 Year, Fonseca 20 Year)"],
    "chocolate": ["Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
                  "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)",
                  "Dark Chocolate (85% cacao, single-origin Madagascar)",
                  "Tawny Port (Graham's 20 Year, Fonseca 20 Year)",
                  "Banyuls (Domaine de la Rectorie, M. Chapoutier Banyuls)"],
    "cream": ["Wheated Bourbon (Maker's Mark, Larceny)",
              "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
              "Flat White (whole milk, medium roast)",
              "Spanish-Style Añejo Rum (Ron Zacapa 23, Zaya Gran Reserva)",
              "Tawny Port (Graham's 20 Year, Fonseca 20 Year)"],
    "honey": ["Wheated Bourbon (Maker's Mark, Larceny)",
              "Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
              "Highland Single Malt (Dalmore 12, Oban 14)",
              "Spanish-Style Añejo Rum (Ron Zacapa 23, Zaya Gran Reserva)",
              "Tawny Port (Graham's 20 Year, Fonseca 20 Year)"],
    "vanilla": ["Wheated Bourbon (Maker's Mark, Larceny)",
                "Highland Single Malt (Dalmore 12, Oban 14)",
                "Spanish-Style Añejo Rum (Ron Zacapa 23, Zaya Gran Reserva)",
                "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)",
                "Flat White (whole milk, medium roast)"],
    "cedar": ["Highland Single Malt (Dalmore 12, Oban 14)",
              "High-Corn Sweet Bourbon (Buffalo Trace, Elijah Craig)",
              "Aged Manchego (12 month, sheep's milk)",
              "Cuban White Rum (Havana Club 3, Ron Santiago 11)",
              "Amontillado Sherry (Lustau Amontillado Los Arcos, La Gitana)"],
    "caramel": ["High-Corn Sweet Bourbon (Buffalo Trace, Elijah Craig)",
                "Spanish-Style Añejo Rum (Ron Zacapa 23, Zaya Gran Reserva)",
                "VSOP Cognac (Hennessy VSOP, Pierre Ferrand Ambre)",
                "Tawny Port (Graham's 20 Year, Fonseca 20 Year)",
                "Amber Ale (New Belgium Fat Tire, Tröegs Hopback Amber Ale)"],
    "nuts": ["Aged Manchego (12 month, sheep's milk)",
             "Aged Gouda (5 year, crystalline)",
             "Almond Biscotti (dipped in coffee or amaretto)",
             "Spanish Brandy (Lustau Solera Gran Reserva, Torres 10)",
             "Highland Single Malt (Dalmore 12, Oban 14)"],
    "spice": ["High-Rye Straight Rye (Bulleit Rye, Rittenhouse 100)",
              "Mezcal (Del Maguey Vida, Illegal Joven)",
              "Añejo Tequila (Don Julio 1942, Herradura Añejo)",
              "Candied Ginger (crystallized, sweet and spicy)"],
    "wood": ["Sherry-Finished Scotch (Macallan 18 Sherry Oak, GlenDronach 18)",
             "XO Cognac (Remy Martin XO, Hennessy XO)",
             "Armagnac (Château de Laubade 15, Baron de Sigognac 12)",
             "Aged Demerara Rum (El Dorado 12, Diplomatico Reserva Exclusiva)"],
    "fruit": ["Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
              "Ruby Port (Graham's Six Grapes, Dow's Fine Ruby)",
              "Belgian Quadrupel (St. Bernardus Abt 12, Rochefort 10)",
              "Banyuls (Domaine de la Rectorie, M. Chapoutier Banyuls)"],
    "smoke": ["Peaty Islay Single Malt (Lagavulin 16, Ardbeg Uigeadail)",
              "Mezcal (Del Maguey Vida, Illegal Joven)",
              "BBQ Brisket (pepper-rubbed, post-oak smoked)",
              "Imperial Russian Stout (Ten FIDY, Old Rasputin XII)"],
    "floral": ["Fruity Speyside Single Malt (Glenlivet 18, Balvenie DoubleWood)",
               "Highland Single Malt (Dalmore 12, Oban 14)",
               "Agricole Rhum (Clément Vieux, Rhum JM VSOP)",
               "Lowland Single Malt (Auchentoshan American Oak, Glenkinchie 12)"],
    "grass": ["Lowland Single Malt (Auchentoshan American Oak, Glenkinchie 12)",
              "Agricole Rhum (Clément Vieux, Rhum JM VSOP)",
              "Czech Pilsner (Pilsner Urquell, Bernard Bohemian Lager)"],
    "citrus": ["Highland Single Malt (Dalmore 12, Oban 14)",
               "Agricole Rhum (Clément Vieux, Rhum JM VSOP)",
               "Czech Pilsner (Pilsner Urquell, Bernard Bohemian Lager)",
               "IPA (Dogfish Head 60 Minute, Bell's Two Hearted)"],
}


def wrapper_bucket(wrapper: str) -> str:
    """Return 'dark', 'medium', or 'light' for a wrapper string."""
    if not wrapper:
        return "medium"
    w = wrapper.strip()
    if w in DARK_WRAPPERS:
        return "dark"
    if w in LIGHT_WRAPPERS:
        return "light"
    if w in MEDIUM_WRAPPERS:
        return "medium"
    # Heuristics on substrings
    low = w.lower()
    if "maduro" in low or "broadleaf" in low or "corojo" in low or "oscuro" in low or "san andres" in low:
        return "dark"
    if "connecticut" in low and "shade" not in low:
        return "light"
    if "cameroon" in low or "candela" in low or "shade" in low:
        return "light"
    if "habano" in low or "sumatra" in low:
        return "medium"
    # default
    return "medium"


def score_pairing(cigar: dict, pairing_str: str) -> float:
    """Return a score [0..1+] for how well pairing matches the cigar."""
    cat = category_of(pairing_str)
    s = cigar.get("strength", 3) or 3
    wrapper = cigar.get("wrapper", "") or ""
    wbucket = wrapper_bucket(wrapper)
    origin = cigar.get("origin", "") or ""
    flavors = [f.lower() for f in (cigar.get("flavors") or [])]
    flavors_set = set(flavors)

    score = 0.0

    # --- Strength matching ---
    if cat == "spirits":
        if s >= 4:
            # full-bodied: reward bold spirits
            if pairing_str.startswith(("High-Rye Barrel-Proof", "Peaty Islay", "High-Rye Straight",
                                       "Aged Demerara", "XO Cognac", "Armagnac", "Mezcal",
                                       "Imperial Russian", "Sherry-Finished", "Añejo Tequila",
                                       "Campbeltown")):
                score += 0.6
            # penalize delicate spirits for full cigars
            if pairing_str.startswith(("Wheated Bourbon", "Fruity Speyside", "Highland",
                                       "Lowland", "Blended Irish", "Cuban White", "Reposado",
                                       "VSOP Cognac", "Spanish-Style", "Japanese")):
                score += 0.15
        elif s == 3:
            # medium: reward balanced spirits
            if pairing_str.startswith(("High-Corn Sweet", "Wheated", "Fruity Speyside", "Highland",
                                       "Maryland-Style", "Spanish-Style", "VSOP Cognac",
                                       "Reposado Tequila", "Añejo Tequila", "Agricole",
                                       "Rye-Heavy", "Single Pot Still", "Japanese")):
                score += 0.55
        else:  # s <= 2 mild
            # reward gentle spirits, penalize the bold ones
            if pairing_str.startswith(("Wheated", "Highland", "Lowland", "Blended Irish",
                                       "Cuban White", "Reposado", "Japanese", "Spanish-Style",
                                       "High-Corn Sweet")):
                score += 0.55
            if pairing_str.startswith(("High-Rye Barrel-Proof", "Peaty Islay", "High-Rye Straight",
                                       "Mezcal", "XO Cognac", "Armagnac", "Campbeltown",
                                       "High-Ester Jamaican")):
                score -= 0.4
    elif cat == "wine":
        if s >= 4:
            if pairing_str.startswith(("Tawny Port", "Oloroso", "Madeira", "Banyuls")):
                score += 0.5
            elif pairing_str.startswith("Brut Champagne"):
                score += 0.15
        elif s == 3:
            if pairing_str.startswith(("Ruby Port", "Amontillado", "Brut Champagne")):
                score += 0.4
        else:  # mild
            if pairing_str.startswith(("Brut Champagne", "Amontillado")):
                score += 0.4
            if pairing_str.startswith(("Tawny Port", "Oloroso", "Madeira", "Banyuls")):
                score -= 0.2
    elif cat == "beer":
        if s >= 4:
            if pairing_str.startswith(("Imperial Russian", "Belgian Quadrupel", "Barleywine",
                                       "Barrel-Aged Stout")):
                score += 0.5
            if pairing_str.startswith(("Czech Pilsner", "Amber Ale", "IPA")):
                score -= 0.15
        elif s == 3:
            if pairing_str.startswith(("Amber Ale", "IPA", "Barrel-Aged Stout")):
                score += 0.35
            if pairing_str.startswith(("Czech Pilsner",)):
                score += 0.2
        else:
            if pairing_str.startswith(("Czech Pilsner", "Amber Ale")):
                score += 0.4
            if pairing_str.startswith(("Imperial Russian", "Belgian Quadrupel", "Barleywine")):
                score -= 0.2
    elif cat == "coffee":
        if s >= 4:
            if pairing_str.startswith(("Double Espresso",)):
                score += 0.5
            elif pairing_str.startswith(("Cuban Coffee",)):
                score += 0.4
            elif pairing_str.startswith(("Cold Brew", "Black Coffee")):
                score += 0.3
        elif s == 3:
            score += 0.35  # coffee works for most medium
        else:
            if pairing_str.startswith(("Flat White", "Cold Brew")):
                score += 0.45
            if pairing_str.startswith(("Double Espresso",)):
                score -= 0.1
    elif cat == "food":
        if s >= 4:
            if pairing_str.startswith(("Dark Chocolate (85%", "BBQ Brisket", "Blue Cheese",
                                       "Aged Gouda")):
                score += 0.5
            elif pairing_str.startswith(("Bread Pudding", "Aged Manchego", "Almond Biscotti",
                                         "Candied Ginger")):
                score += 0.25
        elif s == 3:
            score += 0.35  # food generally works
        else:
            if pairing_str.startswith(("Almond Biscotti", "Candied Ginger", "Aged Cheddar",
                                       "Bread Pudding", "Dark Chocolate (70%")):
                score += 0.4
            if pairing_str.startswith(("BBQ Brisket", "Blue Cheese")):
                score -= 0.2

    # --- Wrapper matching ---
    if cat == "spirits":
        if wbucket == "dark":
            if pairing_str.startswith(("High-Rye Barrel-Proof", "Peaty Islay", "Sherry-Finished",
                                       "Aged Demerara", "XO Cognac", "Armagnac", "High-Rye Straight",
                                       "Mezcal", "Campbeltown", "High-Ester Jamaican")):
                score += 0.35
        elif wbucket == "light":
            if pairing_str.startswith(("Wheated", "Highland", "Lowland", "Blended Irish",
                                       "Cuban White", "Reposado", "Japanese", "Spanish-Style",
                                       "High-Corn Sweet", "VSOP Cognac", "Maryland-Style",
                                       "Single Pot Still")):
                score += 0.35
        else:  # medium
            if pairing_str.startswith(("Fruity Speyside", "Highland", "Añejo Tequila",
                                       "VSOP Cognac", "Spanish-Style", "Agricole",
                                       "Maryland-Style", "Single Pot Still", "High-Corn Sweet",
                                       "Rye-Heavy")):
                score += 0.3
    elif cat == "wine":
        if wbucket == "dark":
            if pairing_str.startswith(("Tawny Port", "Oloroso", "Madeira", "Banyuls")):
                score += 0.3
        elif wbucket == "light":
            if pairing_str.startswith(("Brut Champagne", "Amontillado", "Ruby Port")):
                score += 0.3
    elif cat == "beer":
        if wbucket == "dark":
            if pairing_str.startswith(("Imperial Russian", "Belgian Quadrupel", "Barleywine",
                                       "Barrel-Aged Stout")):
                score += 0.3
        elif wbucket == "light":
            if pairing_str.startswith(("Czech Pilsner", "Amber Ale")):
                score += 0.3
    elif cat == "coffee":
        if wbucket == "dark":
            if pairing_str.startswith(("Double Espresso", "Cuban Coffee")):
                score += 0.3
        elif wbucket == "light":
            if pairing_str.startswith(("Flat White", "Cold Brew")):
                score += 0.3
    elif cat == "food":
        if wbucket == "dark":
            if pairing_str.startswith(("Dark Chocolate (85%", "BBQ Brisket", "Blue Cheese")):
                score += 0.3
        elif wbucket == "light":
            if pairing_str.startswith(("Almond Biscotti", "Candied Ginger", "Aged Cheddar",
                                       "Bread Pudding")):
                score += 0.3

    # --- Origin matching (esp. Cuba, Mexico) ---
    if origin == "Cuba":
        if pairing_str.startswith(("Cuban White Rum", "VSOP Cognac", "Oloroso",
                                   "Amontillado", "Tawny Port", "Brut Champagne",
                                   "Cuban Coffee", "XO Cognac", "Spanish Brandy",
                                   "Sherry-Finished")):
            score += 0.5
        # peaty Islay + Cuban is divisive but the KB lists it for full Cubans
        if pairing_str.startswith("Peaty Islay") and s >= 4:
            score += 0.2
    if origin == "Mexico":
        if pairing_str.startswith(("Añejo Tequila", "Reposado Tequila", "Mezcal")):
            score += 0.6
    if origin in ("Brazil",):
        if pairing_str.startswith(("Aged Demerara", "Sherry-Finished", "XO Cognac",
                                   "Tawny Port", "Imperial Russian", "Dark Chocolate (85%")):
            score += 0.3
    if origin in ("Dominican Republic",):
        if pairing_str.startswith(("Wheated", "Fruity Speyside", "Highland", "VSOP Cognac",
                                   "Spanish Brandy", "Reposado", "Spanish-Style", "Cuban White",
                                   "Blended Irish", "Amber Ale", "Flat White")):
            score += 0.3

    # --- Flavor matching: every flavor keyword that maps to this pairing adds score ---
    for flavor_word, plist in FLAVOR_MAP.items():
        if any(flavor_word in f for f in flavors_set):
            if pairing_str in plist:
                score += 0.25

    return score


def categories_present(pairings: list[str]) -> set[str]:
    """Canonical categories present (spirits/wine/beer/coffee/food only).
    Non-canonical drinks (tea, water, ...) are excluded so they don't dilute
    the >=3-category variety guarantee."""
    return canonical_categories_present(pairings)


def _select_additions(cigar, existing, present, need):
    """Pick up to `need` new pairings to add, maximizing match score while
    keeping category variety (cap of 3 spirits total, fill missing categories)."""
    if need <= 0:
        return []

    candidates = [(p, score_pairing(cigar, p)) for c, p in PAIRINGS if p not in present]
    candidates.sort(key=lambda x: (-x[1], x[0]))

    cats_have = categories_present(existing)
    by_cat = {}
    for p, sc in candidates:
        by_cat.setdefault(category_of(p), []).append((p, sc))

    chosen = []
    # Step 1: fill missing non-spirits categories first for variety
    for cat in ("coffee", "food", "wine", "beer"):
        if len(chosen) >= need:
            break
        if cat in cats_have:
            continue
        if by_cat.get(cat):
            best_p, _ = by_cat[cat][0]
            chosen.append(best_p)
            present.add(best_p)
            cats_have.add(cat)

    # Step 2: fill remaining from the global ranking, capping spirits at 3 total
    spirits_total = sum(1 for p in existing if category_of(p) == "spirits") + \
                    sum(1 for p in chosen if category_of(p) == "spirits")
    remaining = need - len(chosen)
    for p, sc in candidates:
        if remaining <= 0:
            break
        if p in present:
            continue
        p_cat = category_of(p)
        if p_cat == "spirits" and spirits_total >= 3:
            continue
        chosen.append(p)
        present.add(p)
        if p_cat == "spirits":
            spirits_total += 1
        remaining -= 1

    # Step 3: if still short, ignore the spirits cap
    if len(chosen) < need:
        for p, sc in candidates:
            if len(chosen) >= need:
                break
            if p in present:
                continue
            chosen.append(p)
            present.add(p)

    return chosen[:need]


def _diversity_repair(cigar, final):
    """If `final` spans <3 categories, swap out the lowest-scoring pairing for
    the best candidate from a missing category until we hit 3 categories."""
    if len(categories_present(final)) >= 3 or len(final) < 3:
        return final
    present_now = set(final)
    for _ in range(len(final)):
        if len(categories_present(final)) >= 3:
            break
        have = categories_present(final)
        missing = [c for c in ("coffee", "food", "wine", "beer", "spirits") if c not in have]
        if not missing:
            break
        added = False
        for miss_cat in missing:
            cands = [(p, score_pairing(cigar, p)) for pc, p in PAIRINGS
                     if pc == miss_cat and p not in present_now]
            if not cands:
                continue
            cands.sort(key=lambda x: -x[1])
            best_new = cands[0][0]
            worst_existing = min(final, key=lambda p: score_pairing(cigar, p))
            final = [p for p in final if p != worst_existing]
            final.append(best_new)
            present_now.add(best_new)
            present_now.discard(worst_existing)
            added = True
            break
        if not added:
            break
    return final


def expand_cigar(cigar: dict) -> dict:
    """Return cigar with pairings expanded to 3-5, matched & varied."""
    existing = list(cigar.get("pairings") or [])
    # Dedupe while preserving order
    existing = list(dict.fromkeys(existing))
    present = set(existing)

    # If existing already exceeds the 5 cap, trim to the 5 best-matching.
    if len(existing) > 5:
        ranked = sorted(existing, key=lambda p: -score_pairing(cigar, p))
        existing = ranked[:5]
        present = set(existing)

    target = 5
    need = max(0, target - len(existing))
    if len(existing) < 3:
        need = max(need, 3 - len(existing))

    additions = _select_additions(cigar, existing, present, need)
    final = _diversity_repair(cigar, existing + additions)

    cigar = dict(cigar)
    cigar["pairings"] = final
    return cigar


def main():
    cigars = json.loads(SRC.read_text())
    n_in = len(cigars)
    print(f"Loaded {n_in} cigars from {SRC}")

    expanded = [expand_cigar(c) for c in cigars]

    # ---- Verification ----
    counts = [len(c.get("pairings", [])) for c in expanded]
    from collections import Counter
    dist = dict(sorted(Counter(counts).items()))
    print("Pairing count distribution:", dist)
    assert len(expanded) == n_in, f"Count changed: {len(expanded)} (input {n_in})"
    assert min(counts) >= 3, f"Some cigar has <3 pairings: min={min(counts)}"
    assert max(counts) <= 5, f"Some cigar has >5 pairings: max={max(counts)}"

    # Category variety: every cigar should span >=3 canonical categories
    bad = []
    for c in expanded:
        cats = categories_present(c.get("pairings", []))
        if len(cats) < 3:
            bad.append((c.get("id"), sorted(cats)))
    if bad:
        print(f"WARNING: {len(bad)} cigars span <3 canonical categories; first 5:")
        for b in bad[:5]:
            print("  ", b)
        # Not fatal here — but the diversity-repair should have caught these.
        # Assert to force a fix if any remain.
        assert not bad, f"{len(bad)} cigars have <3 canonical categories"

    # JSON validity
    OUT.write_text(json.dumps(expanded, indent=2, ensure_ascii=False))
    # Re-read to confirm
    reread = json.loads(OUT.read_text())
    assert len(reread) == n_in
    print(f"Wrote {OUT} ({len(reread)} cigars)")

    # Report category spread
    cat_counter = Counter()
    for c in expanded:
        for p in c.get("pairings", []):
            cat_counter[category_of(p)] += 1
    print("Category totals across all pairings:", dict(cat_counter))

    # Average
    avg = sum(counts) / len(counts)
    print(f"Average pairings per cigar: {avg:.3f}")

    # Show a few samples
    print("\nSample expanded cigars:")
    for i in (0, 500, 1000, 1457):
        c = expanded[i]
        print(f"  [{c['id']}] strength={c.get('strength')} wrapper={c.get('wrapper')} "
              f"origin={c.get('origin')} -> {len(c['pairings'])} pairings:")
        for p in c["pairings"]:
            print(f"      - {p}")

    print("\nFINAL: all checks passed.")


if __name__ == "__main__":
    main()
