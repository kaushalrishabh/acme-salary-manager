"""The one place every environment-variable read in this app goes
through, so a value that's set but blank (e.g. a literal `KEY=` left over
from an unfilled .env.example) behaves exactly like not setting KEY at all.
"""

import os


def get_env(name: str) -> str | None:
    """Return the named environment variable, stripped of surrounding
    whitespace, or None if it is unset, empty, or whitespace-only.
    """
    value = os.environ.get(name)
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None
