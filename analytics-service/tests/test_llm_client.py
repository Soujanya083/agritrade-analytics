"""LLM client: configuration handling and provider request shapes (HTTP mocked)."""
import pytest

from app.services import llm_client


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload, self.status_code = payload, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise llm_client.requests.HTTPError(f"{self.status_code}")

    def json(self):
        return self._payload


def test_not_configured_by_default():
    assert llm_client.is_configured() is False
    with pytest.raises(llm_client.LLMNotConfigured):
        llm_client.generate("system", "hi")


def test_anthropic_requires_a_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    assert llm_client.is_configured() is False
    monkeypatch.setenv("LLM_API_KEY", "k")
    assert llm_client.is_configured() is True


def test_openai_compatible_requires_a_model(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "k")
    assert llm_client.is_configured() is False
    monkeypatch.setenv("LLM_MODEL", "some-model")
    assert llm_client.is_configured() is True


def test_local_openai_compatible_server_needs_no_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_MODEL", "llama3")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1")
    assert llm_client.is_configured() is True


def test_anthropic_request_shape_and_parsing(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "secret-key")
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.update(url=url, headers=headers, body=json, timeout=timeout)
        return FakeResponse({"content": [{"type": "text", "text": "Use drip irrigation."}]})

    monkeypatch.setattr(llm_client.requests, "post", fake_post)
    out = llm_client.generate("SYSTEM", "How to irrigate?", max_tokens=123)

    assert out == "Use drip irrigation."
    assert seen["url"] == llm_client.ANTHROPIC_URL
    assert seen["headers"]["x-api-key"] == "secret-key"
    assert seen["body"]["system"] == "SYSTEM"
    assert seen["body"]["messages"] == [{"role": "user", "content": "How to irrigate?"}]
    assert seen["body"]["max_tokens"] == 123
    assert seen["timeout"] > 0


def test_openai_compatible_request_shape_and_parsing(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_MODEL", "m1")
    monkeypatch.setenv("LLM_BASE_URL", "https://llm.example.com/v1/")
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen.update(url=url, headers=headers, body=json)
        return FakeResponse({"choices": [{"message": {"content": " Rotate crops. "}}]})

    monkeypatch.setattr(llm_client.requests, "post", fake_post)
    assert llm_client.generate("SYS", "Q") == "Rotate crops."
    assert seen["url"] == "https://llm.example.com/v1/chat/completions"
    assert seen["headers"]["authorization"] == "Bearer k"
    assert seen["body"]["messages"][0] == {"role": "system", "content": "SYS"}


def test_http_failure_becomes_llm_error_without_leaking_details(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "secret-key")
    monkeypatch.setattr(llm_client.requests, "post", lambda *a, **k: FakeResponse({}, status=500))
    with pytest.raises(llm_client.LLMError) as exc:
        llm_client.generate("s", "u")
    assert "secret-key" not in str(exc.value)


def test_malformed_response_becomes_llm_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setattr(llm_client.requests, "post", lambda *a, **k: FakeResponse({"unexpected": 1}))
    with pytest.raises(llm_client.LLMError):
        llm_client.generate("s", "u")


def test_describe_never_exposes_the_key(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("LLM_API_KEY", "super-secret")
    info = llm_client.describe()
    assert "super-secret" not in str(info)
    assert info["configured"] is True
