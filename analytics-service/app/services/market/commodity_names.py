"""
The government feed names commodities its own way ("Bhindi(Ladies Finger)" for okra, "Soyabean" for soybean).
fetch_mandi_prices() tries the plain crop name first and then these names, stopping at the first that has records.

BEST EFFORT: written from knowledge of the feed, not checked against it today. A wrong or missing name costs one
extra empty request and the crop simply shows "no records". Add a name here when a crop that sells in mandis
shows no live prices (find the real spelling with scripts/diagnose_mandi_api.py or on data.gov.in).
"""

ALIASES = {
    "rice": ["Paddy(Dhan)(Common)"], "pearl millet": ["Bajra(Pearl Millet/Cumbu)"], "sorghum": ["Jowar(Sorghum)"],
    "finger millet": ["Ragi (Finger Millet)"], "barley": ["Barley (Jau)"],
    "chickpea": ["Bengal Gram(Gram)(Whole)"], "pigeon pea": ["Arhar (Tur/Red Gram)(Whole)"],
    "green gram": ["Green Gram (Moong)(Whole)"], "black gram": ["Black Gram (Urd Beans)(Whole)"],
    "lentil": ["Lentil (Masur)(Whole)"], "cowpea": ["Cowpea(Lobia/Karamani)"], "soybean": ["Soyabean"],
    "sesame": ["Sesamum(Sesame,Gingelly,Til)"], "chilli": ["Green Chilli", "Dry Chillies"],
    "okra": ["Bhindi(Ladies Finger)"], "cucumber": ["Cucumbar(Kheera)"], "bottle gourd": ["Bottle gourd"],
    "bitter gourd": ["Bitter gourd"], "ridge gourd": ["Ridgeguard(Tori)"], "cluster beans": ["Cluster beans"],
    "beans": ["French Beans (Frasbean)"], "peas": ["Peas Wet", "Green Peas"], "ginger": ["Ginger(Green)", "Ginger(Dry)"],
    "radish": ["Raddish"], "coriander": ["Coriander(Leaves)"], "fenugreek": ["Methi(Leaves)"], "mint": ["Mint(Pudina)"],
    "spring onion": ["Onion Green"], "watermelon": ["Water Melon"], "muskmelon": ["Musk Melon"],
    "jackfruit": ["Jack Fruit"], "sweet lime": ["Mousambi(Sweet Lime)"], "custard apple": ["Custard Apple (Sharifa)"],
    "yam": ["Elephant Foot Yam (Suran)"], "amla": ["Amla(Nelli Kai)"], "ber": ["Ber(Zizyphus/Borehannu)"],
    "fig": ["Fig(Anjura/Anjeer)"],
}


def variants(commodity: str) -> list:
    """The name as given first, then the feed's own names for it."""
    name = " ".join(str(commodity or "").split())
    extra = ALIASES.get(name.lower(), [])
    return [name, *[a for a in extra if a.lower() != name.lower()]]
