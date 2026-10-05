"""User profile repository for managing user records and preferences."""

from typing import Optional
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.repositories.base import BaseRepository
from backend.app.models.user import UserProfile


class UserRepository(BaseRepository[UserProfile]):
    """Repository managing user profile persistence."""

    def __init__(self, session: Session) -> None:
        super().__init__(UserProfile, session)

    def get_by_email(self, email: str) -> Optional[UserProfile]:
        """Fetch user profile by email address."""
        stmt = select(UserProfile).where(UserProfile.email == email)
        return self.session.execute(stmt).scalar_one_or_none()

    def create(
        self,
        display_name: Optional[str] = None,
        email: Optional[str] = None,
        role: Optional[str] = "commuter",
    ) -> UserProfile:
        """Create and stage a new user profile."""
        user = UserProfile(
            display_name=display_name,
            email=email,
            role=role,
        )
        return self.add(user)
