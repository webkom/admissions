from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from admissions.admissions.session_renewal import session_expires_at


class SessionStatusView(APIView):
    """The session's real remaining life, for the expiry warning to re-read.

    SESSION_EXPIRES_AT is baked into the page at render, so once "Forleng
    innlogging" opened login in a second tab the original tab had no way to
    learn that the session had moved - it kept counting down to a value that
    was no longer true and stayed stuck on "utløpt". Re-reading this on focus
    lets the banner clear itself.

    Deliberately does not renew: this is polled by an open tab, so treating it
    as activity would keep a session alive with nobody present, which is the
    whole reason renewal is tied to explicit human actions instead of
    SESSION_SAVE_EVERY_REQUEST.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        expires_at = session_expires_at(request)
        return Response({"expires_at": expires_at.isoformat() if expires_at else None})
