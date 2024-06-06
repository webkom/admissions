"""admissions URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/2.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.conf import settings
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, re_path
from rest_framework import routers

from admissions.admissions.views import (
    AdminAdmissionViewSet,
    AdminApplicationViewSet,
    AdminGroupViewSet,
    AppView,
    ManageAdmissionViewSet,
    ManageGroupViewSet,
    PublicAdmissionViewSet,
    PublicApplicationViewSet,
)

publicRouter = routers.DefaultRouter()
publicRouter.register(r"admission", PublicAdmissionViewSet)
publicRouter.register(
    r"admission/(?P<admission_slug>[-\w]+)/application", PublicApplicationViewSet
)

adminRouter = routers.DefaultRouter()
adminRouter.register(r"admission", AdminAdmissionViewSet, "admin-admission")
adminRouter.register(
    r"admission/(?P<admission_slug>[-\w]+)/application",
    AdminApplicationViewSet,
    "admin-userapplication",
)
adminRouter.register(r"group", AdminGroupViewSet, "admin-group")

manageRouter = routers.DefaultRouter()
manageRouter.register(r"admission", ManageAdmissionViewSet, "manage-admission")
manageRouter.register(r"group", ManageGroupViewSet, "manage-group")


urlpatterns = [
    re_path(r"logout/$", auth_views.LogoutView.as_view(), name="logout"),
    path("api/admin/", include(adminRouter.urls)),
    path("api/manage/", include(manageRouter.urls)),
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
    path("api/", include(publicRouter.urls)),
    re_path("", include("social_django.urls", namespace="social")),
    re_path(r"^$", AppView.as_view(), name="home"),
]

if settings.DEBUG:
    import debug_toolbar

    urlpatterns += [path("__debug__/", include(debug_toolbar.urls))]

    from django.contrib.staticfiles.urls import staticfiles_urlpatterns

    urlpatterns += staticfiles_urlpatterns()

urlpatterns += [re_path("(?:.*)/?", AppView.as_view(), name="home")]
