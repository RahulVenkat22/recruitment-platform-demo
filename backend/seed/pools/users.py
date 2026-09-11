"""The ten demo users from plan.md section 10 (and section 18 "Demo accounts")."""

from __future__ import annotations

from dataclasses import dataclass

from seed.pools.people import portrait_url

PASSWORD = "Demo@1234"
EMAIL_DOMAIN = "aimious.demo"

RAHUL = "rahul@aimious.demo"
PRIYA = "priya@aimious.demo"
KARTHIK = "karthik@aimious.demo"
ANITHA = "anitha@aimious.demo"
ARUN = "arun@aimious.demo"
DIVYA = "divya@aimious.demo"
SURESH = "suresh@aimious.demo"
NISHA = "nisha@aimious.demo"
VIKRAM = "vikram@aimious.demo"
LAKSHMI = "lakshmi@aimious.demo"


@dataclass(frozen=True)
class DemoUser:
    first_name: str
    last_name: str
    email: str
    role: str  # accounts.User.role key: hr_admin | hr | interviewer | employee
    designation: str
    department: str
    gender: str  # "male" | "female"; picks the portrait folder
    avatar_url: str | None  # None exercises the initials fallback
    phone: str

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


USERS: tuple[DemoUser, ...] = (
    DemoUser(
        "Rahul", "Venkat", RAHUL, "hr_admin", "HR Manager", "Human Resources",
        "male", portrait_url("male", 32), "+91 98400 11001",
    ),
    DemoUser(
        "Priya", "Sharma", PRIYA, "hr", "HR Executive", "Human Resources",
        "female", portrait_url("female", 44), "+91 98400 11002",
    ),
    DemoUser(
        "Karthik", "Iyer", KARTHIK, "hr", "Talent Acquisition Specialist", "Human Resources",
        "male", portrait_url("male", 45), "+91 98400 11003",
    ),
    DemoUser(
        "Anitha", "Rajan", ANITHA, "hr", "HR Business Partner", "Human Resources",
        "female", portrait_url("female", 21), "+91 98400 11004",
    ),
    DemoUser(
        "Arun", "Kumar", ARUN, "interviewer", "Engineering Manager", "Engineering",
        "male", portrait_url("male", 12), "+91 98400 11005",
    ),
    DemoUser(
        "Divya", "Raman", DIVYA, "interviewer", "Senior Software Engineer", "Engineering",
        "female", portrait_url("female", 65), "+91 98400 11006",
    ),
    DemoUser(
        "Suresh", "Menon", SURESH, "interviewer", "Lead Data Scientist", "Data",
        "male", portrait_url("male", 68), "+91 98400 11007",
    ),
    DemoUser(
        "Nisha", "Patel", NISHA, "interviewer", "DevOps Lead", "Platform",
        "female", portrait_url("female", 9), "+91 98400 11008",
    ),
    DemoUser(
        "Vikram", "Shah", VIKRAM, "employee", "Product Manager", "Product",
        "male", None, "+91 98400 11009",
    ),
    DemoUser(
        "Lakshmi", "Narayanan", LAKSHMI, "employee", "Frontend Lead", "Engineering",
        "female", portrait_url("female", 57), "+91 98400 11010",
    ),
)  # fmt: skip

USERS_BY_EMAIL: dict[str, DemoUser] = {user.email: user for user in USERS}
