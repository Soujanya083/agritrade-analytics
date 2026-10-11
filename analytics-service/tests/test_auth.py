"""Authentication: the analytics service verifies the Node backend's JWT."""
import time

import jwt
import pytest

from app import config
from app.auth import AuthError, authenticate_headers, decode_token

SECRET = "unit-test-secret"


def make_token(secret=SECRET, role="Farmer", sub="user123", expires_in=3600, algorithm="HS256", include_exp=True):
    payload = {"id": sub, "role": role}
    if include_exp:
        payload["exp"] = int(time.time()) + expires_in
    return jwt.encode(payload, secret, algorithm=algorithm)


def test_valid_token_yields_principal():
    principal = decode_token(make_token(), SECRET)
    assert principal.subject == "user123"
    assert principal.role == "Farmer"
    assert principal.kind == "user"


def test_expired_token_is_401():
    with pytest.raises(AuthError) as exc:
        decode_token(make_token(expires_in=-10), SECRET)
    assert exc.value.status_code == 401


def test_wrong_secret_is_401():
    with pytest.raises(AuthError) as exc:
        decode_token(make_token(secret="some-other-secret"), SECRET)
    assert exc.value.status_code == 401


def test_garbage_token_is_401():
    with pytest.raises(AuthError) as exc:
        decode_token("not.a.jwt", SECRET)
    assert exc.value.status_code == 401


def test_token_without_expiry_is_rejected():
    with pytest.raises(AuthError) as exc:
        decode_token(make_token(include_exp=False), SECRET)
    assert exc.value.status_code == 401


def test_unsigned_alg_none_token_is_rejected():
    forged = jwt.encode({"id": "x", "role": "Farmer", "exp": int(time.time()) + 3600}, key=None, algorithm="none")
    with pytest.raises(AuthError) as exc:
        decode_token(forged, SECRET)
    assert exc.value.status_code == 401


def test_unknown_role_is_403():
    with pytest.raises(AuthError) as exc:
        decode_token(make_token(role="Admin"), SECRET)
    assert exc.value.status_code == 403


def test_token_without_subject_is_401():
    token = jwt.encode({"role": "Farmer", "exp": int(time.time()) + 60}, SECRET, algorithm="HS256")
    with pytest.raises(AuthError) as exc:
        decode_token(token, SECRET)
    assert exc.value.status_code == 401


def test_missing_authorization_header_is_401(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    with pytest.raises(AuthError) as exc:
        authenticate_headers(None, None)
    assert exc.value.status_code == 401


def test_bearer_header_authenticates(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    principal = authenticate_headers(f"Bearer {make_token()}", None)
    assert principal.subject == "user123"


def test_non_bearer_scheme_is_401(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", SECRET)
    with pytest.raises(AuthError) as exc:
        authenticate_headers(f"Basic {make_token()}", None)
    assert exc.value.status_code == 401


def test_internal_api_key_authenticates_as_service(monkeypatch):
    monkeypatch.setenv("ANALYTICS_INTERNAL_API_KEY", "shared-key")
    principal = authenticate_headers(None, "shared-key")
    assert principal.kind == "service"


def test_wrong_internal_api_key_is_401(monkeypatch):
    monkeypatch.setenv("ANALYTICS_INTERNAL_API_KEY", "shared-key")
    with pytest.raises(AuthError) as exc:
        authenticate_headers(None, "wrong")
    assert exc.value.status_code == 401


def test_internal_key_header_ignored_when_no_key_configured_is_401():
    # No ANALYTICS_INTERNAL_API_KEY configured: a supplied key must NOT work.
    with pytest.raises(AuthError) as exc:
        authenticate_headers(None, "anything")
    assert exc.value.status_code == 401


def test_production_without_jwt_secret_fails_closed_503(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    assert config.jwt_secret() is None
    with pytest.raises(AuthError) as exc:
        authenticate_headers(f"Bearer {make_token()}", None)
    assert exc.value.status_code == 503


def test_dev_fallback_secret_matches_node_default(monkeypatch):
    # Same constant the Node server uses so a fresh local checkout works.
    assert config.jwt_secret() == "dev-only-secret-do-not-use-in-production"


def test_render_environment_counts_as_production(monkeypatch):
    monkeypatch.setenv("RENDER", "true")
    assert config.is_production() is True
    assert config.jwt_secret() is None


def test_cors_origins_parsing(monkeypatch):
    assert config.cors_origins() == ["*"]
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example.com/, https://b.example.com")
    assert config.cors_origins() == ["https://a.example.com", "https://b.example.com"]
