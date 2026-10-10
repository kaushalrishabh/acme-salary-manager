"""Typed exceptions the service layer raises, and the FastAPI handlers that
translate them to HTTP responses (registered once, in app.main, so routers
never need their own try/except).
"""


class NotFoundError(Exception):
    """A requested resource does not exist."""


class DuplicateEmailError(Exception):
    """An email is already in use by another employee."""


class FieldValidationError(Exception):
    """A single field failed a business-rule check (not a schema-shape check).

    Carries the field name so the 422 response can point at it, matching
    Pydantic's own per-field error shape.
    """

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message
