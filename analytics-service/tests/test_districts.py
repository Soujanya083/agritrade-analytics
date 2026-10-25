from app.services import districts


def test_karnataka_has_31_districts():
    assert len(districts.KARNATAKA_DISTRICTS) == 31
    for name in ("Mysuru", "Belagavi", "Kalaburagi", "Shivamogga", "Tumakuru", "Vijayanagara", "Dakshina Kannada"):
        assert name in districts.KARNATAKA_DISTRICTS


def test_old_and_new_names_are_the_same_district():
    assert districts.same_district("Mysore", "Mysuru")
    assert districts.same_district("Belgaum", "Belagavi")
    assert districts.same_district("Gulbarga", "Kalaburagi")
    assert districts.same_district("Shimoga", "Shivamogga")
    assert districts.same_district("Bangalore", "Bengaluru Urban")
    assert districts.same_district("Chikkamagalore", "Chikkamagaluru")
    assert not districts.same_district("Mysuru", "Mandya")
    assert not districts.same_district(None, "Mysuru")


def test_unknown_names_are_kept_not_invented():
    assert districts.canonical_district(" Nashik ") == "Nashik"
