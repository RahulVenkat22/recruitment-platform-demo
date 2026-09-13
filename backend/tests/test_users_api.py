"""GET /api/v1/users/ and /users/{id}/ (plan.md 6.10 Users rows): compact rows for
the people picker with search, role and department filters; admin-only PATCH of
role and is_active."""

from __future__ import annotations

import uuid

import pytest
from django.urls import reverse
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from common.enums import UserRole

pytestmark = pytest.mark.django_db

USERS = "/api/v1/users/"

ROW_KEYS = {
    "id",
    "full_name",
    "first_name",
    "last_name",
    "email",
    "designation",
    "department",
    "role",
    "avatar_url",
    "initials",
    "is_active",
}


@pytest.fixture
def people(user_factory) -> dict:
    return {
        "rahul": user_factory(
            email="rahul@aimious.demo",
            first_name="Rahul",
            last_name="Venkat",
            role=UserRole.HR_ADMIN,
            designation="HR Manager",
            department="Human Resources",
        ),
        "priya": user_factory(
            email="priya@aimious.demo",
            first_name="Priya",
            last_name="Sharma",
            role=UserRole.HR,
            designation="HR Executive",
            department="Human Resources",
        ),
        "arun": user_factory(
            email="arun@aimious.demo",
            first_name="Arun",
            last_name="Kumar",
            role=UserRole.INTERVIEWER,
            designation="Engineering Manager",
            department="Engineering",
            avatar_url="https://cdn.example.com/arun.png",
        ),
        "vikram": user_factory(
            email="vikram@aimious.demo",
            first_name="Vikram",
            last_name="Shah",
            role=UserRole.EMPLOYEE,
            designation="Product Manager",
            department="Product",
        ),
    }


@pytest.fixture
def as_admin(api_client, people):
    api_client.force_authenticate(user=people["rahul"])
    return api_client


@pytest.fixture
def as_hr(api_client, people):
    api_client.force_authenticate(user=people["priya"])
    return api_client


def names(response) -> list[str]:
    return [row["full_name"] for row in response.json()["results"]]


def test_urls_are_named(people):
    assert reverse("api-v1:user-list") == USERS
    assert reverse("api-v1:user-detail", args=[people["arun"].id]) == f"{USERS}{people['arun'].id}/"


def test_list_requires_authentication(api_client, people):
    response = api_client.get(USERS)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_list_returns_compact_rows_ordered_by_name(as_hr, people):
    response = as_hr.get(USERS)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"count", "next", "previous", "results"}
    assert body["count"] == 4
    assert names(response) == ["Arun Kumar", "Priya Sharma", "Rahul Venkat", "Vikram Shah"]
    arun = body["results"][0]
    assert set(arun) == ROW_KEYS
    assert arun == {
        "id": str(people["arun"].id),
        "full_name": "Arun Kumar",
        "first_name": "Arun",
        "last_name": "Kumar",
        "email": "arun@aimious.demo",
        "designation": "Engineering Manager",
        "department": "Engineering",
        "role": "interviewer",
        "avatar_url": "https://cdn.example.com/arun.png",
        "initials": "AK",
        "is_active": True,
    }


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("pri", ["Priya Sharma"]),
        ("kumar", ["Arun Kumar"]),
        ("vikram@", ["Vikram Shah"]),
        ("manager", ["Arun Kumar", "Rahul Venkat", "Vikram Shah"]),
        ("zzz", []),
    ],
)
def test_search_covers_name_email_and_designation(as_hr, people, query, expected):
    response = as_hr.get(USERS, {"search": query})

    assert names(response) == expected


def test_filter_by_role_and_department(as_hr, people):
    assert names(as_hr.get(USERS, {"role": "hr"})) == ["Priya Sharma"]
    assert names(as_hr.get(USERS, {"department": "human resources"})) == [
        "Priya Sharma",
        "Rahul Venkat",
    ]
    assert names(as_hr.get(USERS, {"role": "interviewer", "department": "Engineering"})) == [
        "Arun Kumar"
    ]


def test_unknown_role_filter_is_a_validation_error(as_hr, people):
    response = as_hr.get(USERS, {"role": "ceo"})

    assert response.status_code == 400
    assert "role" in response.json()["error"]["details"]


def test_filter_by_is_active(as_hr, people):
    people["vikram"].is_active = False
    people["vikram"].save()

    assert "Vikram Shah" in names(as_hr.get(USERS))
    assert names(as_hr.get(USERS, {"is_active": "false"})) == ["Vikram Shah"]
    assert "Vikram Shah" not in names(as_hr.get(USERS, {"is_active": "true"}))


