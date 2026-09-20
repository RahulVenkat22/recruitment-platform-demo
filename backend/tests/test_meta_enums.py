"""GET /api/v1/meta/enums/ (plan.md 6.4, 6.10, 7.2): every enum with labels, colour
tokens for statuses, sources and categories, the Kanban column mapping and the status order."""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from common import enums
from tests.test_enums import EXPECTED_CATEGORIES, EXPECTED_STATUS_ORDER

pytestmark = pytest.mark.django_db

URL = "/api/v1/meta/enums/"


@pytest.fixture
def payload(auth_client) -> dict:
    response = auth_client.get(URL)
    assert response.status_code == 200
    return response.json()


def test_url_is_named_and_requires_authentication(auth_client):
    assert reverse("api-v1:meta-enums") == URL
    # A fresh client: the auth_client fixture force-authenticates the shared api_client.
    assert APIClient().get(URL).status_code == 401
    response = auth_client.get(URL)
    assert response.status_code == 200
    assert response["Content-Type"].startswith("application/json")


def test_top_level_shape(payload):
    assert set(payload) == {
        "enums",
        "colors",
        "status_order",
        "status_groups",
        "status_entry_category",
        "kanban",
    }


def test_every_enum_is_served_as_key_label_lists(payload):
    assert set(payload["enums"]) == set(enums.ALL_ENUMS)
    for name, choices in enums.ALL_ENUMS.items():
        served = payload["enums"][name]
        assert served == [{"key": member.value, "label": member.label} for member in choices], name
        for entry in served:
            assert set(entry) == {"key", "label"}


def test_eighteen_statuses_and_ten_categories(payload):
    statuses = payload["enums"]["application_status"]
    categories = payload["enums"]["activity_category"]

    assert len(statuses) == 18
    assert [s["key"] for s in statuses] == EXPECTED_STATUS_ORDER
    assert statuses[1] == {"key": "ai_shortlisted", "label": "AI Shortlisted"}
    assert len(categories) == 10
    assert [c["key"] for c in categories] == EXPECTED_CATEGORIES
    assert categories[-1] == {"key": "decision", "label": "Rejected / On Hold"}


def test_colour_tokens_for_statuses_sources_and_categories(payload):
    colors = payload["colors"]
    assert set(colors) == {"application_status", "candidate_source", "activity_category"}
    assert set(colors["application_status"]) == set(EXPECTED_STATUS_ORDER)
    assert set(colors["candidate_source"]) == {
        "internal",
        "referral",
        "naukri",
        "linkedin",
        "resume",
    }
    assert set(colors["activity_category"]) == set(EXPECTED_CATEGORIES)

    for group in colors.values():
        for token in group.values():
            assert set(token) == {"bg", "text", "name"}
            assert token["bg"].startswith("#") and len(token["bg"]) == 7
            assert token["text"].startswith("#") and len(token["text"]) == 7

    assert colors["application_status"]["new"] == {
        "bg": "#EEF1F5",
        "text": "#3B4452",
        "name": "slate",
    }
    assert colors["candidate_source"]["linkedin"]["text"] == "#0A66C2"
    assert colors["activity_category"]["decision"]["name"] == "rose"


def test_status_order_and_groups(payload):
    assert payload["status_order"] == EXPECTED_STATUS_ORDER
    assert payload["status_groups"] == {
        "active": EXPECTED_STATUS_ORDER[:15],
        "tray": ["rejected", "withdrawn", "on_hold"],
        "terminal": ["onboarded"],
    }
    assert payload["status_entry_category"] == dict(enums.STATUS_ENTRY_CATEGORY)
    assert payload["status_entry_category"]["new"] == "candidate_search"
    assert payload["status_entry_category"]["on_hold"] == "decision"


def test_kanban_columns_tray_and_status_mapping(payload):
    kanban = payload["kanban"]
    assert set(kanban) == {"columns", "tray", "status_to_column"}

    columns = kanban["columns"]
    assert [c["key"] for c in columns] == [
        "new",
        "shortlisted",
        "contacted",
        "screening",
        "interview",
        "selected",
        "offer",
        "onboarding",
    ]
    for column in columns:
        assert set(column) == {"key", "label", "statuses", "entry_status"}
        assert column["entry_status"] in column["statuses"]
    assert columns[0] == {
        "key": "new",
        "label": "New",
        "statuses": ["new", "hr_review"],
        "entry_status": "new",
    }
    assert columns[4]["statuses"] == [
        "interview_scheduled",
        "technical_interview",
        "hr_interview",
        "final_interview",
    ]
    assert columns[6]["entry_status"] == "offer_sent"

    assert kanban["tray"] == {
        "label": "Rejected / On hold",
        "statuses": ["rejected", "withdrawn", "on_hold"],
    }

    mapping = kanban["status_to_column"]
    assert set(mapping) == set(EXPECTED_STATUS_ORDER)
    assert mapping["new"] == "new" and mapping["hr_review"] == "new"
    assert mapping["technical_interview"] == "interview"
    assert mapping["rejected"] is None and mapping["on_hold"] is None
