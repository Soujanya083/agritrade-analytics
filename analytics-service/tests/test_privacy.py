"""Marketplace-wide analytics must not expose other users' identities."""
from app import privacy
from app.privacy import pseudonym, pseudonymize


def test_pseudonym_is_stable_and_hides_the_id():
    a = pseudonym("64f1c0ffee0000000000abcd")
    assert a == pseudonym("64f1c0ffee0000000000abcd")
    assert "64f1c0ffee" not in a
    assert a.startswith("User-")


def test_different_users_get_different_pseudonyms():
    assert pseudonym("user-a") != pseudonym("user-b")


def test_pseudonym_depends_on_secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "secret-one")
    one = pseudonym("user-a")
    monkeypatch.setenv("JWT_SECRET", "secret-two")
    assert pseudonym("user-a") != one


def test_records_are_rewritten_and_viewer_is_marked():
    rows = [
        {"farmerId": "me", "totalPayout": 100},
        {"farmerId": "someone-else", "totalPayout": 50},
    ]
    out = pseudonymize(rows, viewer_id="me")
    assert out[0]["isYou"] is True
    assert out[1]["isYou"] is False
    assert all(r["farmerId"].startswith("User-") for r in out)
    assert out[0]["totalPayout"] == 100


def test_nested_structures_are_handled():
    payload = {"buyers": [{"buyerId": "b1", "segment": "High Value"}], "summary": {"count": 1}}
    out = pseudonymize(payload, viewer_id=None)
    assert out["buyers"][0]["buyerId"].startswith("User-")
    assert out["buyers"][0]["isYou"] is False
    assert out["summary"] == {"count": 1}


def test_non_user_fields_are_untouched():
    row = {"bidId": "bid1", "cropId": "crop1", "userId": "u1"}
    out = pseudonymize(row, "u1")
    assert out["bidId"] == "bid1" and out["cropId"] == "crop1"
    assert out["userId"] != "u1" and out["isYou"] is True
