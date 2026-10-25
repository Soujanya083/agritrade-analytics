from app.services.market import market_kinds as mk


def test_farmers_direct_sale_markets_are_recognised_by_name():
    assert mk.is_retail_style_market("Papanasam(Uzhavar Sandhai )")
    assert mk.is_retail_style_market("Madhuranthagam (UZHAVAR  SANDHAI)")
    assert mk.is_retail_style_market("Kukatpally Rythu Bazar")
    assert mk.is_retail_style_market("Ludhiana Apni Mandi")
    assert not mk.is_retail_style_market("Lasalgaon(Niphad)")
    assert not mk.is_retail_style_market(None)


def test_variety_keys_ignore_case_and_spacing():
    assert mk.variety_key("Onion  Green") == "onion green"
    assert mk.variety_key("") == "other" and mk.variety_key(None) == "other"


def test_dominant_variety_needs_a_clear_majority():
    assert mk.dominant_variety(["Big", "big", "Big", "Green"]) == "big"
    assert mk.dominant_variety(["Big", "Small", "Green", "Local"]) is None
    assert mk.dominant_variety([]) is None
