"""Optional, developer-run YouChat enrichment for generated idea records.

The normal collection pipeline remains deterministic and never imports this
module.  YouChat is only contacted with ``--enrich``; ``--fixture`` uses a
deterministic local fallback and is safe for tests and static builds.
"""

from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import os
import re
import sys
import types
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "src" / "data" / "generated" / "pipeline-ideas.json"
DECISION_FIELDS = (
    "decision",
    "discardReason",
    "title",
    "summary",
    "category",
    "difficulty",
    "technologies",
    "datasetTools",
    "whyBuildIt",
    "suggestedSteps",
)
# Kept as a public alias for callers that used the original enrichment name.
ENRICHED_FIELDS = DECISION_FIELDS
GENERATED_FIELDS = tuple(field for field in DECISION_FIELDS if field not in {"decision", "discardReason"})
PROVENANCE_FIELDS = (
    "id",
    "source",
    "sourceId",
    "sourceName",
    "sourceUrl",
    "license",
    "usageNote",
    "attribution",
    "collectedAt",
    "publishedAt",
    "approved",
)
DIFFICULTIES = {"Starter", "Intermediate", "Advanced"}


class EnrichmentError(ValueError):
    """Raised when an enrichment response cannot be safely merged."""


class OptionalDependencyError(RuntimeError):
    """Raised when explicit YouChat mode is requested without ai4free."""


@dataclass
class EnrichmentResult:
    records: list[dict[str, Any]]
    failures: list[tuple[str, str]]
    enriched_count: int
    kept_count: int = 0
    discarded_count: int = 0


def _non_empty_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EnrichmentError(f"{field} must be a non-empty string")
    return value.strip()


def _validate_generated_fields(value: dict[str, Any]) -> dict[str, Any]:
    """Validate copy fields for a kept decision."""

    title = _non_empty_string(value["title"], "title")
    if re.match(r"^turn\b", title, re.IGNORECASE):
        raise EnrichmentError("title must not begin with 'Turn'")
    result = {
        "title": title,
        "summary": _non_empty_string(value["summary"], "summary"),
        "whyBuildIt": _non_empty_string(value["whyBuildIt"], "whyBuildIt"),
        "category": _non_empty_string(value["category"], "category"),
        "datasetTools": _non_empty_string(value["datasetTools"], "datasetTools"),
    }
    difficulty = _non_empty_string(value["difficulty"], "difficulty")
    if difficulty not in DIFFICULTIES:
        raise EnrichmentError("difficulty must be Starter, Intermediate, or Advanced")
    result["difficulty"] = difficulty

    steps = value["suggestedSteps"]
    if (
        not isinstance(steps, list)
        or len(steps) < 3
        or any(not isinstance(step, str) or not step.strip() for step in steps)
        or len({step.strip().casefold() for step in steps}) != len(steps)
    ):
        raise EnrichmentError("suggestedSteps must contain at least three unique non-empty strings")
    result["suggestedSteps"] = [step.strip() for step in steps]

    technologies = value["technologies"]
    if (
        not isinstance(technologies, list)
        or not technologies
        or any(not isinstance(technology, str) or not technology.strip() for technology in technologies)
    ):
        raise EnrichmentError("technologies must contain at least one non-empty string")
    result["technologies"] = list(dict.fromkeys(technology.strip() for technology in technologies))
    return result


def validate_decision(value: Any) -> dict[str, Any]:
    """Validate YouChat's strict keep/discard decision object."""

    if not isinstance(value, dict):
        raise EnrichmentError("response must be a JSON object")
    unexpected = set(value) - set(DECISION_FIELDS)
    missing = set(DECISION_FIELDS) - set(value)
    if missing:
        raise EnrichmentError(f"response is missing fields: {', '.join(sorted(missing))}")
    if unexpected:
        raise EnrichmentError(f"response contains unexpected fields: {', '.join(sorted(unexpected))}")

    decision = _non_empty_string(value["decision"], "decision").lower()
    if decision not in {"keep", "discard"}:
        raise EnrichmentError("decision must be keep or discard")
    discard_reason = value["discardReason"]
    if not isinstance(discard_reason, str):
        raise EnrichmentError("discardReason must be a string")
    discard_reason = discard_reason.strip()
    if decision == "discard":
        if not discard_reason:
            raise EnrichmentError("discardReason is required when decision is discard")
        if any(value[field] is not None for field in GENERATED_FIELDS):
            raise EnrichmentError("discard decisions must use null generated fields")
        return {"decision": "discard", "discardReason": discard_reason, **{field: None for field in GENERATED_FIELDS}}
    if discard_reason:
        raise EnrichmentError("discardReason must be empty when decision is keep")
    return {"decision": "keep", "discardReason": "", **_validate_generated_fields(value)}


