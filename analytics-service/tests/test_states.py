from app.services import states


def test_there_are_36_states_and_union_territories():
    assert len(states.STATES) == 36
    for name in ("Karnataka", "Tamil Nadu", "Odisha", "Uttarakhand", "Delhi", "Ladakh", "Puducherry", "Kerala"):
        assert name in states.STATES


def test_different_spellings_resolve_to_one_state():
    assert states.canonical_state("Tamilnadu") == "Tamil Nadu"
    assert states.canonical_state("tamil  nadu") == "Tamil Nadu"
    assert states.canonical_state("Orissa") == "Odisha"
    assert states.canonical_state("Uttrakhand") == "Uttarakhand"
    assert states.canonical_state("Keralam") == "Kerala"
    assert states.canonical_state("Jammu & Kashmir") == "Jammu and Kashmir"
    assert states.canonical_state("NCT of Delhi") == "Delhi"
    assert states.canonical_state("Pondicherry") == "Puducherry"


def test_unknown_names_are_kept_as_typed_not_invented():
    assert states.canonical_state("  Atlantis ") == "Atlantis"
    assert states.canonical_state(None) is None
    assert states.canonical_state("") == ""


def test_same_state_compares_meaning_not_spelling():
    assert states.same_state("Tamil Nadu", "Tamilnadu")
    assert states.same_state("Odisha", "Orissa")
    assert not states.same_state("Kerala", "Karnataka")
    assert not states.same_state(None, "Kerala") and not states.same_state("Kerala", "")


def test_variants_start_with_the_canonical_name_then_the_other_spellings():
    assert states.state_variants("Orissa") == ["Odisha", "Orissa"]
    assert states.state_variants("Karnataka") == ["Karnataka"]
    assert states.state_variants("Atlantis") == ["Atlantis"]
