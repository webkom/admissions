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

# Gender
# Only male/female map to a panel code; "other"/unset are ignored by the solver.
LEGO_GENDER_MALE = "male"
LEGO_GENDER_FEMALE = "female"
LEGO_GENDER_TO_PANEL_CODE = {LEGO_GENDER_MALE: "M", LEGO_GENDER_FEMALE: "F"}


# Interview-schedule solver bounds
# Solving runs in run_solver_worker, not the request thread; this is a sanity ceiling.
MAX_SOLVER_SECONDS = 120.0
SOLVER_NUM_WORKERS = 4
SOLVER_RANDOM_SEED = 42

# Async solve-job worker bounds. A job RUNNING past the stale window is failed as abandoned.
SOLVE_JOB_STALE_SECONDS = 10 * 60
SOLVE_JOB_RETENTION_DAYS = 7
