from .base import *
import environ

# GENERAL CONFIGURATION ======================================================
SETTINGS_DIR = environ.Path(__file__) - 1

env = environ.Env()
env_file = str(SETTINGS_DIR.path('.env'))
env.read_env(env_file)