"""Seed a realistic local interview-scheduling run.

The static fixtures only put three candidates on one committee with a single
interviewer, which is not enough to exercise the solver, plan editing,
conflict review, or publication. This command creates a real, saveable
scenario in the local database:

  * N candidates apply to the committee (real UserApplication rows),
  * M committee interviewers get memberships and submitted availability
    (participation, experience levels, slots, a few conflicts),
  * the SavedSchedule framework (windows, slots, panel size) is created.

Everything created here is real data, so the full flow works locally — run
the solver, edit the plan, save edits, review, publish — unlike the
frontend-only mock tool, whose fictitious interviewers can never be saved.

Idempotent: re-running deletes the rows the previous run created (identified
by their username prefixes) and rebuilds the framework.

``--adopt-lego`` closes the identity gap: instead of inventing people, the
seed reuses the real LEGO users already mirrored into the local database
(lego_id below the invented range, which only happens through OAuth login or
``sync_committee_rosters``). Committee members are adopted as interviewers,
everyone else as candidates, and identities are invented only for whatever
is still missing — so the people you log in as via LEGO OAuth are the same
rows the schedule runs on.

Development-only: refuses to run unless ALLOW_DEVELOPMENT_INITIALIZATION is
enabled by the settings module.
"""

import random
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from admissions.admissions.models import (
    Admission,
    CommitteeRosterEntry,
    Group,
    GroupApplication,
    InterviewAvailability,
    LegoUser,
    Membership,
    SavedSchedule,
    UserApplication,
)
from admissions.admissions.schedule_layout import build_standard_slot_blocks
from admissions.admissions.scheduling_utils import (
    availability_submission_is_current,
    conflict_review_scope,
    get_committee_interviewer_ids,
    get_conflict_review_readiness,
    get_interviewer_participation,
    get_proposed_candidate_ids_by_interviewer,
)

CANDIDATE_PREFIX = "dev-kandidat"
INTERVIEWER_PREFIX = "dev-intervjuer"
# lego_id is unique and non-null; these ranges are far from the fixture ids.
# Anything below CANDIDATE_LEGO_ID_BASE is a real LEGO identity that arrived
# via OAuth login or the LEGO roster sync, never from this command.
CANDIDATE_LEGO_ID_BASE = 100_000
INTERVIEWER_LEGO_ID_BASE = 200_000
# The fixture administrator is seeded separately (_seed_admin_availability)
# and should never double as an adopted candidate or interviewer.
ADMIN_USERNAME = "webkom"

FEMALE_FIRST_NAMES = [
    "Anna",
    "Ingrid",
    "Sofie",
    "Emma",
    "Maja",
    "Nora",
    "Kari",
    "Maria",
    "Tuva",
    "Thea",
]
MALE_FIRST_NAMES = [
    "Ola",
    "Erik",
    "Morten",
    "Lars",
    "Henrik",
    "Jonas",
    "Andreas",
    "Per",
    "Sander",
    "Even",
]
LAST_NAMES = [
    "Hansen",
    "Johansen",
    "Olsen",
    "Larsen",
    "Andersen",
    "Nilsen",
    "Berg",
    "Dahl",
    "Kristiansen",
    "Moe",
]


