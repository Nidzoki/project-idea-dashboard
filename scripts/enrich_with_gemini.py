"""Optional, developer-run Gemini enrichment for generated idea records.

The normal collection pipeline remains deterministic and never imports this
module. Gemini is contacted only with the explicit command-line mode; the
fixture mode in ``enrich_with_youchat.py`` remains the offline fallback.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Callable

try:
    from .enrich_with_youchat import (
        DEFAULT_INPUT,
        EnrichmentError,
        EnrichmentResult,
        OptionalDependencyError,
        atomic_write_json,
        build_prompt,
        enrich_records,
        merge_enrichment,
        parse_youchat_json,
        validate_source_record,
        _load_records,
    )
except ImportError:  # pragma: no cover - exercised when run as a script
    from enrich_with_youchat import (  # type: ignore[no-redef]
        DEFAULT_INPUT,
        EnrichmentError,
        EnrichmentResult,
        OptionalDependencyError,
        atomic_write_json,
        build_prompt,
        enrich_records,
        merge_enrichment,
        parse_youchat_json,
        validate_source_record,
        _load_records,
    )


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env.local"
DEFAULT_MODEL = "gemini-3.5-flash-lite"
DEFAULT_TIMEOUT_SECONDS = 60
DEFAULT_BATCH_SIZE = 5


class GeminiConfigurationError(OptionalDependencyError):
    """Raised when Gemini cannot be configured without exposing credentials."""


def load_env_file(path: Path = DEFAULT_ENV_FILE) -> dict[str, str]:
    """Read simple dotenv assignments without printing or exporting secrets."""

    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        line = re.sub(r"^export\s+", "", line)
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value
    return values


def load_gemini_config(env_file: Path = DEFAULT_ENV_FILE) -> tuple[str, str]:
    """Resolve API configuration with process environment taking precedence."""

    dotenv = load_env_file(env_file)
    api_key = os.environ.get("GEMINI_API_KEY") or dotenv.get("GEMINI_API_KEY", "")
    model = os.environ.get("GEMINI_MODEL") or dotenv.get("GEMINI_MODEL", DEFAULT_MODEL)
    if not api_key.strip():
        raise GeminiConfigurationError(
            "GEMINI_API_KEY is not configured. Set it in the environment or in .env.local."
        )
    return api_key.strip(), model.strip() or DEFAULT_MODEL


def parse_gemini_json(raw: str) -> dict[str, Any]:
    """Validate Gemini's JSON against the shared strict keep/discard schema."""

    return parse_youchat_json(raw)


def parse_gemini_batch_json(raw: str, expected_ids: set[str]) -> dict[str, dict[str, Any]]:
    """Parse one JSON array containing one validated decision per source record."""

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    value = json.loads(cleaned)
    if not isinstance(value, list):
        raise EnrichmentError("Gemini batch response must be a JSON array")
    results: dict[str, dict[str, Any]] = {}
    for item in value:
        if not isinstance(item, dict):
            raise EnrichmentError("Gemini batch response contains a non-object")
        identifier = item.get("id")
        if not isinstance(identifier, str) or identifier not in expected_ids:
            raise EnrichmentError("Gemini batch response contains an unknown or missing id")
        if identifier in results:
            raise EnrichmentError(f"Gemini batch response duplicates id {identifier}")
        decision = item.get("decision")
        if decision == "keep" and item.get("discardReason") is None:
            item = {**item, "discardReason": ""}
        results[identifier] = parse_gemini_json(
            json.dumps({key: value for key, value in item.items() if key != "id"})
        )
    if set(results) != expected_ids:
        raise EnrichmentError("Gemini batch response does not contain every requested id")
    return results


def build_batch_prompt(records: list[dict[str, Any]]) -> str:
    """Ask Gemini for independent decisions while reducing request count."""

    payload = [copy.deepcopy(record) for record in records]
    return (
        "Process each source record independently. Return exactly one JSON array with one object per "
        "record, preserving each record id in an id field. Do not merge records or omit any record. "
        "Each object must contain id plus exactly these decision fields: decision, discardReason, title, "
        "summary, category, difficulty, technologies, datasetTools, whyBuildIt, suggestedSteps. "
        "Use the same keep/discard rules and writing requirements below.\n\n"
        "For discard, provide a concise reason and set generated fields to null. For keep, write a "
        "specific, appealing, buildable project with at least three unique tailored steps. Never begin "
        "a title with 'Turn'. Do not change or repeat provenance fields in generated fields.\n\n"
        f"Source records:\n{json.dumps(payload, ensure_ascii=False, sort_keys=True)}"
    )


