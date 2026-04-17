"""Small helper utilities shared by the remaining single-pass pipeline."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

PartFamily = str


@dataclass(frozen=True)
class ParsedDimensions:
    """Lightweight numeric extraction result."""

    values: dict[str, float]
    raw_numbers: list[float]


def normalize_entity_text(request: str) -> str:
    """Normalize common URL/slug separators so entity matching sees real words."""
    text = request.lower()
    text = re.sub(r"https?://", " ", text)
    text = re.sub(r"www\.", " ", text)
    text = re.sub(r"[%:?#=&]+", " ", text)
    text = re.sub(r"[-_/]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def infer_part_family(request: str) -> PartFamily:
    """Classify a request into a coarse string family."""
    text = normalize_entity_text(request)

    if any(token in text for token in ("gear", "齿轮", "spur gear", "helical gear", "bevel gear", "worm gear")):
        return "spur_gear"
    if any(token in text for token in ("phone case", "iphone case", "手机壳", "保护壳", "case for iphone")):
        return "phone_case"
    if any(token in text for token in ("stand", "底座", "dock", "cradle", "holder", "support", "支架")):
        return "device_stand"
    if any(token in text for token in ("enclosure", "case", "box", "shell", "housing", "机箱", "外壳")):
        return "electronics_enclosure"
    return "unknown"


def normalize_part_family_value(part_family: PartFamily | str | None) -> str:
    """Normalize a family enum/string into a stable lowercase value."""
    if part_family is None:
        return ""
    return str(part_family).strip().lower()


def has_resolved_part_family(part_family: PartFamily | str | None) -> bool:
    """Return whether a family is present and not the unknown sentinel."""
    return normalize_part_family_value(part_family) not in {"", "unknown", "none"}


def normalize_known_object_name(request: str) -> str:
    """Return a normalized real-world object label when detectable."""
    text = normalize_entity_text(request)
    iphone_match = re.search(r"(iphone\s*\d+\s*(?:pro|max|plus|mini)?)", text, re.IGNORECASE)
    if iphone_match:
        return iphone_match.group(1).replace("  ", " ").title()
    samsung_match = re.search(r"((?:samsung|galaxy)\s*[a-z]*\s*\d+\s*(?:ultra|plus|pro)?)", text, re.IGNORECASE)
    if samsung_match:
        return samsung_match.group(1).replace("  ", " ").title()
    pixel_match = re.search(r"(pixel\s*\d+\s*(?:pro|xl|fold|a)?)", text, re.IGNORECASE)
    if pixel_match:
        return pixel_match.group(1).replace("  ", " ").title()
    macbook_match = re.search(r"(macbook\s*(?:pro|air)?\s*\d*)", text, re.IGNORECASE)
    if macbook_match:
        return macbook_match.group(1).replace("  ", " ").title().strip()
    mac_studio_match = re.search(r"(mac\s*studio\s*(?:m\d+)?)", text, re.IGNORECASE)
    if mac_studio_match:
        suffix = mac_studio_match.group(1).lower().replace("mac studio", "").strip()
        return f"Mac Studio{(' ' + suffix.upper()) if suffix else ''}".strip()
    mac_mini_match = re.search(r"(mac\s*mini\s*(?:m\d+)?)", text, re.IGNORECASE)
    if mac_mini_match:
        suffix = mac_mini_match.group(1).lower().replace("mac mini", "").strip()
        return f"Mac mini{(' ' + suffix.upper()) if suffix else ''}".strip()
    return request.strip()[:64] or "Unknown Part"


def extract_numbers(request: str) -> ParsedDimensions:
    """Extract numbers and simple dimension hints from a request."""
    values: dict[str, float] = {}
    raw_numbers = [float(item) for item in re.findall(r"(\d+(?:\.\d+)?)", request)]
    text = request.lower()

    family = infer_part_family(request)
    if family and family != "unknown":
        if family == "spur_gear":
            _assign_dimension(values, text, "teeth", r"(\d+)\s*(?:齿|tooth|teeth)")
            _assign_dimension(values, text, "outer_diameter", r"(?:outer|outside|od|外径|外)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "inner_diameter", r"(?:inner|bore|hole|id|内径|内)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "thickness", r"(?:thickness|thick|厚度|厚)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "pressure_angle", r"(\d+(?:\.\d+)?)\s*deg(?:ree)?")
        elif family == "device_stand":
            _assign_dimension(values, text, "device_width", r"(?:width|w)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "device_depth", r"(?:depth|d)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "stand_height", r"(?:height|h)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "wall_thickness", r"(?:wall|thickness)[^\d]*(\d+(?:\.\d+)?)\s*mm")
        elif family == "electronics_enclosure":
            _assign_dimension(values, text, "outer_width", r"(?:width|w|宽度|宽)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "outer_depth", r"(?:depth|d|深度|深)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "outer_height", r"(?:height|h|高度|高)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "wall_thickness", r"(?:wall|thickness|壁厚|厚)[^\d]*(\d+(?:\.\d+)?)\s*mm")
        elif family == "phone_case":
            _assign_dimension(values, text, "body_length", r"(?:length|long|长)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "body_width", r"(?:width|wide|宽)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "body_depth", r"(?:depth|thickness|厚)[^\d]*(\d+(?:\.\d+)?)\s*mm")
            _assign_dimension(values, text, "wall_thickness", r"(?:wall|thickness|壁厚)[^\d]*(\d+(?:\.\d+)?)\s*mm")

    return ParsedDimensions(values=values, raw_numbers=raw_numbers)


def family_default_values(family: PartFamily) -> dict[str, float]:
    """Return stable default values for supported families."""
    if family == "spur_gear":
        return {
            "teeth": 17.0,
            "outer_diameter": 30.0,
            "inner_diameter": 10.0,
            "thickness": 3.0,
            "pressure_angle": 20.0,
        }
    if family == "device_stand":
        return {
            "device_width": 130.0,
            "device_depth": 130.0,
            "corner_radius": 41.5,
            "stand_height": 27.5,
            "lip_height": 9.7,
            "wall_thickness": 7.2,
            "base_flare": 10.0,
            "arch_radius": 61.0,
            "arch_peak": 22.0,
        }
    if family == "electronics_enclosure":
        return {
            "outer_width": 100.0,
            "outer_depth": 70.0,
            "outer_height": 28.0,
            "wall_thickness": 2.4,
            "corner_radius": 8.0,
            "clearance": 0.5,
            "lid_overlap": 3.0,
            "standoff_height": 6.0,
            "boss_diameter": 5.0,
            "vent_spacing": 12.0,
        }
    if family == "phone_case":
        return {
            "body_length": 149.6,
            "body_width": 71.5,
            "body_depth": 8.3,
            "wall_thickness": 1.8,
            "side_clearance": 0.6,
            "camera_clearance": 1.2,
            "lip_height": 1.0,
            "bottom_opening_depth": 9.0,
            "corner_bumper_thickness": 2.4,
        }
    return {}


def label_for_key(key: str) -> str:
    """Create a human-friendly label from a parameter key."""
    return key.replace("_", " ").title()


def unit_for_key(key: str) -> str:
    """Infer a unit for a parameter key."""
    if any(token in key for token in ("angle",)):
        return "deg"
    if any(token in key for token in ("teeth", "count", "quantity")):
        return "count"
    return "mm"


def infer_missing_questions(family: PartFamily, values: dict[str, float]) -> list[str]:
    """Return open questions that still matter for the family."""
    questions = {
        "spur_gear": [
            "Should the gear be hubbed or flat?",
            "Is the pressure angle standard 20 degrees?",
        ],
        "device_stand": [
            "What exact device footprint should the stand fit?",
            "Should the stand prioritize airflow or enclosure?",
        ],
        "electronics_enclosure": [
            "How much internal clearance is needed around the electronics?",
            "Does the enclosure need a split line or a one-piece shell?",
            "Are there specific cutouts or mounting bosses required?",
        ],
        "phone_case": [
            "How protective should the case be around the corners and camera island?",
            "Should the bottom edge stay open for easier port access?",
            "How much front lip should protect the screen?",
        ],
    }

    base = questions.get(family, [])
    if family == "spur_gear" and "teeth" not in values:
        base = base + ["How many teeth should the gear have?"]
    if family == "device_stand" and "device_width" not in values:
        base = base + ["What is the supported device size?"]
    if family == "electronics_enclosure" and "outer_width" not in values:
        base = base + ["What are the target outer dimensions?"]
    if family == "phone_case" and "body_length" not in values:
        base = base + ["What exact phone dimensions should the case wrap around?"]
    return list(dict.fromkeys(base))


def build_search_queries(request: str, family: PartFamily) -> list[str]:
    """Create research-oriented search queries."""
    text = request.strip()
    normalized_text = normalize_entity_text(text)
    if family == "spur_gear":
        return [f"{text} standard gear dimensions", f"{text} module pressure angle"]
    if family == "device_stand":
        normalized = normalize_known_object_name(text)
        request_lower = normalized_text
        if "mac mini" in request_lower:
            return [
                f"{normalized} dimensions",
                f"{normalized} width depth height",
                f"{normalized} port layout",
                f"{normalized} vent layout",
            ]
        if "mac studio" in request_lower:
            return [
                f"{normalized} dimensions",
                f"{normalized} width depth height",
                f"{normalized} ports layout",
                f"{normalized} cooling airflow",
            ]
        if any(token in request_lower for token in ("iphone", "samsung", "galaxy", "pixel", "手机")):
            return [
                f"{normalized} dimensions",
                f"{normalized} weight",
                f"{normalized} charging port location",
                f"{normalized} camera bump size",
            ]
        if any(token in request_lower for token in ("macbook", "laptop", "notebook", "电脑")):
            return [
                f"{normalized} dimensions",
                f"{normalized} hinge location",
                f"{normalized} vent layout",
                f"{normalized} footprint rubber feet",
            ]
        return [f"{normalized} product dimensions", f"{normalized} device footprint stand"]
    if family == "electronics_enclosure":
        return [f"{text} enclosure clearance", f"{text} electronics case dimensions"]
    if family == "phone_case":
        normalized = normalize_known_object_name(text)
        return [
            f"{normalized} dimensions",
            f"{normalized} camera bump size",
            f"{normalized} button layout",
            f"{normalized} port layout",
        ]
    return [text]


def _assign_dimension(values: dict[str, float], text: str, key: str, pattern: str) -> None:
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        try:
            values[key] = float(match.group(1))
        except (TypeError, ValueError):
            pass
