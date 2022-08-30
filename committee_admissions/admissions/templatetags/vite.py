from django import template
from django.conf import settings
from django.utils.safestring import mark_safe

register = template.Library()


@register.simple_tag
@mark_safe
def vite_react_preamble():
    if settings.DJANGO_VITE_DEV_MODE:
        return f"""<script type="module">
          import RefreshRuntime from 'http://localhost:{settings.DJANGO_VITE_DEV_SERVER_PORT}/@react-refresh'
          RefreshRuntime.injectIntoGlobalHook(window)
          window.$RefreshReg$ = () => {{}}
          window.$RefreshSig$ = () => (type) => type
          window.__vite_plugin_react_preamble_installed__ = true
        </script>
    """
    return ""
