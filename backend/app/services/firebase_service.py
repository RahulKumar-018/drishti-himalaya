import logging
from pathlib import Path
from typing import Dict, Any, Optional

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

class FirebaseService:
    """Service abstraction for Firebase Cloud Messaging (FCM).
    
    Handles graceful degradation when Firebase is unavailable, logging
    notifications for simulation purposes without crashing the system.
    """
    
    def __init__(self):
        self._initialized = False
        self._messaging = None
        self._init_error: str | None = None
        self._configure()

    def _configure(self) -> None:
        """Attempt to configure Firebase Admin SDK if credentials exist."""
        try:
            import firebase_admin
            from firebase_admin import credentials
            from firebase_admin import messaging
            
            if not settings.FIREBASE_CREDENTIALS_PATH:
                self._init_error = "FIREBASE_CREDENTIALS_PATH is not configured"
                logger.info("Firebase delivery disabled: credentials are not configured.")
                return

            credentials_path = Path(settings.FIREBASE_CREDENTIALS_PATH)
            if not credentials_path.is_file():
                self._init_error = "configured Firebase credentials file does not exist"
                logger.warning("Firebase delivery disabled: credentials file is unavailable.")
                return

            if not firebase_admin._apps:
                firebase_admin.initialize_app(
                    credentials.Certificate(str(credentials_path)),
                    {"projectId": settings.FIREBASE_PROJECT_ID} if settings.FIREBASE_PROJECT_ID else None,
                )
            self._messaging = messaging
            self._initialized = True
            logger.info("Firebase Cloud Messaging initialized.")

        except ImportError:
            self._init_error = "firebase-admin package is not installed"
            logger.info("Firebase delivery disabled: firebase-admin is not installed.")
        except Exception as exc:
            self._init_error = exc.__class__.__name__
            logger.warning("Firebase initialization failed; push delivery is disabled.")

    def send_notification(self, token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Send a push notification to a specific device token.
        
        Returns False when Firebase is unavailable; callers can persist the alert and retry later.
        """
        if not self._initialized:
            return False

        try:
            safe_data = {str(key): str(value) for key, value in (data or {}).items()}
            message = self._messaging.Message(
                notification=self._messaging.Notification(title=title, body=body),
                data=safe_data,
                token=token,
            )
            self._messaging.send(message)
            return True
        except Exception as exc:
            logger.warning("Firebase notification delivery failed: %s", exc.__class__.__name__)
            return False

    def send_topic_alert(self, topic: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """
        Send a push notification to all devices subscribed to a topic.
        """
        if not self._initialized:
            return False

        try:
            safe_data = {str(key): str(value) for key, value in (data or {}).items()}
            message = self._messaging.Message(
                notification=self._messaging.Notification(title=title, body=body),
                data=safe_data,
                topic=topic,
            )
            self._messaging.send(message)
            return True
        except Exception as exc:
            logger.warning("Firebase topic delivery failed: %s", exc.__class__.__name__)
            return False


firebase_service = FirebaseService()

def get_firebase_service() -> FirebaseService:
    """Dependency provider for FirebaseService."""
    return firebase_service
