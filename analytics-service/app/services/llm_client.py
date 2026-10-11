"""
Minimal, provider-agnostic LLM client for the chatbot's *general
agriculture* answers.

Nothing is hardcoded: provider, key, model and endpoint all come from the
environment, read at call time. If no key is configured the chatbot says
so honestly and keeps working for every project-data question - it never
pretends to have an LLM.

  LLM_PROVIDER   "anthropic" | "openai"   (openai = any OpenAI-compatible
                 chat-completions API: OpenAI, Groq, Gemini's OpenAI
                 endpoint, a local Ollama server, ...)
  LLM_API_KEY    secret key (never commit it)
  LLM_MODEL      model name (anthropic has a default; openai-compatible
                 providers must set it)
  LLM_BASE_URL   optional override, e.g. http://localhost:11434/v1 for Ollama
  LLM_TIMEOUT_SECONDS   default 20
"""
import os

import requests

DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
OPENAI_DEFAULT_BASE = "https://api.openai.com/v1"


class LLMNotConfigured(Exception):
    pass


class LLMError(Exception):
    pass


def _settings() -> dict:
    provider = os.getenv("LLM_PROVIDER", "").strip().lower()
    key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "").strip()
    base_url = os.getenv("LLM_BASE_URL", "").strip().rstrip("/")
    try:
        timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "20"))
    except ValueError:
        timeout = 20.0
    return {"provider": provider, "key": key, "model": model, "base_url": base_url, "timeout": timeout}


def is_configured() -> bool:
    s = _settings()
    if s["provider"] not in {"anthropic", "openai"}:
        return False
    # A local OpenAI-compatible server (Ollama) may legitimately have no key.
    if s["provider"] == "anthropic":
        return bool(s["key"])
    return bool(s["model"]) and (bool(s["key"]) or bool(s["base_url"]))


def describe() -> dict:
    """Non-secret status for diagnostics / the UI."""
    s = _settings()
    return {"configured": is_configured(), "provider": s["provider"] or None,
            "model": (s["model"] or (DEFAULT_ANTHROPIC_MODEL if s["provider"] == "anthropic" else None))}


def generate(system_prompt: str, user_message: str, max_tokens: int = 400) -> str:
    if not is_configured():
        raise LLMNotConfigured("LLM is not configured (set LLM_PROVIDER, LLM_API_KEY, LLM_MODEL).")
    s = _settings()
    try:
        if s["provider"] == "anthropic":
            return _anthropic(s, system_prompt, user_message, max_tokens)
        return _openai_compatible(s, system_prompt, user_message, max_tokens)
    except requests.RequestException as exc:
        raise LLMError("LLM request failed") from exc
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise LLMError("LLM returned an unexpected response") from exc


def _anthropic(s, system_prompt, user_message, max_tokens) -> str:
    response = requests.post(
        ANTHROPIC_URL,
        headers={"x-api-key": s["key"], "anthropic-version": "2023-06-01", "content-type": "application/json"},
        json={
            "model": s["model"] or DEFAULT_ANTHROPIC_MODEL,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        },
        timeout=s["timeout"],
    )
    response.raise_for_status()
    blocks = response.json()["content"]
    text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()
    if not text:
        raise ValueError("empty completion")
    return text


def _openai_compatible(s, system_prompt, user_message, max_tokens) -> str:
    headers = {"content-type": "application/json"}
    if s["key"]:
        headers["authorization"] = f"Bearer {s['key']}"
    response = requests.post(
        f"{s['base_url'] or OPENAI_DEFAULT_BASE}/chat/completions",
        headers=headers,
        json={
            "model": s["model"],
            "max_tokens": max_tokens,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        },
        timeout=s["timeout"],
    )
    response.raise_for_status()
    text = (response.json()["choices"][0]["message"]["content"] or "").strip()
    if not text:
        raise ValueError("empty completion")
    return text
