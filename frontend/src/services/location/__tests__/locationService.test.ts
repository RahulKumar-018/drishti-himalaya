import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  searchLocations,
  getLocationById,
  getPopularDestinations,
  validateRouteSelection,
  computeDistanceKm,
  formatCoordinates,
  createLocationFromCoordinates,
  getCurrentBrowserLocation,
} from '../locationService';
import { UTTARAKHAND_LOCATIONS, POPULAR_DESTINATION_IDS } from '../../../data/locations/uttarakhandLocations';
import { LocationPoint } from '../../../types/location';

describe('Location Dataset - Uttarakhand Curated Points', () => {
  it('1. should contain all essential urban centers and Char Dham pilgrimage sites', () => {
    const requiredIds = [
      'dehradun',
      'haridwar',
      'rishikesh',
      'haldwani',
      'nainital',
      'mussoorie',
      'badrinath',
      'kedarnath',
      'gangotri',
      'yamunotri',
      'joshimath',
      'auli',
      'chopta',
      'tungnath',
      'munsiyari',
      'mana-village',
      'devprayag',
      'rudraprayag',
      'karnaprayag',
    ];

    for (const id of requiredIds) {
      const loc = getLocationById(id);
      assert.ok(loc, `Expected location '${id}' to exist in dataset`);
      assert.ok(loc.name.length > 0, `Expected name for '${id}'`);
      assert.strictEqual(loc.state, 'Uttarakhand');
    }
  });

  it('2. should contain unique IDs with no collisions', () => {
    const seenIds = new Set<string>();
    for (const loc of UTTARAKHAND_LOCATIONS) {
      assert.strictEqual(
        seenIds.has(loc.id),
        false,
        `Duplicate ID detected: ${loc.id}`
      );
      seenIds.add(loc.id);
    }
    assert.ok(UTTARAKHAND_LOCATIONS.length >= 40, 'Expected at least 40 curated locations');
  });

  it('3. should have valid WGS84 coordinates within the Uttarakhand geographic bounds', () => {
    for (const loc of UTTARAKHAND_LOCATIONS) {
      assert.ok(
        loc.latitude >= 28.5 && loc.latitude <= 31.5,
        `Latitude ${loc.latitude} for ${loc.name} outside Uttarakhand range (28.5-31.5)`
      );
      assert.ok(
        loc.longitude >= 77.5 && loc.longitude <= 81.2,
        `Longitude ${loc.longitude} for ${loc.name} outside Uttarakhand range (77.5-81.2)`
      );
      assert.ok(loc.category, `Expected category for ${loc.name}`);
      assert.strictEqual(loc.source, 'curated');
    }
  });

  it('4. should provide all popular destination chips', () => {
    const popular = getPopularDestinations();
    assert.strictEqual(popular.length, POPULAR_DESTINATION_IDS.length);
    const popularIds = popular.map((p) => p.id);
    for (const expectedId of POPULAR_DESTINATION_IDS) {
      assert.ok(popularIds.includes(expectedId), `Missing popular destination ${expectedId}`);
    }
  });
});

describe('Location Search Engine', () => {
  it('5. should perform exact and case-insensitive matching', () => {
    const res1 = searchLocations('Dehradun');
    assert.ok(res1.length > 0);
    assert.strictEqual(res1[0].id, 'dehradun');

    const res2 = searchLocations('badrinath');
    assert.ok(res2.length > 0);
    assert.strictEqual(res2[0].id, 'badrinath');

    const res3 = searchLocations('JOSHIMATH');
    assert.ok(res3.length > 0);
    assert.strictEqual(res3[0].id, 'joshimath');
  });

  it('6. should match partial prefixes and substrings', () => {
    const res1 = searchLocations('badri');
    assert.ok(res1.some((l) => l.name === 'Badrinath'));

    const res2 = searchLocations('dehra');
    assert.ok(res2.some((l) => l.name === 'Dehradun'));

    const res3 = searchLocations('muss');
    assert.ok(res3.some((l) => l.name === 'Mussoorie'));
  });

  it('7. should handle whitespace gracefully', () => {
    const res = searchLocations('   kedarnath   ');
    assert.ok(res.length > 0);
    assert.strictEqual(res[0].id, 'kedarnath');
  });

  it('8. should match known aliases', () => {
    const res1 = searchLocations('Queen of the Hills');
    assert.ok(res1.some((l) => l.id === 'mussoorie'));

    const res2 = searchLocations('Last Indian Village');
    assert.ok(res2.some((l) => l.id === 'mana-village'));

    const res3 = searchLocations('Switzerland of India');
    assert.ok(res3.some((l) => l.id === 'kausani'));
  });

  it('9. should return empty array for empty, whitespace, or non-matching queries', () => {
    assert.deepStrictEqual(searchLocations(''), []);
    assert.deepStrictEqual(searchLocations('   '), []);
    assert.deepStrictEqual(searchLocations('xyz_nonexistent_place_123'), []);
  });

  it('10. should respect result limit parameter', () => {
    const res = searchLocations('a', 3);
    assert.ok(res.length <= 3);
  });
});

