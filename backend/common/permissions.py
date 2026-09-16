"""Role and object-level authorisation: the plan.md 6.9 matrix as pure predicates
plus the DRF permission classes that call them.

Every later phase asks these functions instead of re-deriving the rules::

    Capability                      hr_admin  hr                           interviewer  employee
    See a JD                        all       own + participating          participant  participant
    Edit/archive/duplicate, people  yes       creator or owner participant no           no
    Create JD                       yes       yes                          no           no
    Delete JD                       yes       creator only                 no           no
    Force close JD                  yes       creator or owner participant no           no
    Comment on a JD timeline        yes       when the JD is visible       no           no
    Search, transition, contact,    yes       creator or any participant   no           no
      schedule interview
    Submit interview feedback       yes       when the JD is visible       if assigned  no
    Manage offers and onboarding    yes       creator, owner or recruiter  no           no
    See candidate phone and email   yes       yes                          masked       masked
    Dashboard                       full      scoped to visible JDs        scoped       scoped

Predicates take the user first and a ``JobDescription`` second; the DRF
classes accept any object that leads to a JD (``Application``, ``Interview``,
``Offer``, ``RecruitmentParticipant`` ...) through ``job_description_of``.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any

from django.db.models import Q, QuerySet
from rest_framework.permissions import SAFE_METHODS, BasePermission

from common.enums import ParticipantRole, UserRole
from common.masking import should_mask_pii
from jobs.models import JobDescription

Predicate = Callable[[Any, JobDescription], bool]

# Participant roles that may manage offers and onboarding for a JD.
MANAGING_PARTICIPANT_ROLES: frozenset[str] = frozenset(
    {ParticipantRole.OWNER, ParticipantRole.RECRUITER}
)

# ------------------------------------------------------------------ role helpers


def role_of(user: Any) -> str | None:
    """The user's role key, or ``None`` for anonymous / missing users."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    return getattr(user, "role", None)


def has_role(user: Any, *roles: str) -> bool:
    return role_of(user) in roles


def is_hr_admin(user: Any) -> bool:
    return has_role(user, UserRole.HR_ADMIN)


def is_hr(user: Any) -> bool:
    return has_role(user, UserRole.HR)


def is_hr_staff(user: Any) -> bool:
    """HR admin or HR: the roles that run recruitment."""
    return has_role(user, UserRole.HR_ADMIN, UserRole.HR)


def is_interviewer(user: Any) -> bool:
    return has_role(user, UserRole.INTERVIEWER)


def is_employee(user: Any) -> bool:
    return has_role(user, UserRole.EMPLOYEE)


# ------------------------------------------------------------- JD relationships


def job_description_of(obj: Any) -> JobDescription | None:
    """Walk ``obj`` to its JD: a JD itself, ``.job_description`` or ``.application``."""
    if isinstance(obj, JobDescription):
        return obj
    for attribute in ("job_description", "application"):
        related = getattr(obj, attribute, None)
        if related is not None:
            return job_description_of(related)
    return None


def is_creator(user: Any, jd: JobDescription) -> bool:
    return role_of(user) is not None and jd.created_by_id == user.id


def participant_role(user: Any, jd: JobDescription) -> str | None:
    """The user's ``role_in_recruitment`` on ``jd``, or ``None``.

    Uses ``prefetch_related("participants")`` rows when present, so list
    endpoints can check many JDs without a query per row.
    """
    if role_of(user) is None:
        return None
    prefetched = getattr(jd, "_prefetched_objects_cache", {})
    if "participants" in prefetched:
        for participant in prefetched["participants"]:
            if participant.user_id == user.id:
                return participant.role_in_recruitment
        return None
    return (
        jd.participants.filter(user_id=user.id)
        .values_list("role_in_recruitment", flat=True)
        .first()
    )


def is_participant(user: Any, jd: JobDescription, roles: Iterable[str] | None = None) -> bool:
    """Listed under "People Involved" for ``jd`` (optionally with one of ``roles``)."""
    role = participant_role(user, jd)
    if role is None:
        return False
    return roles is None or role in set(roles)


def is_involved(user: Any, jd: JobDescription) -> bool:
    """Creator or participant of any role."""
    return is_creator(user, jd) or is_participant(user, jd)


# ----------------------------------------------------------- matrix predicates


def visible_job_descriptions_for(user: Any) -> QuerySet[JobDescription]:
    """JDs the user may see: all for hr_admin, otherwise created or participating."""
    if role_of(user) is None:
        return JobDescription.objects.none()
    if is_hr_admin(user):
        return JobDescription.objects.all()
    return JobDescription.objects.filter(
        Q(created_by_id=user.id) | Q(participants__user_id=user.id)
    ).distinct()


def can_view_job(user: Any, jd: JobDescription) -> bool:
    return is_hr_admin(user) or is_involved(user, jd)


def can_create_job(user: Any) -> bool:
    return is_hr_staff(user)


def can_edit_job(user: Any, jd: JobDescription) -> bool:
    """Edit content, archive, duplicate, manage participants."""
    if is_hr_admin(user):
        return True
    return is_hr(user) and (
        is_creator(user, jd) or is_participant(user, jd, (ParticipantRole.OWNER,))
    )


def can_archive_job(user: Any, jd: JobDescription) -> bool:
    return can_edit_job(user, jd)


def can_duplicate_job(user: Any, jd: JobDescription) -> bool:
    return can_edit_job(user, jd)


