import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.enrich_with_gemini import (
    build_batch_prompt,
    create_gemini_chat,
    enrich_records_in_batches,
    load_env_file,
    load_gemini_config,
    parse_gemini_batch_json,
)


class FakeResponse:
    def __init__(self, text):
        self.text = text


class FakeModels:
    def __init__(self):
        self.calls = []
        self.attempts = 0

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        self.attempts += 1
        if self.attempts == 1:
            error = RuntimeError("429 RESOURCE_EXHAUSTED")
            error.status_code = 429
            raise error
        return FakeResponse(
            '{"decision":"discard","discardReason":"Too vague","title":null,'
            '"summary":null,"category":null,"difficulty":null,"technologies":null,'
            '"datasetTools":null,"whyBuildIt":null,"suggestedSteps":null}'
        )


class GeminiTests(unittest.TestCase):
    def test_batch_parser_requires_every_source_id(self):
        raw = (
            '[{"id":"one","decision":"discard","discardReason":"Too vague","title":null,'
            '"summary":null,"category":null,"difficulty":null,"technologies":null,'
            '"datasetTools":null,"whyBuildIt":null,"suggestedSteps":null}]'
        )
        parsed = parse_gemini_batch_json(raw, {"one"})
        self.assertEqual(parsed["one"]["decision"], "discard")

    def test_batches_preserve_failed_records_and_mark_successes(self):
        from scripts.test_enrich_with_youchat import source_record

        first = source_record()
        second = source_record()
        second["id"] = "hn-2"
        calls = []

        def chat(prompt):
            calls.append(prompt)
            return (
                '[{"id":"hn-1","decision":"keep","discardReason":"","title":"Focused build",'
                '"summary":"Specific summary","category":"Programming","difficulty":"Starter",'
                '"technologies":["API"],"datasetTools":"Fixture","whyBuildIt":"Useful reason",'
                '"suggestedSteps":["One","Two","Three"]},'
                '{"id":"hn-2","decision":"keep","discardReason":"","title":"Focused build two",'
                '"summary":"Specific summary","category":"Programming","difficulty":"Starter",'
                '"technologies":["API"],"datasetTools":"Fixture","whyBuildIt":"Useful reason",'
                '"suggestedSteps":["One","Two","Three"]}]'
            )

        result = enrich_records_in_batches([first, second], chat, batch_size=2)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result.enriched_count, 2)
        self.assertEqual(result.records[0]["enrichedBy"], "gemini")
        self.assertIn('"id": "hn-1"', calls[0])

    def test_loads_dotenv_without_printing_or_overriding_environment(self):
        path = Path(__file__).with_name(".gemini-test.env")
        path.write_text(
            'GEMINI_API_KEY="file-key"\nGEMINI_MODEL=gemini-test\n',
            encoding="utf-8",
        )
        self.addCleanup(lambda: path.unlink(missing_ok=True))
        self.assertEqual(load_env_file(path)["GEMINI_MODEL"], "gemini-test")
        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(load_gemini_config(path), ("file-key", "gemini-test"))
        with patch.dict("os.environ", {"GEMINI_API_KEY": "process-key"}, clear=True):
            self.assertEqual(load_gemini_config(path), ("process-key", "gemini-test"))

    def test_mocks_gemini_response_and_retries_rate_limit(self):
        models = FakeModels()
        fake_google = types.ModuleType("google")
        fake_genai = types.ModuleType("google.genai")
        fake_types = types.ModuleType("google.genai.types")
        fake_genai.Client = lambda **kwargs: types.SimpleNamespace(models=models)
        fake_types.GenerateContentConfig = lambda **kwargs: kwargs
        fake_types.HttpOptions = lambda **kwargs: kwargs
        fake_google.genai = fake_genai
        sleeps = []
        with patch.dict(
            sys.modules,
            {"google": fake_google, "google.genai": fake_genai, "google.genai.types": fake_types},
        ):
            chat = create_gemini_chat(
                api_key="test-key",
                model="gemini-test",
                max_retries=1,
                backoff_seconds=0.25,
                sleep=sleeps.append,
            )
            response = chat("return strict JSON")
        self.assertIn('"decision":"discard"', response)
        self.assertEqual(sleeps, [0.25])
        self.assertEqual(models.calls[0]["model"], "gemini-test")
        self.assertEqual(models.calls[0]["config"]["response_mime_type"], "application/json")


if __name__ == "__main__":
    unittest.main()