def validate_enrichment(value: Any) -> dict[str, Any]:
    """Backward-compatible name for strict decision validation."""

    return validate_decision(value)


def parse_youchat_json(raw: str) -> dict[str, Any]:
    """Parse a strict JSON object, accepting only an optional markdown fence."""

    if not isinstance(raw, str):
        raise EnrichmentError("YouChat response must be text")
    text = raw.strip().lstrip("\ufeff")
    if text.startswith("```") and text.endswith("```"):
        lines = text.splitlines()
        text = "\n".join(lines[1:-1]).strip()
    if not text.startswith("{") or not text.endswith("}"):
        raise EnrichmentError("response must contain only one JSON object")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        raise EnrichmentError(f"invalid JSON: {exc.msg}") from exc
    return validate_decision(parsed)


def validate_source_record(record: Any) -> dict[str, Any]:
    """Check the fields needed to safely preserve a generated record."""

    if not isinstance(record, dict):
        raise EnrichmentError("source record must be an object")
    for field in ("id", "title", "summary", "category", "difficulty", "sourceUrl", "collectedAt"):
        _non_empty_string(record.get(field), field)
    if record["difficulty"] not in DIFFICULTIES:
        raise EnrichmentError("source record has an invalid difficulty")
    for field in ("technologies", "suggestedSteps"):
        value = record.get(field)
        if not isinstance(value, list) or not value:
            raise EnrichmentError(f"source record has invalid {field}")
    if not isinstance(record.get("approved"), bool):
        raise EnrichmentError("source record has an invalid approved flag")
    decision = record.get("decision", "keep")
    if decision not in {"keep", "discard"}:
        raise EnrichmentError("source record has an invalid decision")
    if decision == "discard" and not isinstance(record.get("discardReason"), str):
        raise EnrichmentError("discarded source record must include a discardReason")
    return record


def merge_enrichment(record: dict[str, Any], enrichment: Any) -> dict[str, Any]:
    """Merge generated copy while asserting that provenance is unchanged."""

    original = validate_source_record(copy.deepcopy(record))
    patch = validate_decision(enrichment)
    if patch["decision"] == "discard":
        merged = {
            **original,
            "decision": "discard",
            "discardReason": patch["discardReason"],
        }
    else:
        merged = {
            **original,
            **{field: patch[field] for field in GENERATED_FIELDS},
            "decision": "keep",
            "discardReason": "",
        }
    for field in PROVENANCE_FIELDS:
        if merged.get(field) != original.get(field):
            raise EnrichmentError(f"enrichment changed protected provenance field: {field}")
    validate_source_record(merged)
    return merged


def _subject(record: dict[str, Any]) -> str:
    title = re.sub(r"\s+", " ", record["title"]).strip()
    title = re.sub(r"^(?:ask|show)\s+hn\s*:\s*", "", title, flags=re.IGNORECASE)
    title = re.sub(r"^(?:turn\s+)+", "", title, flags=re.IGNORECASE)
    title = re.sub(r"\s+into a practical\b.*$", "", title, flags=re.IGNORECASE)
    title = re.sub(
        r"\s+(?:incident monitor|sensor lab|evidence notebook|model explorer|developer workbench|"
        r"question map|focused prototype)$",
        "",
        title,
        flags=re.IGNORECASE,
    )
    return title.rstrip("?!:.")[:96]