def _build_name(index: int, gender: str) -> tuple[str, str]:
    first_pool = FEMALE_FIRST_NAMES if gender == "female" else MALE_FIRST_NAMES
    return (
        first_pool[index % len(first_pool)],
        LAST_NAMES[(index // len(first_pool)) % len(LAST_NAMES)],
    )


class Command(BaseCommand):
    help = (
        "Seed a realistic local interview-scheduling run: many candidates "
        "applying to one committee plus interviewers with availability."
    )

    def add_arguments(self, parser):
        parser.add_argument("--candidates", type=int, default=40)
        parser.add_argument("--interviewers", type=int, default=10)
        parser.add_argument("--admission", default="webkom-open")
        parser.add_argument("--group", default="Webkom")
        parser.add_argument(
            "--fill-availability",
            action="store_true",
            default=False,
            help=(
                "Fill availability for every committee roster member against "
                "the existing framework, without rebuilding it. The standard "
                "seeder bumps the framework's availability_generation, which "
                "invalidates any slots a member submitted by hand - this flag "
                "just stamps existing rows against the current generation so "
                "the publish gate stops complaining about 'Mangler svar'. "
                "Use after you've shaped the framework the way you want and "
                "just need committee answers to make the gate pass."
            ),
        )
        parser.add_argument(
            "--password",
            default="",
            help="Give every seeded user (and the webkom admin) this local "
            "password so you can log in as any of them via /api-auth/login/ "
            "and go through the real member flow.",
        )
        parser.add_argument(
            "--answer-all",
            action="store_true",
            default=False,
            help="Also fill in availability for every committee roster member "
            "who has not answered yet (leftover local users included), so the "
            "plan draft opens immediately.",
        )
        parser.add_argument(
            "--complete-reviews",
            action="store_true",
            default=False,
            help="Do not re-seed anything: just mark every participating "
            "interviewer's kandidatkontroll (inhabilitetssjekk) as done for the "
            "committee's current saved plan, so publication stops waiting on "
            "the fake interviewers. Each interviewer's reviewed candidates are "
            "set to the candidates proposed for their panels (existing "
            "declared conflicts are kept). Run this after solving a plan.",
        )
        parser.add_argument(
            "--adopt-lego",
            action="store_true",
            default=False,
            help="Reuse the real LEGO users already mirrored into the local "
            "database (lego_id below the invented seed range) instead of "
            "inventing people: committee members become interviewers, other "
            "real users become candidates, and identities are invented only "
            "for what is still missing. Run LEGO's initialize_development "
            "and admissions' sync_committee_rosters first so those people "
            "exist.",
        )

    def handle(self, *args, **options):
        if not getattr(settings, "ALLOW_DEVELOPMENT_INITIALIZATION", False):
            raise CommandError(
                "Local schedule seeding is disabled by this settings module "
                "(ALLOW_DEVELOPMENT_INITIALIZATION must be enabled)."
            )
        candidate_count = options["candidates"]
        interviewer_count = options["interviewers"]
        if candidate_count < 1 or candidate_count > 500:
            raise CommandError("--candidates must be between 1 and 500.")
        if interviewer_count < 1 or interviewer_count > 100:
            raise CommandError("--interviewers must be between 1 and 100.")

        admission = Admission.objects.filter(slug=options["admission"]).first()
        if admission is None:
            raise CommandError(
                f"Admission '{options['admission']}' does not exist. "
                "Load the development fixtures first (make initialize_development)."
            )
        group = Group.objects.filter(name=options["group"]).first()
        if group is None:
            raise CommandError(
                f"Group '{options['group']}' does not exist. Load the development "
                "fixtures first."
            )
        if not admission.groups.filter(pk=group.pk).exists():
            raise CommandError(
                f"Group '{group.name}' is not part of admission '{admission.slug}'."
            )

        if options["complete_reviews"]:
            with transaction.atomic():
                self._complete_reviews(admission, group)
            return

        if options["fill_availability"]:
            # The dev user has shaped the framework the way they want
            # (dates, blocks, slots). The standard seeder would rebuild
            # it and bump the generation, which is exactly what they
            # don't want - any row stamped against the prior generation
            # shows up as "Mangler svar" in the publish gate. This path
            # finds the latest saved schedule, stamps every committee
            # member's row against its current generation, and leaves
            # everything else alone.
            saved = (
                SavedSchedule.objects.filter(admission=admission, group=group)
                .order_by("-availability_generation")
                .first()
            )
            if saved is None:
                raise CommandError(
                    f"No saved schedule for {group.name} in {admission.slug} - "
                    "run the full seeder once first to create the framework."
                )
            with transaction.atomic():
                filled = self._answer_all_remaining(
                    admission, group, saved, preserve_slots=True
                )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Stamped {filled} committee row(s) against the current "
                    f"availability generation ({saved.availability_generation}) "
                    f"for {group.name} / {admission.slug}. Framework untouched."
                )
            )
            return

        with transaction.atomic():
            self._cleanup_previous_seed(admission, group, options["adopt_lego"])
            saved = self._ensure_framework(admission, group)
            adoptable = self._adoptable_users(group) if options["adopt_lego"] else []
            # Committee members are the interviewers, everyone else the
            # candidates; a real person never plays both parts in one run.
            committee_ids = self._committee_user_ids(group)
            interviewer_pool = [
                user
                for user in adoptable
                if user.id in committee_ids and user.username != ADMIN_USERNAME
            ][:interviewer_count]
            used_interviewer_ids = {user.id for user in interviewer_pool}
            candidate_pool = [
                user
                for user in adoptable
                if user.id not in used_interviewer_ids
                and user.username != ADMIN_USERNAME
            ][:candidate_count]

            candidates = self._create_candidates(
                admission, group, candidate_count, candidate_pool
            )
            self._create_interviewers(
                admission,
                group,
                saved,
                interviewer_count,
                candidates,
                interviewer_pool,
            )
            self._seed_admin_availability(admission, group, saved)
            answered_remaining = 0
            if options["answer_all"]:
                answered_remaining = self._answer_all_remaining(admission, group, saved)
            if options["password"]:
                self._set_passwords(
                    options["password"], interviewer_pool + candidate_pool
                )

        adopted = len(interviewer_pool) + len(candidate_pool)
        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {candidate_count} candidates and {interviewer_count} "
                f"interviewers for {group.name} in {admission.slug}. "
                f"Framework: {saved.start_date} -> {saved.end_date}."
            )
        )
        if options["adopt_lego"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Adopted {adopted} existing LEGO user(s); invented the "
                    "rest. Log in as the adopted users via LEGO OAuth - they "
                    "are the same rows this schedule runs on."
                )
            )
        if options["answer_all"]:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Filled in availability for {answered_remaining} remaining "
                    "roster interviewer(s) (--answer-all)."
                )
            )
        if options["password"]:
            self.stdout.write(
                self.style.SUCCESS(
                    "Local password set: "
                    f"{options['password']} (log in at /api-auth/login/ as e.g. "
                    "dev-intervjuer-1)."
                )
            )

    def _cleanup_previous_seed(self, admission, group, adopt_lego):
        users = LegoUser.objects.filter(
            username__startswith=f"{CANDIDATE_PREFIX}-"
        ) | LegoUser.objects.filter(username__startswith=f"{INTERVIEWER_PREFIX}-")
        InterviewAvailability.objects.filter(user__in=users).delete()
        Membership.objects.filter(user__in=users).delete()
        UserApplication.objects.filter(user__in=users).delete()
        users.delete()
        if adopt_lego:
            # Seed-created rows for adopted real LEGO users: never delete the
            # people, only what this command wrote for them in this run's scope.
            adopted = LegoUser.objects.filter(
                lego_id__lt=CANDIDATE_LEGO_ID_BASE, is_active=True
            )
            InterviewAvailability.objects.filter(
                admission=admission, group=group, user__in=adopted
            ).delete()
            UserApplication.objects.filter(
                user__in=adopted,
                text="Søknad generert av seed_local_schedule.",
            ).delete()

    def _adoptable_users(self, group):
        """Real LEGO people already mirrored into the local database.

        lego_id below the invented seed range means the row came from LEGO -
        OAuth login or the roster sync - never from this command. Ordering by
        lego_id keeps adoption deterministic across re-runs.
        """
        return list(
            LegoUser.objects.filter(
                lego_id__lt=CANDIDATE_LEGO_ID_BASE, is_active=True
            ).order_by("lego_id")
        )

    @staticmethod
    def _committee_user_ids(group):
        member_ids = set(
            Membership.objects.filter(group=group).values_list("user_id", flat=True)
        )
        roster_ids = set(
            CommitteeRosterEntry.objects.filter(group=group).values_list(
                "user_id", flat=True
            )
        )
        return member_ids | roster_ids

    def _ensure_framework(self, admission, group, candidate_count=40):
        start_date = timezone.localdate() + timedelta(days=7)
        day_start_minute = 8 * 60
        day_end_minute = 14 * 60
        session_duration = 30
        # 3 blocks/day × 4 sessions/block × 5 days = 60 interview slots.
        # 30-min sessions, 2h per block, 6h days. 40 candidates fit with
        # headroom (20 spare slots for swaps, repairs, late applicants).
        # Cap at 5 days (a clean interview week); the day-end window is
        # the pressure valve if the pool outgrows this.
        days = 5
        end_date = start_date + timedelta(days=days - 1)
        slot_keys = []
        windows = []
        for day_offset in range(days):
            day = start_date + timedelta(days=day_offset)
            windows.append(
                {
                    "date": day.isoformat(),
                    "start_minute": day_start_minute,
                    "end_minute": day_end_minute,
                }
            )
            for minute in range(day_start_minute, day_end_minute, session_duration):
                slot_keys.append(f"{day.isoformat()}|{minute}")
        saved, _ = SavedSchedule.objects.update_or_create(
            admission=admission,
            group=group,
            defaults={
                "schedule": [],
                "start_date": start_date,
                "end_date": end_date,
                "session_duration": session_duration,
                "enabled_windows": windows,
                "enabled_slots": slot_keys,
                "day_start_minute": day_start_minute,
                "day_end_minute": day_end_minute,
                "chunk_size": 4,
                "chunk_break_minutes": 0,
                "block_mode": SavedSchedule.BLOCK_MODE_STANDARD,
                "resolved_blocks": [],
                "layout_version": 2,
                "slot_overrides": [],
                "availability_generation": 1,
                "panel_size": 4,
                "solver_options": {
                    "policy_version": 2,
                    "panel_stability": "preferred",
                    "availability_fallback": "stop",
                    "initial_strategy": "balanced",
                },
                # is_distributed is generated from distributed_through.
                "distributed_through": None,
                "conflict_review_open": False,
                "name_visibility": SavedSchedule.NAME_VISIBILITY_COMMITTEE,
            },
        )
        return saved

    def _create_candidates(self, admission, group, count, adoptable=None):
        pool = list(adoptable or [])
        applications = []
        for i in range(1, count + 1):
            if pool:
                user = pool.pop(0)
            else:
                gender = "female" if i % 2 == 0 else "male"
                first, last = _build_name(i, gender)
                user, _ = LegoUser.objects.get_or_create(
                    username=f"{CANDIDATE_PREFIX}-{i}",
                    defaults={
                        "first_name": first,
                        "last_name": last,
                        "email": f"{CANDIDATE_PREFIX}-{i}@example.test",
                        "password": "!",
                        "is_active": True,
                        "gender": gender,
                        "lego_id": CANDIDATE_LEGO_ID_BASE + i,
                    },
                )
            application, _ = UserApplication.objects.update_or_create(
                admission=admission,
                user=user,
                defaults={
                    "text": "Søknad generert av seed_local_schedule.",
                    "phone_number": "40000000",
                    "header_fields_response": {},
                },
            )
            GroupApplication.objects.update_or_create(
                application=application,
                group=group,
                defaults={"text": "Søknad generert av seed_local_schedule."},
            )
            applications.append(application)
        # Candidate index feeds conflict draws below; keep a stable order.
        return sorted(applications, key=lambda app: str(app.user_id))

    def _create_interviewers(
        self, admission, group, saved, count, candidates, adoptable=None
    ):
        rng = random.Random(4321)
        candidate_ids = [str(app.pk) for app in candidates]
        # A candidate conflicted by too many interviewers can never get a full
        # panel. Keep the draws feasible: nobody is biased against by more
        # than two people, so with the default panel size (4) and interviewer
        # count there is always an eligible panel.
        conflict_counts = {candidate_id: 0 for candidate_id in candidate_ids}
        pool = list(adoptable or [])
        interviewers = []
        for i in range(1, count + 1):
            if pool:
                user = pool.pop(0)
                # A real LEGO person adopted into the run gets the membership
                # that places them in the committee; roster-synced rows have
                # none until they sign in.
                Membership.objects.get_or_create(
                    user=user, group=group, defaults={"role": "member"}
                )
            else:
                gender = "female" if i % 2 == 0 else "male"
                first, last = _build_name(i + 50, gender)
                user, _ = LegoUser.objects.get_or_create(
                    username=f"{INTERVIEWER_PREFIX}-{i}",
                    defaults={
                        "first_name": first,
                        "last_name": last,
                        "email": f"{INTERVIEWER_PREFIX}-{i}@example.test",
                        "password": "!",
                        "is_active": True,
                        "gender": gender,
                        "lego_id": INTERVIEWER_LEGO_ID_BASE + i,
                    },
                )
                Membership.objects.get_or_create(
                    user=user, group=group, defaults={"role": "member"}
                )
            # Available for ALL of the framework's blocks - not a random
            # 75%. Random availability on whole blocks means some
            # blocks end up with no habile panel, and the solver
            # leaves candidates unplaced with "Ikke nok
            # intervjukapasitet". The dev flow wants every block to be
            # fillable; real committees can submit real availability
            # and the solver will use it. Whole blocks, all of them.
            blocks = build_standard_slot_blocks(
                start_date=saved.start_date,
                end_date=saved.end_date,
                day_start_minute=saved.day_start_minute,
                day_end_minute=saved.day_end_minute,
                session_duration=saved.session_duration,
                chunk_size=saved.chunk_size,
                chunk_break_minutes=saved.chunk_break_minutes,
            )
            slots = [slot for block in blocks for slot in block["slots"]]
            # Mark the last block of the week as discouraged so the
            # solver has some preference signal to work with. This is
            # the only deviation from full availability.
            if blocks:
                last_block_slots = blocks[-1]["slots"]
                discouraged = list(last_block_slots[:1]) if last_block_slots else []
            else:
                discouraged = []
            conflict_pool = [
                candidate_id
                for candidate_id in candidate_ids
                if conflict_counts[candidate_id] < 2
            ]
            conflicts = (
                rng.sample(conflict_pool, k=min(3, len(conflict_pool)))
                if conflict_pool
                else []
            )
            for candidate_id in conflicts:
                conflict_counts[candidate_id] += 1
            if i % 3 == 0:
                experience_level = InterviewAvailability.EXPERIENCE_EXPERIENCED
            elif i % 3 == 1:
                experience_level = InterviewAvailability.EXPERIENCE_INEXPERIENCED
            else:
                experience_level = InterviewAvailability.EXPERIENCE_UNKNOWN
            availability, _ = InterviewAvailability.objects.update_or_create(
                admission=admission,
                group=group,
                user=user,
                defaults={
                    "slots": slots,
                    "discouraged_slots": discouraged,
                    "conflicts": conflicts,
                    "reviewed_candidate_ids": [],
                    "participation": (
                        InterviewAvailability.PARTICIPATION_PARTICIPATING
                    ),
                    "experience_level": experience_level,
                    "submitted_grid_generation": saved.availability_generation,
                    "fadderbarn_confirmed_at": timezone.now(),
                },
            )
            interviewers.append(availability)
        return interviewers

    def _answer_all_remaining(self, admission, group, saved, preserve_slots=False):
        """Mark every committee roster member without a current answer as
        participating with full availability. Leftover local users (someone
        who signed in and got a membership but never submitted) would
        otherwise hold the plan draft hostage.

        Two modes share this helper: the full seeder wants to fill slots
        for every roster member (the rows may not exist at all), while
        --fill-availability wants to keep the user's hand-edited slots
        and just stamp the row against the current generation. The
        difference is `preserve_slots`: when True, existing slots are
        kept and only the generation stamp is updated, so a real
        submission that happens to be on a stale generation is
        re-acknowledged rather than overwritten.
        """
        roster_ids = get_committee_interviewer_ids(group)
        rows = {
            row.user_id: row
            for row in InterviewAvailability.objects.filter(
                admission=admission,
                group=group,
                user_id__in=roster_ids,
            )
        }
        answered = 0
        for user_id in roster_ids:
            row = rows.get(user_id)
            if row is not None and availability_submission_is_current(row, saved):
                continue
            if preserve_slots and row is not None and row.slots:
                # Keep the user's hand-edited slots; just refresh the
                # generation stamp and participation flag so the
                # publish gate sees them as answered.
                InterviewAvailability.objects.filter(pk=row.pk).update(
                    participation=(InterviewAvailability.PARTICIPATION_PARTICIPATING),
                    submitted_grid_generation=saved.availability_generation,
                )
            else:
                InterviewAvailability.objects.update_or_create(
                    admission=admission,
                    group=group,
                    user_id=user_id,
                    defaults={
                        "slots": saved.enabled_slots,
                        "discouraged_slots": [],
                        "conflicts": [],
                        "reviewed_candidate_ids": [],
                        "participation": (
                            InterviewAvailability.PARTICIPATION_PARTICIPATING
                        ),
                        "experience_level": (
                            InterviewAvailability.EXPERIENCE_EXPERIENCED
                        ),
                        "submitted_grid_generation": saved.availability_generation,
                        "fadderbarn_confirmed_at": timezone.now(),
                    },
                )
            answered += 1
        return answered

    def _set_passwords(self, password, adopted=None):
        """Give every seeded user and the fixture admin the same local
        password, so they can be impersonated through the real login flow."""
        users = LegoUser.objects.filter(
            username__startswith=f"{CANDIDATE_PREFIX}-"
        ) | LegoUser.objects.filter(username__startswith=f"{INTERVIEWER_PREFIX}-")
        adopted_ids = {user.id for user in (adopted or [])}
        if adopted_ids:
            users = users | LegoUser.objects.filter(id__in=adopted_ids)
        admin = LegoUser.objects.filter(username=ADMIN_USERNAME).first()
        if admin is not None:
            users = users | LegoUser.objects.filter(pk=admin.pk)
        for user in users.distinct():
            user.set_password(password)
            user.save(update_fields=["password"])

    def _seed_admin_availability(self, admission, group, saved):
        """The fixture administrator (the recruiter) can be on panels too."""
        admin = LegoUser.objects.filter(username=ADMIN_USERNAME, is_active=True).first()
        if admin is None:
            return
        if not Membership.objects.filter(user=admin, group=group).exists():
            return
        InterviewAvailability.objects.update_or_create(
            admission=admission,
            group=group,
            user=admin,
            defaults={
                "slots": saved.enabled_slots,
                "discouraged_slots": [],
                "conflicts": [],
                "reviewed_candidate_ids": [],
                "participation": InterviewAvailability.PARTICIPATION_PARTICIPATING,
                "experience_level": InterviewAvailability.EXPERIENCE_EXPERIENCED,
                "submitted_grid_generation": saved.availability_generation,
                "fadderbarn_confirmed_at": timezone.now(),
            },
        )

    def _complete_reviews(self, admission, group):
        """Mark every participating interviewer's kandidatkontroll as done for
        the committee's current saved plan.

        Mirrors ``get_conflict_review_readiness``: an interviewer's target is
        the union of their review-snapshot scope and the candidates proposed
        for their panels. Opted-out interviewers are skipped (the publish gate
        skips them too). Existing reviewed ids and declared conflicts are kept.
        Re-seeds nothing, so a solved plan is left intact.
        """
        saved = (
            SavedSchedule.objects.filter(admission=admission, group=group)
            .order_by("-availability_generation")
            .first()
        )
        if saved is None or not isinstance(saved.schedule, list) or not saved.schedule:
            raise CommandError(
                f"No saved plan for {group.name} in {admission.slug} — solve "
                "and save a plan first, then re-run with --complete-reviews."
            )

        proposed_by_interviewer = get_proposed_candidate_ids_by_interviewer(saved)
        opted_out_ids = {
            str(user_id)
            for user_id, state in get_interviewer_participation(
                admission, group, saved
            ).items()
            if state == InterviewAvailability.PARTICIPATION_NOT_PARTICIPATING
        }
        rows = {
            str(row.user_id): row
            for row in InterviewAvailability.objects.filter(
                admission=admission, group=group
            )
        }

        completed = 0
        missing_rows = 0
        # The local fixture admin (`webkom`) is the same person who runs
        # the seeder. Auto-completing their review would mask a stale
        # snapshot and surface a misleading "N må kontrollere" publish-gate
        # message that the admin can resolve in one click - but only if
        # the seeder leaves the row honest. Skip them so the dev flow
        # shows the real state: their own review is the one they must do.
        local_admin_id = (
            str(
                LegoUser.objects.filter(username=ADMIN_USERNAME)
                .values_list("pk", flat=True)
                .first()
            )
            if LegoUser.objects.filter(username=ADMIN_USERNAME).exists()
            else None
        )
        for interviewer_id, proposed in proposed_by_interviewer.items():
            if not proposed or str(interviewer_id) in opted_out_ids:
                continue
            if str(interviewer_id) == local_admin_id:
                continue
            row = rows.get(str(interviewer_id))
            if row is None:
                missing_rows += 1
                continue
            target = {
                str(candidate_id)
                for candidate_id in (
                    conflict_review_scope(saved, interviewer_id) | proposed
                )
            }
            current = {str(cid) for cid in (row.reviewed_candidate_ids or [])}
            merged = sorted(current | target)
            if merged != sorted(current):
                row.reviewed_candidate_ids = merged
                row.save(update_fields=["reviewed_candidate_ids", "updated_at"])
            completed += 1

        readiness = get_conflict_review_readiness(
            admission, group, saved_schedule=saved
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Marked kandidatkontroll done for {completed} interviewer(s) "
                f"in {group.name} / {admission.slug}."
            )
        )
        if missing_rows:
            self.stdout.write(
                self.style.WARNING(
                    f"{missing_rows} proposed interviewer(s) had no availability "
                    "row and were left untouched."
                )
            )
        if readiness["incomplete_participant_ids"]:
            self.stdout.write(
                self.style.WARNING(
                    f"{len(readiness['incomplete_participant_ids'])} interviewer(s) "
                    "still incomplete — publication may remain blocked."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    "Conflict-review gate is clear; the plan can be published."
                )
            )
