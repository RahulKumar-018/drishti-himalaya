"""Topographic and geomorphological terrain observations linked to locations."""

from datetime import datetime
from typing import Optional, TYPE_CHECKING
import uuid

if TYPE_CHECKING:
    from backend.app.models.location import Location

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.core.database import Base
from backend.app.models.base import GUID, utc_now


class TerrainObservation(Base):
    """Topographic terrain observation derived from Digital Elevation Models.

    Captures orthometric elevation, slope in degrees, aspect in degrees, and geomorphological
    terrain classification with full scientific data provenance.
    """

    __tablename__ = "terrain_observations"
    __table_args__ = (
        CheckConstraint("slope >= 0.0 AND slope <= 90.0", name="chk_terrain_slope_bounds"),
        CheckConstraint(
            "aspect IS NULL OR (aspect >= 0.0 AND aspect <= 360.0)",
            name="chk_terrain_aspect_bounds",
        ),
        Index("idx_terrain_obs_location_id", "location_id"),
        Index("idx_terrain_obs_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=uuid.uuid4)
    location_id: Mapped[uuid.UUID] = mapped_column(
        GUID(),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # Elevation in meters (EGM2008 orthometric height)
    elevation: Mapped[float] = mapped_column(Float, nullable=False)

    # Slope in degrees (0.0 to 90.0) derived via Horn (1981) 3x3 finite-difference
    slope: Mapped[float] = mapped_column(Float, nullable=False)

    # Aspect in degrees (0.0 to 360.0, compass heading, clockwise from North)
    aspect: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Geomorphological classification (e.g. flat, gentle_slope, moderate_slope, steep_slope, cliff_escarpment)
    terrain_class: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Provenance
    source: Mapped[str] = mapped_column(String(100), default="Copernicus DEM GLO-30", nullable=False)
    source_reference: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    observation_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship
    location: Mapped["Location"] = relationship("Location", back_populates="terrain_observations")

    def __repr__(self) -> str:
        return f"<TerrainObservation id={self.id} loc={self.location_id} elev={self.elevation}m slope={self.slope}°>"
