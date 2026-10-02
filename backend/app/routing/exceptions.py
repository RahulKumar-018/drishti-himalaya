"""Exceptions for routing providers and network interactions."""


class RoutingError(Exception):
    """Base exception for all routing-related errors."""
    pass


class RoutingProviderError(RoutingError):
    """Raised when an upstream routing provider returns an HTTP error or unexpected payload."""
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class RoutingTimeoutError(RoutingError):
    """Raised when an upstream routing request times out."""
    pass


class RoutingNetworkError(RoutingError):
    """Raised when network transport or connectivity fails."""
    pass


class NoRouteFoundError(RoutingError):
    """Raised when the routing provider cannot find a feasible road connection."""
    pass


class InvalidCoordinateError(RoutingError):
    """Raised when input waypoints fall outside the study bounds or are invalid."""
    pass


class MissingAPIKeyError(RoutingError):
    """Raised when an external routing provider requires an API key that is not configured."""
    pass
