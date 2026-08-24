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
MERCH_ADMIN = "merch_admin"
HS_REPRESENTATIVE = "hs_representative"
CUDDLING_MANAGER = "cuddling_manager"
PHOTO_FILM_ADMIN = "photo_admin"
GRAPHIC_ADMIN = "graphic_admin"
SOCIAL_MEDIA_ADMIN = "social_media_admin"
BOOKING_ADMIN = "booking_admin"
PURCHASING_MANAGER = "purchasing_manager"
EVENT_MANAGER = "event_manager"
SNACKOVERFLOW_MANAGER = "snackoverflow_manager"

# Mirrors lego/apps/users/constants.py. None of these grant any privilege here
# - that is decided by LEADER/CO_LEADER/RECRUITING alone - but every role LEGO
# can send has to be listed, because a membership carrying an unlisted one used
# to be rejected and took the rest of the payload down with it.
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
    (MERCH_ADMIN, MERCH_ADMIN),
    (HS_REPRESENTATIVE, HS_REPRESENTATIVE),
    (CUDDLING_MANAGER, CUDDLING_MANAGER),
    (PHOTO_FILM_ADMIN, PHOTO_FILM_ADMIN),
    (GRAPHIC_ADMIN, GRAPHIC_ADMIN),
    (SOCIAL_MEDIA_ADMIN, SOCIAL_MEDIA_ADMIN),
    (BOOKING_ADMIN, BOOKING_ADMIN),
    (PURCHASING_MANAGER, PURCHASING_MANAGER),
    (EVENT_MANAGER, EVENT_MANAGER),
    (SNACKOVERFLOW_MANAGER, SNACKOVERFLOW_MANAGER),
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
""" Members of these groups with role leader attain the is_staff attribute and can manage admissions. Matched against the LEGO login payload's group names - no local Group row is needed. """
WEBKOM_GROUPNAME = "Webkom"
""" Group name of Webkom """

LEGO_GENDER_MALE = "male"
LEGO_GENDER_FEMALE = "female"
LEGO_GENDER_TO_PANEL_CODE = {LEGO_GENDER_MALE: "M", LEGO_GENDER_FEMALE: "F"}


# CP-SAT stops as soon as it proves the best plan, so these are ceilings rather
# than fixed delays. Normal solves use a short budget; callers can explicitly
# request the longer ceiling for unusually difficult admissions.
DEFAULT_SOLVER_SECONDS = 30
MAX_SOLVER_SECONDS = 5 * 60
SOLVER_NUM_WORKERS = 4
SOLVER_RANDOM_SEED = 42
MAX_SOLVER_MODEL_VARS = 2_000_000
MAX_SOLVER_MODEL_CONSTRAINTS = 4_000_000
# A much lower sparse-core guard prevents Python model construction/search from
# monopolising a worker even when auxiliary variables remain under the absolute
# protobuf safety limit.
MAX_SOLVER_SPARSE_BASE_VARS = 100_000
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
