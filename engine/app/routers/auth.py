"""
engine/app/routers/auth.py
──────────────────────────
Authentication router for GridNexus.

Endpoints:
  POST /auth/register  — create a new user account
  POST /auth/login     — authenticate and return JWT token
  GET  /auth/me        — return current authenticated user
"""

from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.deps import get_db
from app.models import Agent, User
from app.auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    create_agent_access_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email:    str = Field(..., min_length=5, max_length=200)
    password: str = Field(..., min_length=8)


class UserOut(BaseModel):
    id:       str
    username: str
    email:    str
    role:     str

class AgentTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    agent_id: str
    expires_in: int = 900


    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut


# ── Dependency: current user ──────────────────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    user_id: Optional[str] = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.active:
        raise credentials_exception
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """Create a new user and return a JWT access token."""
    # Check username taken
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken. Please choose another.",
        )
    # Check email taken
    existing_email = await db.execute(select(User).where(User.email == body.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered.",
        )

    new_user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        email=body.email,
        passwordHash=hash_password(body.password),
        role="VIEWER",
        active=True,
        createdAt=datetime.now(tz=timezone.utc),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    token = create_access_token({"sub": new_user.id, "email": new_user.email, "role": new_user.role})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(new_user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Authenticate with username + password. Returns JWT access token."""
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(form_data.password, user.passwordHash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated.",
        )

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    return TokenResponse(
        access_token=token,
        user=UserOut.model_validate(user),
    )



@router.post("/agent-token/{agent_id}", response_model=AgentTokenResponse)
async def issue_agent_token(
    agent_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Issue a short-lived broker credential to an authorized grid operator."""
    if current_user.role not in {"ADMIN", "GRID_OPERATOR"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators and grid operators may issue agent credentials.",
        )

    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found.",
        )

    return AgentTokenResponse(
        access_token=create_agent_access_token(agent_id),
        agent_id=agent_id,
    )
@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return UserOut.model_validate(current_user)
