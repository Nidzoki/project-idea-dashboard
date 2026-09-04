import unittest

from scripts.enrich_with_youchat import (
    EnrichmentError,
    fallback_enrichment,
    enrich_records,
    build_prompt,
    infer_category,
    merge_enrichment,
    parse_youchat_json,
)


def source_record():
    return {
        "id": "hn-1",
        "title": "Ask HN: A useful question",
        "summary": "A short source summary.",
        "category": "Community",
        "difficulty": "Starter",
        "technologies": ["API"],
        "source": "Hacker News · Ask HN",
        "datasetTools": "Hacker News public API",
        "whyBuildIt": "Original deterministic reason.",
        "suggestedSteps": ["One", "Two", "Three"],
        "color": "green",
        "sourceId": "hacker-news",
        "sourceName": "Hacker News",
        "sourceUrl": "https://news.ycombinator.com/item?id=1",
        "license": "Public API",
        "usageNote": "Metadata only",
        "attribution": "Hacker News / Y Combinator",
        "collectedAt": "2026-01-01T00:00:00Z",
        "approved": False,
    }


class EnrichmentTests(unittest.TestCase):
    def test_parses_fenced_strict_json(self):
        parsed = parse_youchat_json(
            '```json\n{"decision":"keep","discardReason":"","title":"A better build",'
            '"summary":"Specific summary","category":"Programming","difficulty":"Intermediate",'
            '"technologies":["API"],"datasetTools":"A focused API fixture",'
            '"whyBuildIt":"A clear reason","suggestedSteps":["One","Two","Three"]}\n```'
        )
        self.assertEqual(parsed["title"], "A better build")
        self.assertEqual(parsed["suggestedSteps"], ["One", "Two", "Three"])

    def test_parses_discard_decision(self):
        parsed = parse_youchat_json(
            '{"decision":"discard","discardReason":"Too vague","title":null,"summary":null,'
            '"category":null,"difficulty":null,"technologies":null,"datasetTools":null,'
            '"whyBuildIt":null,"suggestedSteps":null}'
        )
        self.assertEqual(parsed["decision"], "discard")
        self.assertEqual(parsed["discardReason"], "Too vague")

    def test_prompt_contains_the_complete_source_record(self):
        prompt = build_prompt(source_record())
        for field in source_record():
            self.assertIn(f'"{field}"', prompt)

    def test_rejects_non_json_or_missing_fields(self):
        with self.assertRaises(EnrichmentError):
            parse_youchat_json("Here is your JSON: {}")

    def test_merge_preserves_provenance(self):
        record = source_record()
        enriched = merge_enrichment(
            record,
            {
                "decision": "keep",
                "discardReason": "",
                "title": "A better build",
                "summary": "Specific summary",
                "whyBuildIt": "A clear reason",
                "suggestedSteps": ["One", "Two", "Three"],
                "category": "Programming",
                "difficulty": "Intermediate",
                "technologies": ["API", "TypeScript"],
                "datasetTools": "A focused API fixture",
            },
        )
        self.assertEqual(enriched["title"], "A better build")
        self.assertEqual(enriched["sourceUrl"], record["sourceUrl"])
        self.assertEqual(enriched["license"], record["license"])
        self.assertEqual(enriched["approved"], record["approved"])
        self.assertEqual(enriched["datasetTools"], "A focused API fixture")

    def test_merge_rejects_provenance_in_response(self):
        with self.assertRaises(EnrichmentError):
            merge_enrichment(
                source_record(),
                {
                    **fallback_enrichment(source_record()),
                    "sourceUrl": "https://evil.test",
                },
            )

    def test_merge_marks_discard_without_changing_provenance(self):
        record = source_record()
        discarded = merge_enrichment(
            record,
            {
                "decision": "discard",
                "discardReason": "Not enough implementation detail",
                "title": None,
                "summary": None,
                "category": None,
                "difficulty": None,
                "technologies": None,
                "datasetTools": None,
                "whyBuildIt": None,
                "suggestedSteps": None,
            },
        )
        self.assertEqual(discarded["decision"], "discard")
        self.assertEqual(discarded["discardReason"], "Not enough implementation detail")
        self.assertEqual(discarded["sourceUrl"], record["sourceUrl"])

    def test_fallback_is_deterministic_and_actionable(self):
        first = fallback_enrichment(source_record())
        second = fallback_enrichment(source_record())
        self.assertEqual(first, second)
        self.assertEqual(first["decision"], "keep")
        self.assertFalse(first["title"].lower().startswith("turn"))
        self.assertGreaterEqual(len(first["suggestedSteps"]), 3)
        self.assertEqual(len(first["suggestedSteps"]), len(set(first["suggestedSteps"])))
        self.assertNotEqual(first["category"], "Community")

    def test_fallback_categories_follow_source_content(self):
        outage = source_record()
        outage["title"] = "Why were three API providers simultaneously down?"
        outage["summary"] = "A service outage and infrastructure incident."
        outage["technologies"] = ["API"]
        self.assertEqual(infer_category(outage), "IT")

        coding = source_record()
        coding["title"] = "A command line code formatter for Python"
        coding["summary"] = "A developer tool for editing source code."
        self.assertEqual(infer_category(coding), "Programming")

        data = source_record()
        data["title"] = "Forecast energy demand from an open dataset"
        data["summary"] = "Compare statistical models and visualize the error."
        self.assertEqual(infer_category(data), "Data Science")

        device = source_record()
        device["title"] = "Sensor telemetry for a greenhouse"
        device["summary"] = "An embedded device sends readings over MQTT."
        self.assertEqual(infer_category(device), "IoT")

    def test_fallback_steps_are_record_specific(self):
        first = fallback_enrichment(source_record())
        second_record = source_record()
        second_record["id"] = "hn-2"
        second_record["title"] = "A command line code formatter for Python"
        second_record["summary"] = "A developer tool for editing source code."
        second = fallback_enrichment(second_record)
        self.assertNotEqual(first["suggestedSteps"], second["suggestedSteps"])

    def test_bad_item_response_keeps_original_and_reports_failure(self):
        record = source_record()
        result = enrich_records([record], "youchat", lambda _prompt: '{"title":"missing"}')
        self.assertEqual(result.records[0]["id"], record["id"])
        self.assertEqual(result.records[0], record)
        self.assertEqual(result.enriched_count, 0)
        self.assertEqual(result.discarded_count, 0)
        self.assertEqual(result.failures[0][0], record["id"])


if __name__ == "__main__":
    unittest.main()
