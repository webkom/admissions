from .base import *
import environ

env = environ.Env()
env_file = str(SETTINGS_DIR.path('.env'))
env.read_env(env_file)