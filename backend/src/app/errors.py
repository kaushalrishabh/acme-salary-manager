"""Typed exceptions the service layer raises, and the FastAPI handlers that
translate them to HTTP responses (registered once, in app.main, so routers
never need their own try/except).

Slice 1 (reads only) only ever raises NotFoundError. DuplicateEmailError and
FieldValidationError are added with the writes slice, when something in the
service actually raises them.
"""


class NotFoundError(Exception):
    """A requested resource does not exist."""
