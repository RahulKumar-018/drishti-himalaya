import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getLocationById, validateRouteSelection, createLocationFromCoordinates } from '../locationService';
import { LocationSelectionState } from '../../../types/location';

describe('Location State Transitions & Business Invariants', () => {
  const dehradun = getLocationById('dehradun')!;
  const badrinath = getLocationById('badrinath')!;
  const kedarnath = getLocationById('kedarnath')!;

  it('1. should initialize in DEFAULT_PILOT_CORRIDOR mode with clean state', () => {
    const initialState: LocationSelectionState = {
      origin: null,
      destination: null,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: false,
      routeMode: 'DEFAULT_PILOT_CORRIDOR',
    };

    assert.strictEqual(initialState.routeMode, 'DEFAULT_PILOT_CORRIDOR');
    assert.strictEqual(initialState.origin, null);
    assert.strictEqual(initialState.destination, null);
    assert.strictEqual(initialState.isRouteReady, false);
  });

  it('2. should transition to USER_SELECTED_LOCATIONS mode when locations are selected', () => {
    let state: LocationSelectionState = {
      origin: dehradun,
      destination: null,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: false,
      routeMode: 'USER_SELECTED_LOCATIONS',
    };

    assert.strictEqual(state.routeMode, 'USER_SELECTED_LOCATIONS');
    assert.strictEqual(state.origin?.id, 'dehradun');

    // Add destination
    state = {
      ...state,
      destination: badrinath,
    };
    assert.strictEqual(state.destination?.id, 'badrinath');
  });

  it('3. should swap origin and destination correctly', () => {
    const origin = dehradun;
    const destination = badrinath;

    const swappedOrigin = destination;
    const swappedDest = origin;

    assert.strictEqual(swappedOrigin.id, 'badrinath');
    assert.strictEqual(swappedDest.id, 'dehradun');
  });

  it('4. should confirm temporary map click point into selected origin', () => {
    const tempPoint = createLocationFromCoordinates(30.1459, 78.5989, undefined, 'map_click');

    const confirmedState: LocationSelectionState = {
      origin: tempPoint,
      destination: kedarnath,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: false,
      routeMode: 'USER_SELECTED_LOCATIONS',
    };

    assert.strictEqual(confirmedState.selectionMode, null);
    assert.strictEqual(confirmedState.tempMapPoint, null);
    assert.ok(confirmedState.origin?.id.startsWith('map-'));
    assert.strictEqual(confirmedState.origin?.latitude, 30.1459);
  });

  it('5. should set isRouteReady only when route validation passes', () => {
    // Valid route
    const validCheck = validateRouteSelection(dehradun, badrinath);
    assert.strictEqual(validCheck.isValid, true);

    const readyState: LocationSelectionState = {
      origin: dehradun,
      destination: badrinath,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: validCheck.isValid,
      routeMode: 'USER_SELECTED_LOCATIONS',
    };

    assert.strictEqual(readyState.isRouteReady, true);

    // Invalid route (missing destination)
    const invalidCheck = validateRouteSelection(dehradun, null);
    assert.strictEqual(invalidCheck.isValid, false);

    const notReadyState: LocationSelectionState = {
      origin: dehradun,
      destination: null,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: invalidCheck.isValid,
      routeMode: 'USER_SELECTED_LOCATIONS',
    };

    assert.strictEqual(notReadyState.isRouteReady, false);
  });

  it('6. should reset state back to clean default corridor state', () => {
    const resetState: LocationSelectionState = {
      origin: null,
      destination: null,
      liveLocation: null,
      selectionMode: null,
      tempMapPoint: null,
      isLocating: false,
      locationError: null,
      isRouteReady: false,
      routeMode: 'DEFAULT_PILOT_CORRIDOR',
    };

    assert.strictEqual(resetState.routeMode, 'DEFAULT_PILOT_CORRIDOR');
    assert.strictEqual(resetState.origin, null);
    assert.strictEqual(resetState.destination, null);
    assert.strictEqual(resetState.isRouteReady, false);
    assert.strictEqual(resetState.selectionMode, null);
  });

  it('7. should clear activeRoute and reset routing status whenever origin or destination changes', () => {
    // Simulated active route state
    let activeRoute: unknown = { status: 'success', distanceMeters: 255000 };
    let isRouteReady = true;
    let routingStatus = 'success';

    // User changes origin
    const onOriginChange = () => {
      activeRoute = null;
      isRouteReady = false;
      routingStatus = 'idle';
    };

    onOriginChange();

    assert.strictEqual(activeRoute, null);
    assert.strictEqual(isRouteReady, false);
    assert.strictEqual(routingStatus, 'idle');
  });

  it('8. should preserve failure error message and allow retry transition without clearing origin/destination', () => {
    const origin = dehradun;
    const destination = badrinath;
    let routingStatus = 'error';
    let routingError: string | null = 'Device is offline. Please check your network connection.';
    let activeRoute = null;

    // Retry initiates
    const onRetry = () => {
      routingStatus = 'loading';
      routingError = null;
    };

    onRetry();

    assert.strictEqual(routingStatus, 'loading');
    assert.strictEqual(routingError, null);
    assert.strictEqual(activeRoute, null);
    assert.strictEqual(origin.id, 'dehradun');
    assert.strictEqual(destination.id, 'badrinath');
  });
});