def enrich_records_in_batches(
    records: list[dict[str, Any]],
    chat: Callable[[str], str],
    batch_size: int = DEFAULT_BATCH_SIZE,
) -> EnrichmentResult:
    """Enrich records in source-site batches, preserving failed batches for retry."""

    if batch_size < 1:
        raise ValueError("batch_size must be positive")
    output: list[dict[str, Any]] = []
    failures: list[tuple[str, str]] = []
    enriched_count = kept_count = discarded_count = 0
    groups: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        groups.setdefault(str(record.get("sourceName") or record.get("source") or "unknown"), []).append(record)
    for group in groups.values():
        for start in range(0, len(group), batch_size):
            batch = group[start:start + batch_size]
            originals = [copy.deepcopy(record) for record in batch]
            identifiers = {str(record.get("id")) for record in batch}
            try:
                for record in originals:
                    validate_source_record(record)
                patches = parse_gemini_batch_json(chat(build_batch_prompt(originals)), identifiers)
                for original in originals:
                    merged = merge_enrichment(original, patches[str(original["id"])])
                    merged["enrichedBy"] = "gemini"
                    output.append(merged)
                    enriched_count += 1
                    if merged["decision"] == "discard":
                        discarded_count += 1
                    else:
                        kept_count += 1
            except Exception as exc:
                reason = f"Gemini batch failed validation: {exc}"
                for original in originals:
                    output.append({key: value for key, value in original.items() if key != "enrichedBy"})
                    failures.append((str(original.get("id")), reason))
    return EnrichmentResult(output, failures, enriched_count, kept_count, discarded_count)


def _is_rate_limit_error(error: Exception) -> bool:
    status = getattr(error, "status_code", None) or getattr(error, "code", None)
    if status == 429 or str(status) == "429":
        return True
    message = str(error).lower()
    return "429" in message or "resource exhausted" in message or "rate limit" in message


def _redact_secret(message: str, secret: str) -> str:
    return message.replace(secret, "[redacted]")


def create_gemini_chat(
    *,
    api_key: str | None = None,
    model: str | None = None,
    env_file: Path = DEFAULT_ENV_FILE,
    max_retries: int = 3,
    backoff_seconds: float = 1.0,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    sleep: Callable[[float], None] = time.sleep,
) -> Callable[[str], str]:
    """Create a Gemini chat callable with bounded 429 retry/backoff handling."""

    if max_retries < 0:
        raise ValueError("max_retries must be non-negative")
    if backoff_seconds < 0:
        raise ValueError("backoff_seconds must be non-negative")
    if timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")
    resolved_key, resolved_model = (
        (api_key.strip(), (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL)
        if api_key
        else load_gemini_config(env_file)
    )
    try:
        from google import genai  # type: ignore[import-not-found]
        from google.genai import types  # type: ignore[import-not-found]
    except Exception as exc:
        raise GeminiConfigurationError(
            "google-genai is not installed. Install it with "
            "'python -m pip install -r requirements-gemini.txt'."
        ) from exc

    try:
        client = genai.Client(
            api_key=resolved_key,
            http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),
        )
    except Exception as exc:
        raise GeminiConfigurationError(
            f"Could not initialise Gemini: {_redact_secret(str(exc), resolved_key)}"
        ) from exc
    if not callable(getattr(getattr(client, "models", None), "generate_content", None)):
        raise GeminiConfigurationError("Gemini client has no callable models.generate_content method.")

    request_number = 0

    def chat(prompt: str) -> str:
        nonlocal request_number
        request_number += 1
        print(f"Gemini request {request_number}...", flush=True)
        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )
        for attempt in range(max_retries + 1):
            try:
                response = client.models.generate_content(
                    model=resolved_model,
                    contents=prompt,
                    config=config,
                )
                text = getattr(response, "text", None)
                if not isinstance(text, str) or not text.strip():
                    raise EnrichmentError("Gemini response did not contain text")
                return text
            except Exception as exc:
                if not _is_rate_limit_error(exc) or attempt >= max_retries:
                    raise RuntimeError(_redact_secret(str(exc), resolved_key)) from exc
                sleep(backoff_seconds * (2**attempt))
        raise AssertionError("unreachable")

    return chat


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing output.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, help="Destination; defaults to --input and is replaced atomically.")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Dotenv file for Gemini settings.")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Records per source-site Gemini request.")
    args = parser.parse_args(argv)

    input_path = args.input.resolve()
    output_path = (args.output or args.input).resolve()
    records = _load_records(input_path)
    try:
        chat = create_gemini_chat(env_file=args.env_file.resolve())
    except GeminiConfigurationError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2

    result = enrich_records_in_batches(records, chat, args.batch_size)
    if not args.dry_run:
        atomic_write_json(output_path, result.records)
        print(
            f"Wrote {result.enriched_count}/{len(records)} Gemini decisions to {output_path} "
            f"({result.kept_count} kept, {result.discarded_count} discarded)."
        )
    else:
        print(
            f"Dry run: validated {result.enriched_count}/{len(records)} Gemini decisions; no file was written "
            f"({result.kept_count} kept, {result.discarded_count} discarded)."
        )
    for identifier, reason in result.failures:
        print(f"[WARN] {identifier}: preserved original record ({reason})", file=sys.stderr)
    if result.failures:
        print(f"Gemini enrichment completed with {len(result.failures)} per-item failure(s).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