describe('Route Validation & Geographic Utilities', () => {
  const dehradun = getLocationById('dehradun')!;
  const badrinath = getLocationById('badrinath')!;

  it('11. should validate valid distinct origin and destination', () => {
    const result = validateRouteSelection(dehradun, badrinath);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.error, undefined);
  });

  it('12. should reject when origin is missing', () => {
    const result = validateRouteSelection(null, badrinath);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'Please select a starting location.');
  });

  it('13. should reject when destination is missing', () => {
    const result = validateRouteSelection(dehradun, null);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'Please select a destination.');
  });

  it('14. should reject identical origin and destination (same ID)', () => {
    const result = validateRouteSelection(dehradun, dehradun);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'Start and destination must be different locations.');
  });

  it('15. should reject identical or near-identical coordinates (< 100 meters)', () => {
    const point1: LocationPoint = {
      id: 'pt1',
      name: 'Point 1',
      latitude: 30.3165,
      longitude: 78.0322,
      state: 'Uttarakhand',
      category: 'OTHER',
      source: 'custom',
    };
    const point2: LocationPoint = {
      id: 'pt2',
      name: 'Point 2',
      latitude: 30.31651,
      longitude: 78.03221,
      state: 'Uttarakhand',
      category: 'OTHER',
      source: 'custom',
    };
    const result = validateRouteSelection(point1, point2);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'Start and destination are identical geographic coordinates.');
  });

  it('16. should reject invalid or corrupt coordinate numbers', () => {
    const corruptPoint: LocationPoint = {
      id: 'corrupt',
      name: 'Corrupt Point',
      latitude: 120.0, // Invalid latitude > 90
      longitude: 78.0,
      state: 'Uttarakhand',
      category: 'OTHER',
      source: 'custom',
    };
    const result = validateRouteSelection(corruptPoint, badrinath);
    assert.strictEqual(result.isValid, false);
    assert.strictEqual(result.error, 'Start location has invalid geographic coordinates.');
  });

  it('17. should compute accurate Haversine distance between Rishikesh and Joshimath', () => {
    const rishikesh = getLocationById('rishikesh')!;
    const joshimath = getLocationById('joshimath')!;
    const dist = computeDistanceKm(
      rishikesh.latitude,
      rishikesh.longitude,
      joshimath.latitude,
      joshimath.longitude
    );
    // Great circle chord distance between Rishikesh and Joshimath is ~135-140 km
    assert.ok(dist > 130 && dist < 145, `Unexpected distance: ${dist} km`);
  });

  it('18. should format coordinates with cardinal notation', () => {
    const formatted = formatCoordinates(30.3165, 78.0322);
    assert.strictEqual(formatted, '30.3165° N, 78.0322° E');
  });

  it('19. should synthesize custom LocationPoint from coordinates', () => {
    const custom = createLocationFromCoordinates(30.5, 79.2, 'Custom Ridge', 'map_click');
    assert.strictEqual(custom.latitude, 30.5);
    assert.strictEqual(custom.longitude, 79.2);
    assert.strictEqual(custom.name, 'Custom Ridge');
    assert.strictEqual(custom.source, 'map_click');
    assert.ok(custom.id.startsWith('map-'));
  });
});

describe('Browser Geolocation Engine Mocking', () => {
  it('20. should resolve LiveLocation on successful GPS position acquisition', async () => {
    const mockGeolocation = {
      getCurrentPosition: (success: (pos: GeolocationPosition) => void) => {
        success({
          coords: {
            latitude: 30.32,
            longitude: 78.04,
            accuracy: 15.4,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          } as unknown as GeolocationCoordinates,
          timestamp: 1700000000000,
        } as unknown as GeolocationPosition);
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as unknown as Geolocation;

    const loc = await getCurrentBrowserLocation(undefined, mockGeolocation);
    assert.strictEqual(loc.latitude, 30.32);
    assert.strictEqual(loc.longitude, 78.04);
    assert.strictEqual(loc.accuracyMeters, 15);
    assert.strictEqual(loc.timestamp, 1700000000000);
  });

  it('21. should reject with clear error message when user denies permission', async () => {
    const mockGeolocation = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: GeolocationPositionError) => void
      ) => {
        error({
          code: 1, // PERMISSION_DENIED
          message: 'User denied Geolocation',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as unknown as Geolocation;

    await assert.rejects(
      async () => {
        await getCurrentBrowserLocation(undefined, mockGeolocation);
      },
      /Location permission was denied/
    );
  });

  it('22. should reject when position is unavailable', async () => {
    const mockGeolocation = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: GeolocationPositionError) => void
      ) => {
        error({
          code: 2, // POSITION_UNAVAILABLE
          message: 'Position unavailable',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as unknown as Geolocation;

    await assert.rejects(
      async () => {
        await getCurrentBrowserLocation(undefined, mockGeolocation);
      },
      /Unable to determine your location/
    );
  });

  it('23. should reject when geolocation request times out', async () => {
    const mockGeolocation = {
      getCurrentPosition: (
        _success: unknown,
        error: (err: GeolocationPositionError) => void
      ) => {
        error({
          code: 3, // TIMEOUT
          message: 'Timeout expired',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
      watchPosition: () => 0,
      clearWatch: () => {},
    } as unknown as Geolocation;

    await assert.rejects(
      async () => {
        await getCurrentBrowserLocation(undefined, mockGeolocation);
      },
      /Location request timed out/
    );
  });
});
