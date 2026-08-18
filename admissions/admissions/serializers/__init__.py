"""Re-exports for the serializers package.

Splitting ``admissions.admissions.serializers`` keeps the import path stable
for views, tests, and mocks of the form::

    from admissions.admissions.serializers import SomeSerializer

Every serializer class previously defined at module level remains importable
from this namespace.
"""

from admissions.admissions.serializers.admissions import (
    AdminAdmissionSerializer,
    AdminCreateUpdateAdmissionSerializer,
    AdmissionListPublicSerializer,
    AdmissionPublicSerializer,
    ManageAdmissionSerializer,
)
from admissions.admissions.serializers.applications import (
    AdminUserApplicationSerializer,
    ApplicationCreateUpdateSerializer,
    CommitteeCandidateSerializer,
    CommitteeMinimalApplicationSerializer,
    InterviewStatusSerializer,
    InterviewStatusUpdateSerializer,
    ShortUserSerializer,
    UserApplicationSerializer,
)
from admissions.admissions.serializers.audit import NameVisibilityAuditEventSerializer
from admissions.admissions.serializers.availability import (
    InterviewAvailabilityParticipantSerializer,
    SaveInterviewAvailabilitySerializer,
)
from admissions.admissions.serializers.groups import (
    AdmissionGroupContentSerializer,
    AdmissionScopedGroupSerializer,
    GroupApplicationSerializer,
    GroupSerializer,
    ManageAdmissionGroupSerializer,
    ShortGroupApplicationSerializer,
    ShortGroupSerializer,
)
from admissions.admissions.serializers.schedule import (
    CandidateSerializer,
    InterviewerSerializer,
    LockedAssignmentSerializer,
    LockedPanelMemberSerializer,
    SavedScheduleSerializer,
    SaveScheduleInputSerializer,
    ScheduleItemSerializer,
    SchedulePanelMemberSerializer,
    ScheduleRequestsSerializer,
)
from admissions.admissions.serializers.solver import (
    ApplySolveJobSerializer,
    SolveJobSerializer,
    SolveOptionsSerializer,
)
from admissions.admissions.serializers.users import UserSerializer

# ``send_message`` was previously imported at the top of ``serializers.py`` and
# relied on by ``ApplicationCreateUpdateSerializer``. Tests patch
# ``admissions.admissions.serializers.send_message``; expose it here so the
# mock path remains valid after the package split.
from admissions.utils.email import send_message

__all__ = [
    "AdminAdmissionSerializer",
    "AdminCreateUpdateAdmissionSerializer",
    "AdminUserApplicationSerializer",
    "AdmissionGroupContentSerializer",
    "AdmissionListPublicSerializer",
    "AdmissionPublicSerializer",
    "AdmissionScopedGroupSerializer",
    "ApplicationCreateUpdateSerializer",
    "ApplySolveJobSerializer",
    "CandidateSerializer",
    "CommitteeCandidateSerializer",
    "CommitteeMinimalApplicationSerializer",
    "GroupApplicationSerializer",
    "GroupSerializer",
    "InterviewAvailabilityParticipantSerializer",
    "InterviewerSerializer",
    "InterviewStatusSerializer",
    "InterviewStatusUpdateSerializer",
    "LockedAssignmentSerializer",
    "LockedPanelMemberSerializer",
    "ManageAdmissionGroupSerializer",
    "ManageAdmissionSerializer",
    "NameVisibilityAuditEventSerializer",
    "SaveInterviewAvailabilitySerializer",
    "SaveScheduleInputSerializer",
    "SavedScheduleSerializer",
    "ScheduleItemSerializer",
    "SchedulePanelMemberSerializer",
    "ScheduleRequestsSerializer",
    "ShortGroupApplicationSerializer",
    "ShortGroupSerializer",
    "ShortUserSerializer",
    "SolveJobSerializer",
    "SolveOptionsSerializer",
    "UserApplicationSerializer",
    "UserSerializer",
    "send_message",
]
