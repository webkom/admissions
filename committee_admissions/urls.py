"""committee_admissions URL Configuration

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
from django.urls import include, path, re_path
from rest_framework import routers
from django.conf.urls import url
from django.views.decorators.csrf import csrf_exempt


from committee_admissions.admissions.views import (
    AdmissionViewSet, CommitteeApplicationViewSet, CommitteeViewSet, UserApplicationViewSet,
    UserViewSet, ApplicationViewSet, AppView, user_has_applied
)

router = routers.DefaultRouter()
router.register(r'admission', AdmissionViewSet)
router.register(r'committee', CommitteeViewSet)
router.register(r'application', ApplicationViewSet)
router.register(r'committee-application', CommitteeApplicationViewSet)
router.register(r'users', UserViewSet)

urlpatterns = [
    path('api/admin/', admin.site.urls),
    path('api-auth/', include('rest_framework.urls', namespace='rest_framework')),
    path('api/', include(router.urls)),
    url('', include('social_django.urls', namespace='social')),
    re_path(r'^$', AppView.as_view(), name="home"),
    re_path('(?:.*)/?', AppView.as_view(), name="home"),
    path('api/<int:applicationId>/<int:committeeId>/', user_has_applied, name="hasApplied"),
]

if settings.DEBUG:
    import debug_toolbar
    urlpatterns += [
        path('__debug__/', include(debug_toolbar.urls)),
    ]

    from django.contrib.staticfiles.urls import staticfiles_urlpatterns
    urlpatterns += staticfiles_urlpatterns()

