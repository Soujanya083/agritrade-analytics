"""
Karnataka's 31 districts and the older spellings the government mandi feed still uses
("Bangalore", "Mysore", "Belgaum", "Gulbarga" ...). Compare with same_district(), never with ==.
"""
import re

_DISTRICTS = {
    "Bagalkote": ["Bagalkot"], "Ballari": ["Bellary"], "Belagavi": ["Belgaum", "Belagavi"],
    "Bengaluru Rural": ["Bangalore Rural", "Bengaluru (Rural)"], "Bengaluru Urban": ["Bangalore", "Bengaluru", "Bangalore Urban"],
    "Bidar": [], "Chamarajanagar": ["Chamrajnagar", "Chamarajanagara"], "Chikkaballapura": ["Chikkaballapur", "Chickballapur", "Chickkaballapura"],
    "Chikkamagaluru": ["Chikmagalur", "Chikkamagalur", "Chikmagaluru", "Chikamagalur", "Chikkamagaluru", "Chikkamagalore", "Chikkamagaluru"],
    "Chitradurga": [], "Dakshina Kannada": ["Mangalore", "Dakshina Kannad", "South Kanara"], "Davanagere": ["Davangere", "Davanagare"],
    "Dharwad": ["Dharwar"], "Gadag": [], "Hassan": [], "Haveri": [], "Kalaburagi": ["Gulbarga", "Kalburgi"],
    "Kodagu": ["Coorg", "Madikeri"], "Kolar": [], "Koppal": ["Koppala"], "Mandya": [], "Mysuru": ["Mysore"],
    "Raichur": ["Raichuru"], "Ramanagara": ["Ramanagar", "Ramnagar"], "Shivamogga": ["Shimoga"], "Tumakuru": ["Tumkur"],
    "Udupi": [], "Uttara Kannada": ["Karwar", "North Kanara", "Uttar Kannada"], "Vijayanagara": ["Hosapete", "Hospet"],
    "Vijayapura": ["Bijapur"], "Yadgir": ["Yadagiri"],
}

KARNATAKA_DISTRICTS = sorted(_DISTRICTS)   # 31


def _key(text) -> str:
    return re.sub(r"[^a-z0-9]", "", str(text).lower())


_LOOKUP = {}
for _canonical, _aliases in _DISTRICTS.items():
    for _name in [_canonical, *_aliases]:
        _LOOKUP[_key(_name)] = _canonical


def canonical_district(name):
    if not name or not str(name).strip():
        return name
    return _LOOKUP.get(_key(name), str(name).strip())


def same_district(a, b) -> bool:
    return bool(a) and bool(b) and canonical_district(a) == canonical_district(b)
