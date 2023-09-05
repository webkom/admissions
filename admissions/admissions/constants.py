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
SUPERUSER_LEADER_GROUPS = ["Hovedstyret", "RevyStyret"]
""" Members of this group with role leader should attain the is_superuser attribute """
STAFF_LEADER_GROUPS = ["backup", "Hovedstyret", "RevyStyret"]
""" Members of this group with role leader should attain the is_staff attribute """
WEBKOM_GROUPNAME = "Webkom"
""" Group name of Webkom """
