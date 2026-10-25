"""
Indian states and union territories, and the many spellings the data uses for them.

The government feed and the imported files do not agree ("Tamil Nadu" / "Tamilnadu", "Odisha" / "Orissa",
"Uttarakhand" / "Uttrakhand"), so two places that mean the same state must compare equal. Never compare raw
state strings; use same_state(). To ask the live API for a state, try state_variants() in order.
"""
import re

# name -> other spellings seen in AGMARKNET / government data
_STATES = {
    "Andaman and Nicobar Islands": ["Andaman and Nicobar", "Andaman & Nicobar Islands", "A&N Islands"],
    "Andhra Pradesh": [],
    "Arunachal Pradesh": [],
    "Assam": [],
    "Bihar": [],
    "Chandigarh": [],
    "Chhattisgarh": ["Chattisgarh", "Chattishgarh"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman and Diu", "Dadra & Nagar Haveli", "Daman & Diu"],
    "Delhi": ["NCT of Delhi", "New Delhi"],
    "Goa": [],
    "Gujarat": [],
    "Haryana": [],
    "Himachal Pradesh": [],
    "Jammu and Kashmir": ["Jammu & Kashmir", "J&K"],
    "Jharkhand": [],
    "Karnataka": [],
    "Kerala": ["Keralam"],
    "Ladakh": ["Leh Ladakh"],
    "Lakshadweep": [],
    "Madhya Pradesh": [],
    "Maharashtra": [],
    "Manipur": [],
    "Meghalaya": [],
    "Mizoram": [],
    "Nagaland": [],
    "Odisha": ["Orissa"],
    "Puducherry": ["Pondicherry"],
    "Punjab": [],
    "Rajasthan": [],
    "Sikkim": [],
    "Tamil Nadu": ["Tamilnadu"],
    "Telangana": ["Telengana"],
    "Tripura": [],
    "Uttar Pradesh": [],
    "Uttarakhand": ["Uttrakhand", "Uttaranchal"],
    "West Bengal": ["Westbengal"],
}

STATES = sorted(_STATES)   # 36 states and union territories, canonical spelling


def _key(text) -> str:
    return re.sub(r"[^a-z0-9]", "", str(text).lower().replace("&", "and"))


_LOOKUP = {}
for _canonical, _aliases in _STATES.items():
    for _name in [_canonical, *_aliases]:
        _LOOKUP[_key(_name)] = _canonical


def canonical_state(name):
    """Canonical spelling of a state/UT, or the input unchanged (stripped) if it is not recognised."""
    if not name or not str(name).strip():
        return name
    return _LOOKUP.get(_key(name), str(name).strip())


def state_variants(name) -> list:
    """The canonical spelling first, then the other spellings, for retrying the live API."""
    canonical = canonical_state(name)
    return [canonical, *_STATES.get(canonical, [])] if canonical in _STATES else [canonical]


def same_state(a, b) -> bool:
    return bool(a) and bool(b) and canonical_state(a) == canonical_state(b)
