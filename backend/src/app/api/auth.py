"""Login route: POST /auth/login."""

from fastapi import APIRouter, HTTPException

from app.auth import TOKEN_MAX_AGE_SECONDS, issue_token, verify_credentials
from app.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(data: LoginRequest) -> LoginResponse:
    if not verify_credentials(data.username, data.password):
        # Same status and body whichever field (or both) was wrong, or
        # whether HR_USERNAME/HR_PASSWORD are even configured -- nothing
        # here reveals which.
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(token=issue_token(data.username), expires_in=TOKEN_MAX_AGE_SECONDS)
