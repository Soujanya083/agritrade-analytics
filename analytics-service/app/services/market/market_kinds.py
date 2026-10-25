"""
Which "markets" in the mandi feed are not realistic wholesale destinations, and which variety is the main product.

Farmers' direct-sale markets (Tamil Nadu "Uzhavar Sandhai", Andhra/Telangana "Rythu Bazar", Punjab/Haryana
"Apni Mandi") sell small quantities to households at near-retail prices. They sit in the same feed as wholesale
mandis, but recommending one for 500 kg would be unrealistic. This is a NAME HEURISTIC: it is shown to users as
"farmers' direct-sale market", flagged rather than hidden, and kept out of best-market and summary figures.
"""
from collections import Counter

RETAIL_STYLE_NAME_PARTS = ("uzhavar sandhai", "rythu bazar", "rythu bazaar", "apni mandi")


def is_retail_style_market(name) -> bool:
    text = " ".join(str(name or "").lower().split())
    return any(part in text for part in RETAIL_STYLE_NAME_PARTS)


def variety_key(variety) -> str:
    text = " ".join(str(variety or "").lower().split())
    return text or "other"


def dominant_variety(varieties, min_share: float = 0.5):
    """The most common variety (normalised) if it covers at least min_share of the rows, else None."""
    keys = [variety_key(v) for v in varieties]
    if not keys:
        return None
    key, count = Counter(keys).most_common(1)[0]
    return key if count / len(keys) >= min_share else None
