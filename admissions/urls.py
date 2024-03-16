"""
Verify what urls are exposed: `$ python manage.py show_urls`
"""
from django.conf import settings
from django.contrib.auth import views as auth_views
from django.urls import include, path, re_path
from rest_framework import routers

from admissions.admissions.views import (
    AdminApplicationViewSet,
    AdminGroupViewSet,
    AppView,
    ManageAdmissionViewSet,
    ManageGroupViewSet,
    PublicAdmissionViewSet,
    PublicApplicationViewSet,
)

router = routers.DefaultRouter()

router.register(r"admission", PublicAdmissionViewSet, basename="admission")

router.register(
    r"admission/(?P<admission_slug>[-\w]+)/admin/application",
    AdminApplicationViewSet,
    basename="admin-application",
)
router.register(
    r"admission/(?P<admission_slug>[-\w]+)/admin/group",
    AdminGroupViewSet,
    basename="admin-group",
)

router.register(r"manage/group", ManageGroupViewSet, basename="manage-group")
router.register(
    r"manage/admission", ManageAdmissionViewSet, basename="manage-admission"
)


urlpatterns = [
    re_path(r"logout/$", auth_views.LogoutView.as_view(), name="logout"),
    path("api/", include(router.urls)),
    path(
        r"api/admission/<admission_slug>/application",
        PublicApplicationViewSet.as_view(
            {"get": "retrieve", "post": "create", "delete": "destroy"}
        ),
        name="user-application",
    ),
    re_path("", include("social_django.urls", namespace="social")),
    re_path(r"^$", AppView.as_view(), name="home"),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]

    from django.contrib.staticfiles.urls import staticfiles_urlpatterns

    urlpatterns += staticfiles_urlpatterns()

urlpatterns += [re_path("(?:.*)/?", AppView.as_view(), name="home")]
