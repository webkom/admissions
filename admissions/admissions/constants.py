MEMBER = "member"
LEADER = "leader"
CO_LEADER = "co-leader"
TREASURER = "treasurer"
RECRUITING = "recruiting"
DEVELOPMENT = "development"
EDITOR = "editor"
RETIREE = "retiree"
MEDIA_RELATIONS = "media_relations"
ACTIVE_RETIREE = "active_retiree"
ALUMNI = "alumni"
WEBMASTER = "webmaster"
INTEREST_GROUP_ADMIN = "interest_group_admin"
ALUMNI_ADMIN = "alumni_admin"
RETIREE_EMAIL = "retiree_email"
COMPANY_ADMIN = "company_admin"
DUGNAD_ADMIN = "dugnad_admin"
TRIP_ADMIN = "trip_admin"
SPONSOR_ADMIN = "sponsor_admin"
SOCIAL_ADMIN = "social_admin"

ROLES = (
    (MEMBER, MEMBER),
    (LEADER, LEADER),
    (CO_LEADER, CO_LEADER),
    (TREASURER, TREASURER),
    (RECRUITING, RECRUITING),
    (DEVELOPMENT, DEVELOPMENT),
    (EDITOR, EDITOR),
    (RETIREE, RETIREE),
    (MEDIA_RELATIONS, MEDIA_RELATIONS),
    (ACTIVE_RETIREE, ACTIVE_RETIREE),
    (ALUMNI, ALUMNI),
    (WEBMASTER, WEBMASTER),
    (INTEREST_GROUP_ADMIN, INTEREST_GROUP_ADMIN),
    (ALUMNI_ADMIN, ALUMNI_ADMIN),
    (RETIREE_EMAIL, RETIREE_EMAIL),
    (COMPANY_ADMIN, COMPANY_ADMIN),
    (DUGNAD_ADMIN, DUGNAD_ADMIN),
    (TRIP_ADMIN, TRIP_ADMIN),
    (SPONSOR_ADMIN, SPONSOR_ADMIN),
    (SOCIAL_ADMIN, SOCIAL_ADMIN),
)

INACTIVE_MEMBERSHIP_ROLES = (RETIREE, ALUMNI, RETIREE_EMAIL)

DATA = "data"
KOMTEK = "komtek"

COURSES = ((DATA, DATA), (KOMTEK, KOMTEK))

DATA_LONG = "Datateknologi"
KOMTEK_LONG = "Kommunikasjonsteknologi"

COURSES_LONG = ((DATA_LONG, DATA_LONG), (KOMTEK_LONG, KOMTEK_LONG))

# Groups that give privileges to their leaders
STAFF_LEADER_GROUPS = ["backup", "Hovedstyret", "RevyStyret"]
""" Members of this group with role leader should attain the is_staff attribute and be able to manage admissions """
WEBKOM_GROUPNAME = "Webkom"
""" Group name of Webkom """

LEGO_GENDER_MALE = "male"
LEGO_GENDER_FEMALE = "female"
LEGO_GENDER_TO_PANEL_CODE = {LEGO_GENDER_MALE: "M", LEGO_GENDER_FEMALE: "F"}


# CP-SAT stops as soon as it proves the best plan, so this is a ceiling rather
# than a fixed delay. Five minutes gives harder admissions materially more
# search time while keeping one solve bounded.
MAX_SOLVER_SECONDS = 5 * 60
SOLVER_NUM_WORKERS = 4
SOLVER_RANDOM_SEED = 42
MAX_SOLVER_MODEL_VARS = 2_000_000
MAX_SCHEDULE_DAYS = 21
MAX_SCHEDULE_SLOTS = MAX_SCHEDULE_DAYS * 24 * 12
MAX_SCHEDULE_WINDOWS = MAX_SCHEDULE_DAYS * 24 * 6
MAX_SOLVER_BLOCK_MEMBERSHIPS = MAX_SCHEDULE_SLOTS
MAX_NAME_VISIBILITY_AUDIT_EVENTS = 500

# A different worker may reap a RUNNING job, so crash detection must always
# leave ample headroom above the longest legitimate solve.
SOLVE_JOB_STALE_SECONDS = MAX_SOLVER_SECONDS * 2
SOLVE_JOB_RETENTION_DAYS = 1
SOLVE_PROPOSAL_RETENTION_DAYS = 7