def can_manage_participants(user: Any, jd: JobDescription) -> bool:
    return can_edit_job(user, jd)


def can_delete_job(user: Any, jd: JobDescription) -> bool:
    return is_hr_admin(user) or (is_hr(user) and is_creator(user, jd))


def can_force_close_job(user: Any, jd: JobDescription) -> bool:
    """Close a JD early from any active status: the people who may edit it (Enhancement.md 3)."""
    return can_edit_job(user, jd)


def can_comment_job(user: Any, jd: JobDescription) -> bool:
    """Leave a remark on the JD timeline: HR staff who can see the JD (Enhancement.md 3)."""
    return is_hr_staff(user) and can_view_job(user, jd)


def can_work_pipeline(user: Any, jd: JobDescription) -> bool:
    """Run searches, transition applications, log contact, schedule interviews."""
    return is_hr_admin(user) or (is_hr(user) and is_involved(user, jd))


def can_run_search(user: Any, jd: JobDescription) -> bool:
    return can_work_pipeline(user, jd)


def can_transition_application(user: Any, jd: JobDescription) -> bool:
    return can_work_pipeline(user, jd)


def can_log_contact(user: Any, jd: JobDescription) -> bool:
    return can_work_pipeline(user, jd)


def can_schedule_interview(user: Any, jd: JobDescription) -> bool:
    return can_work_pipeline(user, jd)


def can_manage_job(user: Any, jd: JobDescription) -> bool:
    """Offers and onboarding: hr_admin, the creator, or an owner / recruiter participant."""
    if is_hr_admin(user):
        return True
    return is_hr(user) and (
        is_creator(user, jd) or is_participant(user, jd, MANAGING_PARTICIPANT_ROLES)
    )


def can_manage_offers(user: Any, jd: JobDescription) -> bool:
    return can_manage_job(user, jd)


def can_manage_onboarding(user: Any, jd: JobDescription) -> bool:
    return can_manage_job(user, jd)


def can_submit_feedback(user: Any, interview: Any) -> bool:
    """hr_admin always; hr when the JD is visible to them; the assigned interviewer."""
    if is_hr_admin(user):
        return True
    if is_hr(user):
        jd = job_description_of(interview)
        return jd is not None and can_view_job(user, jd)
    if is_interviewer(user):
        return getattr(interview, "interviewer_id", None) == user.id
    return False


def can_view_candidate_contact(user: Any) -> bool:
    """Unmasked candidate phone and email (the inverse of ``common.masking``)."""
    return not should_mask_pii(user)


def has_full_dashboard(user: Any) -> bool:
    """Full dashboard for hr_admin; everyone else is scoped to ``visible_job_descriptions_for``."""
    return is_hr_admin(user)


# ------------------------------------------------------------- DRF permissions


class _RolePermission(BasePermission):
    """``has_permission`` passes for authenticated users with one of ``roles``."""

    roles: tuple[str, ...] = ()
    message = "You do not have permission to perform this action."

    def has_permission(self, request, view) -> bool:
        return has_role(request.user, *self.roles)


class IsHrAdmin(_RolePermission):
    roles = (UserRole.HR_ADMIN,)


class IsHrStaff(_RolePermission):
    roles = (UserRole.HR_ADMIN, UserRole.HR)


class IsInterviewer(_RolePermission):
    roles = (UserRole.INTERVIEWER,)


class CanCreateJob(BasePermission):
    def has_permission(self, request, view) -> bool:
        return can_create_job(request.user)


class _JobObjectPermission(BasePermission):
    """Object-level check through a matrix predicate; the object may be a JD or
    anything that ``job_description_of`` can walk to one."""

    predicate: Predicate

    def has_permission(self, request, view) -> bool:
        return role_of(request.user) is not None

    def has_object_permission(self, request, view, obj) -> bool:
        jd = job_description_of(obj)
        if jd is None:
            return False
        return type(self).predicate(request.user, jd)


class CanViewJob(_JobObjectPermission):
    predicate = staticmethod(can_view_job)


class CanEditJob(_JobObjectPermission):
    predicate = staticmethod(can_edit_job)


class CanDeleteJob(_JobObjectPermission):
    predicate = staticmethod(can_delete_job)


class CanManageJob(_JobObjectPermission):
    predicate = staticmethod(can_manage_job)


class CanWorkPipeline(_JobObjectPermission):
    """Search, transition, log contact, schedule: the "participant of the JD" row."""

    predicate = staticmethod(can_work_pipeline)


class CanSubmitFeedback(BasePermission):
    def has_permission(self, request, view) -> bool:
        return role_of(request.user) is not None

    def has_object_permission(self, request, view, obj) -> bool:
        return can_submit_feedback(request.user, obj)


class JobDescriptionAccess(BasePermission):
    """One class for a JD viewset: read needs visibility, POST needs create
    rights, PATCH/PUT need edit rights, DELETE needs delete rights."""

    def has_permission(self, request, view) -> bool:
        if role_of(request.user) is None:
            return False
        if request.method == "POST":
            return can_create_job(request.user)
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        jd = job_description_of(obj)
        if jd is None:
            return False
        if request.method in SAFE_METHODS:
            return can_view_job(request.user, jd)
        if request.method == "DELETE":
            return can_delete_job(request.user, jd)
        return can_edit_job(request.user, jd)