def infer_category(record: dict[str, Any]) -> str:
    """Choose a useful category from the source content, not its old label."""

    text = " ".join(
        str(record.get(field, ""))
        for field in ("title", "summary", "source", "datasetTools", "technologies")
    )
    rules = (
        ("IT", r"\b(?:outage|outages|down|downtime|incident|infrastructure|server|servers|"
               r"deployment|deploy|dns|email domain|reliability|latency|status page|recaptcha)\b"),
        ("IoT", r"\b(?:iot|sensor|sensors|arduino|raspberry pi|embedded|firmware|device telemetry)\b"),
        ("Data Science", r"\b(?:data science|dataset|data analysis|analytics|statistics|forecast|"
                          r"regression|visuali[sz]ation)\b"),
        ("Computer Science", r"\b(?:algorithm|algorithms|compiler|computer science|fpga|"
                              r"simulator|distributed systems|operating system)\b"),
        ("Programming", r"\b(?:coding|code|developer|development|programming|software|"
                         r"library|sdk|api|cli|repository|typescript|javascript|python|rust|go)\b"),
        ("Community", r"\b(?:community|hiring|career|advice|discussion|people|volunteer)\b"),
    )
    for category, pattern in rules:
        if re.search(pattern, text, re.IGNORECASE):
            return category
    return "Programming" if record.get("technologies") else "Community"


def _fallback_technologies(record: dict[str, Any], category: str) -> list[str]:
    technologies = [str(value).strip() for value in record.get("technologies", []) if str(value).strip()]
    defaults = {
        "IT": ["Monitoring", "HTTP"],
        "IoT": ["MQTT", "Telemetry"],
        "Data Science": ["Python", "Pandas"],
        "Computer Science": ["Python", "Simulation"],
        "Programming": ["TypeScript", "Testing"],
        "Community": ["Web", "Search"],
    }
    for technology in defaults.get(category, ["Python"]):
        if technology not in technologies:
            technologies.append(technology)
    return technologies[:6]


def _fallback_steps(focus: str, category: str, primary_tool: str, source_id: str) -> list[str]:
    steps_by_category = {
        "IT": [
            f"Extract the failure timeline for {focus} from {source_id} and label each observable symptom",
            f"Model a small service-health record around {focus} with {primary_tool} and explicit severity levels",
            f"Replay one {focus} incident locally, then exercise the alert and recovery paths",
            f"Compare detection time and false alarms for {focus} before choosing the next operational safeguard",
        ],
        "IoT": [
            f"Define the physical signal that {focus} should capture and its acceptable sampling range",
            f"Build a small telemetry payload for {focus} and validate it with {primary_tool}",
            f"Replay noisy and missing readings for {focus} before connecting any real device",
            f"Chart one actionable threshold for {focus} and document what an operator should do next",
        ],
        "Data Science": [
            f"Turn the question behind {focus} into one measurable target and a row-level data contract",
            f"Create a reproducible cleaning notebook for {focus} with {primary_tool} and record missing values",
            f"Compare a simple baseline with one stronger model for {focus} using a held-out slice",
            f"Inspect the largest errors in {focus} and write down which new observation would change the result",
        ],
        "Computer Science": [
            f"State the invariant or physical rule that {focus} must preserve in a small test case",
            f"Implement the smallest executable model of {focus} with {primary_tool} and trace its state",
            f"Generate edge cases for {focus}, including one deliberately adversarial input",
            f"Measure the model's trade-offs for {focus} and explain which simplification is safe to keep",
        ],
        "Programming": [
            f"Reduce {focus} to one user-visible behavior and write an acceptance example for it",
            f"Implement that behavior as a narrow {primary_tool} module with a clear input and output",
            f"Add a fixture and failure-path test that reproduces the sharp edge in {focus}",
            f"Package a runnable demo for {focus}, then note the first boundary you would harden",
        ],
        "Community": [
            f"Define the specific question people have about {focus} and the evidence that would answer it",
            f"Design a small contribution flow for {focus} that works with one source link and no account",
            f"Prototype one view that makes disagreement or missing context in {focus} visible",
            f"Test the {focus} workflow with two contrasting examples and record what needs clarification",
        ],
    }
    return steps_by_category.get(category, steps_by_category["Programming"])


