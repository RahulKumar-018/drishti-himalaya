"""Base repository abstraction for transactional database operations."""

from typing import Generic, List, Optional, Type, TypeVar
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.database import Base

ModelType = TypeVar("ModelType", bound=Base)


class BaseRepository(Generic[ModelType]):
    """Generic repository providing baseline CRUD operations."""

    def __init__(self, model: Type[ModelType], session: Session) -> None:
        self.model = model
        self.session = session

    def get_by_id(self, record_id: uuid.UUID) -> Optional[ModelType]:
        """Fetch a single record by primary key UUID."""
        return self.session.get(self.model, record_id)

    def list_all(self, limit: int = 100, offset: int = 0) -> List[ModelType]:
        """Fetch paginated records ordered by primary key."""
        stmt = select(self.model).limit(limit).offset(offset)
        return list(self.session.scalars(stmt).all())

    def add(self, entity: ModelType) -> ModelType:
        """Add a single entity to the session and flush to generate primary key."""
        self.session.add(entity)
        self.session.flush()
        return entity

    def add_all(self, entities: List[ModelType]) -> List[ModelType]:
        """Add multiple entities to the session and flush."""
        self.session.add_all(entities)
        self.session.flush()
        return entities

    def delete(self, entity: ModelType) -> None:
        """Mark an entity for deletion."""
        self.session.delete(entity)
