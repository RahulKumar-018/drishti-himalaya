"""User profile database model for future traveler and analyst preferences."""

from datetime import datetime
from typing import Optional
import uuid

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base
from backend.app.models.base import GUID, TimestampMixin, utc_now


class UserProfile(Base, TimestampMixin):
    """User profile record establishing the persistence boundary for future authentication."""

    __tablename__ = "user_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        primary_key=True,
        default=uuid.uuid4,
    )
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    role: Mapped[Optional[str]] = mapped_column(String(50), default="commuter", nullable=True)

    # Relationships
    saved_routes = relationship("SavedRoute", back_populates="user", cascade="all, delete-orphan")
    community_reports = relationship("CommunityHazardReport", back_populates="user")
    feedback = relationship("Feedback", back_populates="user")

    def __repr__(self) -> str:
        return f"<UserProfile id={self.id} email={self.email} role={self.role}>"
