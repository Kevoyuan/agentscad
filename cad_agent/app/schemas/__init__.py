"""Schemas package."""

SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "ValidationResult",
    "type": "object",
    "properties": {
        "rule_id": {"type": "string"},
        "rule_name": {"type": "string"},
        "level": {"type": "string", "enum": ["render", "engineering", "business"]},
        "rule_type": {"type": "string"},
        "passed": {"type": "boolean"},
        "severity": {"type": "string", "enum": ["error", "warning", "info"]},
        "message": {"type": "string"},
        "measured_value": {"type": "number"},
        "threshold_value": {"type": "number"},
    },
    "required": ["rule_id", "rule_name", "level", "rule_type", "passed", "severity", "message"],
}