def fallback_enrichment(record: dict[str, Any]) -> dict[str, Any]:
    """Produce a stable local enrichment without network access or an LLM."""

    subject = _subject(record)
    category = infer_category(record)
    technologies = _fallback_technologies(record, category)
    primary_tool = technologies[0]
    source_id = str(record.get("id", "the source record"))
    suffix = {
        "IT": "incident monitor",
        "IoT": "sensor lab",
        "Data Science": "evidence notebook",
        "Computer Science": "model explorer",
        "Programming": "developer workbench",
        "Community": "question map",
    }.get(category, "focused prototype")
    title = f"{subject} {suffix}".strip()
    steps = _fallback_steps(subject, category, primary_tool, source_id)
    category_phrase = "IT operations" if category == "IT" else category.lower()
    article = "an" if category == "IT" else "a"
    source_tools = re.split(
        r"\s+plus a local fixture keyed to\b",
        str(record.get("datasetTools", "source metadata")),
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()
    return {
        "decision": "keep",
        "discardReason": "",
        "title": title,
        "summary": (
            f"Build {article} {category_phrase} prototype around {subject}: make one concrete "
            f"behavior observable with {primary_tool}, then test it against the source's question."
        ),
        "whyBuildIt": (
            f"{subject} gives the project a bounded test case instead of a generic demo; "
            f"the result can expose one useful trade-off in {category_phrase} work."
        ),
        "suggestedSteps": steps,
        "category": category,
        "difficulty": record["difficulty"],
        "technologies": technologies[:6],
        "datasetTools": (
            f"{source_tools} plus a local fixture keyed to "
            f"{source_id} ({subject[:40]})"
        ),
    }


def build_prompt(record: dict[str, Any]) -> str:
    """Pass the complete collected record and request one strict decision object."""

    source_context = copy.deepcopy(record)
    return (
        "You are the editorial decision-maker for a developer project idea. The complete collected "
        "source record is included below; use every relevant field, not a subset. Decide whether it "
        "supports a genuinely specific, buildable idea. Choose discard when it is too vague, unsafe, "
        "duplicative, or lacks enough evidence. Do not copy the source wording, do not invent facts, "
        "and do not treat a source claim as verified fact.\n\n"
        "Return exactly one JSON object with exactly these keys: decision, discardReason, title, summary, "
        "category, difficulty, technologies, datasetTools, whyBuildIt, suggestedSteps. decision is "
        "keep or discard. For discard, provide a concise reason and set every other field to null. "
        "For keep, discardReason must be an empty string; all other fields must be populated. "
        "Use at least three unique, concrete steps tailored to this record. Never begin a title with "
        "'Turn'. difficulty must be Starter, Intermediate, or Advanced. category may be Programming, "
        "Data Science, Computer Science, IT, IoT, Community, or another relevant specific category. "
        "The source identity, URLs, licences, attribution, dates, IDs, and approval are protected and "
        "must not appear in the response or be changed.\n\n"
        f"Complete source record (all collected fields):\n{json.dumps(source_context, ensure_ascii=False, sort_keys=True)}"
    )


def _discard_record(record: dict[str, Any], reason: str) -> dict[str, Any]:
    return {**record, "decision": "discard", "discardReason": reason}


def enrich_records(
    records: Iterable[dict[str, Any]],
    mode: str,
    chat: Callable[[str], str] | None = None,
    provider_name: str = "YouChat",
    parser: Callable[[str], dict[str, Any]] = parse_youchat_json,
) -> EnrichmentResult:
    """Ask for a keep/discard decision for every record."""

    output: list[dict[str, Any]] = []
    failures: list[tuple[str, str]] = []
    enriched_count = 0
    kept_count = 0
    discarded_count = 0
    for index, source in enumerate(records):
        original = copy.deepcopy(source)
        identifier = str(source.get("id", f"record-{index}")) if isinstance(source, dict) else f"record-{index}"
        try:
            validate_source_record(original)
            if mode == "fixture":
                patch = fallback_enrichment(original)
            else:
                if chat is None:
                    raise EnrichmentError(f"{provider_name} chat function is required")
                patch = parser(chat(build_prompt(original)))
            merged = merge_enrichment(original, patch)
            merged["enrichedBy"] = provider_name.lower()
            output.append(merged)
            enriched_count += 1
            if merged["decision"] == "discard":
                discarded_count += 1
            else:
                kept_count += 1
        except Exception as exc:
            reason = f"{provider_name} decision failed validation: {exc}"
            # Provider failures are not editorial discard decisions. Keep the
            # source record visible so a later retry cannot empty the dashboard.
            output.append({key: value for key, value in original.items() if key != "enrichedBy"})
            failures.append((identifier, reason))
    return EnrichmentResult(output, failures, enriched_count, kept_count, discarded_count)


def create_youchat_chat() -> Callable[[str], str]:
    """Load ai4free only for explicit network enrichment."""

    try:
        from ai4free import YouChat  # type: ignore[import-not-found]
    except Exception as exc:
        try:
            from importlib.metadata import distribution
            from webscout import AIbase

            # ai4free 0.7 imports every provider from __init__.py. Some
            # releases of webscout removed this unused compatibility symbol,
            # preventing the YouChat module from loading. Load only YouChat
            # after providing the legacy symbol; no package files are changed.
            if not hasattr(AIbase, "AsyncProvider"):
                AIbase.AsyncProvider = AIbase.Provider  # type: ignore[attr-defined]
            # ai4free's YouChat module imports g4f although this provider does
            # not use it. Avoid requiring that unrelated optional package.
            sys.modules.setdefault("g4f", types.ModuleType("g4f"))
            provider_path = distribution("ai4free").locate_file("ai4free/you.py")
            spec = importlib.util.spec_from_file_location("ai4free_youchat_provider", provider_path)
            if spec is None or spec.loader is None:
                raise ImportError("could not locate ai4free/you.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            if not hasattr(module.Conversation, "intro"):
                module.Conversation.intro = ""
            YouChat = module.YouChat
        except Exception as fallback_exc:
            raise OptionalDependencyError(
                "ai4free could not load its YouChat provider. Install the optional dependency with "
                "'python -m pip install -r requirements-enrichment.txt'. Original import error: "
                f"{exc}; direct provider fallback error: {fallback_exc}"
            ) from fallback_exc

    try:
        client = YouChat()
    except Exception as exc:
        raise OptionalDependencyError(f"Could not initialise ai4free YOUCHAT: {exc}") from exc
    if not callable(getattr(client, "chat", None)):
        raise OptionalDependencyError("Installed ai4free YOUCHAT client has no callable chat(prompt) method.")
    return client.chat


def atomic_write_json(path: Path, records: list[dict[str, Any]]) -> None:
    """Write JSON beside the destination, then replace it only after success."""

    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.enrichment.tmp")
    try:
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(records, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _load_records(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"Input file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Input JSON is invalid: {exc}") from exc
    if not isinstance(value, list):
        raise SystemExit("Input JSON must contain an array of generated records.")
    for index, record in enumerate(value):
        try:
            validate_source_record(record)
        except EnrichmentError as exc:
            raise SystemExit(f"Input record {index} is invalid: {exc}") from exc
    return value


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--fixture", "--fallback", action="store_true", help="Use deterministic offline enrichment.")
    mode.add_argument("--enrich", "--youchat", action="store_true", help="Explicitly call ai4free YOUCHAT.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without writing output.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, help="Destination; defaults to --input and is replaced atomically.")
    args = parser.parse_args(argv)

    input_path = args.input.resolve()
    output_path = (args.output or args.input).resolve()
    records = _load_records(input_path)
    try:
        chat = create_youchat_chat() if args.enrich else None
    except OptionalDependencyError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2
    result = enrich_records(records, "youchat" if args.enrich else "fixture", chat)

    if not args.dry_run:
        atomic_write_json(output_path, result.records)
        print(
            f"Wrote {result.enriched_count}/{len(records)} decisions to {output_path} "
            f"({result.kept_count} kept, {result.discarded_count} discarded)."
        )
    else:
        print(
            f"Dry run: validated {result.enriched_count}/{len(records)} decisions; no file was written "
            f"({result.kept_count} kept, {result.discarded_count} discarded)."
        )
    for identifier, reason in result.failures:
        print(f"[WARN] {identifier}: preserved original record ({reason})", file=sys.stderr)
    if result.failures:
        print(f"Enrichment completed with {len(result.failures)} per-item failure(s).", file=sys.stderr)
        if any("401" in reason or "Unauthorized" in reason for _, reason in result.failures):
            print(
                "You.com rejected the unofficial request (401 Unauthorized). "
                "No authentication bypass or browser-cookie reuse is attempted.",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