def test_ordering_by_name_and_other_columns(as_hr, people):
    assert names(as_hr.get(USERS, {"ordering": "-name"})) == [
        "Vikram Shah",
        "Rahul Venkat",
        "Priya Sharma",
        "Arun Kumar",
    ]
    assert names(as_hr.get(USERS, {"ordering": "department,name"}))[:2] == [
        "Arun Kumar",
        "Priya Sharma",
    ]
    assert names(as_hr.get(USERS, {"ordering": "email"}))[0] == "Arun Kumar"


def test_page_size_defaults_to_twenty_and_is_adjustable(as_hr, people, user_factory):
    for index in range(20):
        user_factory(first_name="Zed", last_name=f"{index:02d}")

    default = as_hr.get(USERS).json()
    assert default["count"] == 24
    assert len(default["results"]) == 20
    assert default["next"]

    small = as_hr.get(USERS, {"page_size": 5, "page": 2}).json()
    assert len(small["results"]) == 5
    assert small["previous"]


def test_retrieve_returns_the_full_profile(as_hr, people):
    response = as_hr.get(f"{USERS}{people['arun'].id}/")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(people["arun"].id)
    assert body["full_name"] == "Arun Kumar"
    assert body["role"] == "interviewer"
    assert body["timezone"] == "Asia/Kolkata"
    assert "password" not in body


def test_retrieve_unknown_user_is_404(as_hr, people):
    response = as_hr.get(f"{USERS}{uuid.uuid4()}/")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_patch_is_admin_only(as_hr, people):
    response = as_hr.patch(f"{USERS}{people['vikram'].id}/", {"role": "hr"})

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "permission_denied"
    people["vikram"].refresh_from_db()
    assert people["vikram"].role == UserRole.EMPLOYEE


def test_admin_can_change_role_and_deactivate(as_admin, people):
    vikram = people["vikram"]
    refresh = RefreshToken.for_user(vikram)

    response = as_admin.patch(f"{USERS}{vikram.id}/", {"role": "hr", "is_active": False})

    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "hr" and body["is_active"] is False
    assert body["full_name"] == "Vikram Shah"
    vikram.refresh_from_db()
    assert vikram.role == UserRole.HR and not vikram.is_active
    # Deactivation signs the user out everywhere.
    assert BlacklistedToken.objects.filter(token__jti=refresh["jti"]).exists()


def test_admin_patch_ignores_other_fields(as_admin, people):
    vikram = people["vikram"]

    response = as_admin.patch(
        f"{USERS}{vikram.id}/", {"email": "new@aimious.demo", "first_name": "X", "role": "hr"}
    )

    assert response.status_code == 200
    vikram.refresh_from_db()
    assert vikram.email == "vikram@aimious.demo"
    assert vikram.first_name == "Vikram"
    assert vikram.role == UserRole.HR


def test_admin_cannot_demote_or_deactivate_themselves(as_admin, people):
    url = f"{USERS}{people['rahul'].id}/"

    assert as_admin.patch(url, {"role": "hr"}).status_code == 400
    assert as_admin.patch(url, {"is_active": False}).status_code == 400
    # Re-asserting the current values is harmless.
    assert as_admin.patch(url, {"role": "hr_admin", "is_active": True}).status_code == 200
    people["rahul"].refresh_from_db()
    assert people["rahul"].role == UserRole.HR_ADMIN and people["rahul"].is_active


def test_invalid_role_value_is_a_validation_error(as_admin, people):
    response = as_admin.patch(f"{USERS}{people['vikram'].id}/", {"role": "ceo"})

    assert response.status_code == 400
    assert "role" in response.json()["error"]["details"]


def test_reactivating_does_not_blacklist_anything(as_admin, people):
    vikram = people["vikram"]
    vikram.is_active = False
    vikram.save()
    RefreshToken.for_user(vikram)

    response = as_admin.patch(f"{USERS}{vikram.id}/", {"is_active": True})

    assert response.status_code == 200
    assert OutstandingToken.objects.filter(user=vikram).count() == 1
    assert not BlacklistedToken.objects.filter(token__user=vikram).exists()


def test_put_post_and_delete_are_not_allowed(as_admin, people):
    url = f"{USERS}{people['vikram'].id}/"

    assert as_admin.put(url, {"role": "hr"}).status_code == 405
    assert as_admin.delete(url).status_code == 405
    assert as_admin.post(USERS, {"email": "x@aimious.demo"}).status_code == 405
