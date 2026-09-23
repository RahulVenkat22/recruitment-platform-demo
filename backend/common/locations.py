"""Countries and the places in them, for the job description form: every place
with 15,000 people or more, from GeoNames through ``geonamescache`` (MIT, data
bundled, no network). A job description stores the label ``"<city>, <country>"``.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from functools import cache

import geonamescache

# Spellings people use that GeoNames does not list as the country's name.
COUNTRY_ALIASES = {
    "uk": "GB",
    "great britain": "GB",
    "england": "GB",
    "scotland": "GB",
    "wales": "GB",
    "northern ireland": "GB",
    "usa": "US",
    "u.s.": "US",
    "u.s.a.": "US",
    "united states of america": "US",
    "uae": "AE",
    "holland": "NL",
    "south korea": "KR",
    "russia": "RU",
    "vietnam": "VN",
    "czech republic": "CZ",
}


@dataclass(frozen=True)
class Country:
    code: str
    name: str


def _fold(text: str) -> str:
    """Case- and accent-insensitive key, so "Bengalūru" and "bengaluru" meet."""
    stripped = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(stripped.casefold().split())


@cache
def _data() -> geonamescache.GeonamesCache:
    return geonamescache.GeonamesCache()


@cache
def countries() -> tuple[Country, ...]:
    rows = _data().get_countries().values()
    return tuple(
        sorted((Country(row["iso"], row["name"]) for row in rows), key=lambda c: _fold(c.name))
    )


@cache
def country(code: str) -> Country | None:
    wanted = code.upper()
    return next((entry for entry in countries() if entry.code == wanted), None)


@cache
def cities(code: str) -> tuple[str, ...]:
    """The distinct place names in a country, alphabetical."""
    wanted = code.upper()
    names = {row["name"] for row in _data().get_cities().values() if row["countrycode"] == wanted}
    return tuple(sorted(names, key=_fold))


def label(city: str, code: str) -> str:
    found = country(code)
    return f"{city}, {found.name}" if found else city


@cache
def _country_keys() -> dict[str, str]:
    keys = dict(COUNTRY_ALIASES)
    for row in _data().get_countries().values():
        for key in (row["name"], row["iso"], row["iso3"]):
            keys.setdefault(_fold(key), row["iso"])
    return keys


@cache
def _city_keys() -> dict[str, list[tuple[str, str, int]]]:
    """Folded name or alternate name -> ``(name, country code, population)``, biggest first."""
    keys: dict[str, list[tuple[str, str, int]]] = {}
    for row in _data().get_cities().values():
        entry = (row["name"], row["countrycode"], row["population"])
        for name in (row["name"], *row.get("alternatenames", [])):
            key = _fold(name)
            if len(key) >= 2:
                keys.setdefault(key, []).append(entry)
    for entries in keys.values():
        entries.sort(key=lambda entry: -entry[2])
    return keys


def normalise(text: str) -> str:
    """Best-effort ``"<city>, <country>"`` for free text such as "Bath, UK",
    "Mumbai (Hybrid)" or "Bangalore"; unrecognised text comes back unchanged."""
    parts = [part.strip() for part in re.split(r"[,/|()]", text) if part.strip()]
    keys = _country_keys()
    code = next((keys[_fold(part)] for part in parts if _fold(part) in keys), None)
    for part in parts:
        if _fold(part) in keys:
            continue
        for name, city_code, _population in _city_keys().get(_fold(part), []):
            if code is None or city_code == code:
                return label(name, city_code)
    return text.strip()
