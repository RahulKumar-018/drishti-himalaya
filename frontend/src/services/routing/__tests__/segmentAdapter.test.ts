/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - SEGMENT ADAPTER & VISUALIZATION TESTS
 * Verifies segment-level risk adaptation, color mapping, and data quality preservation.
 * ==============================================================================
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getSegmentColor,
  convertBackendFeatureToSegmentRisk,
  RISK_COLOR_MAP,
} from '../segmentAdapter';
import { RouteSegmentFeature } from '../../api/types';

describe('Segment Risk Color Mapping & Epistemic Honesty', () => {
  it('should map LOW risk tier to green token (#10B981)', () => {
    assert.strictEqual(getSegmentColor('LOW'), '#10B981');
    assert.strictEqual(getSegmentColor('low'), '#10B981');
  });

  it('should map MODERATE risk tier to yellow/amber token (#F59E0B)', () => {
    assert.strictEqual(getSegmentColor('MODERATE'), '#F59E0B');
  });

  it('should map HIGH risk tier to orange token (#F97316)', () => {
    assert.strictEqual(getSegmentColor('HIGH'), '#F97316');
  });

  it('should map SEVERE risk tier to red token (#EF4444)', () => {
    assert.strictEqual(getSegmentColor('SEVERE'), '#EF4444');
  });

  it('should NEVER map UNKNOWN, INDETERMINATE, or missing risk tiers to LOW', () => {
    assert.strictEqual(getSegmentColor('INDETERMINATE'), '#94A3B8');
    assert.strictEqual(getSegmentColor('UNKNOWN'), '#94A3B8');
    assert.strictEqual(getSegmentColor(null), '#94A3B8');
    assert.strictEqual(getSegmentColor(undefined), '#94A3B8');
    assert.notStrictEqual(getSegmentColor('INDETERMINATE'), RISK_COLOR_MAP.LOW);
    assert.notStrictEqual(getSegmentColor(null), RISK_COLOR_MAP.LOW);
  });

  it('should respect backend color_hex if provided', () => {
    assert.strictEqual(getSegmentColor('LOW', '#10B981'), '#10B981');
    assert.strictEqual(getSegmentColor('HIGH', '#F97316'), '#F97316');
  });
});

describe('Backend Feature to Segment Risk Conversion', () => {
  const mockFeature: RouteSegmentFeature = {
    type: 'Feature',
    id: 'seg_42',
    geometry: {
      type: 'LineString',
      coordinates: [
        [78.5028, 30.0766],
        [78.5045, 30.0782],
      ],
    },
    properties: {
      segment_index: 42,
      segment_length_m: 250.0,
      start_km: 10.5,
      end_km: 10.75,
      slope_degrees: 28.5,
      elevation_m: 780.0,
      precipitation_24h_mm: 18.2,
      p24_mm: 18.2,
      p72_mm: 35.0,
      ari_mm: 42.1,
      distance_to_historic_scar_m: 350.0,
      scar_density_1km: 2,
      is_cut_slope: null,
      segment_risk_score: 54.2,
      risk_category: 'HIGH',
      color_hex: '#F97316',
      is_risk_complete: false,
      missing_features: ['is_cut_slope'],
    },
  };

  it('should convert backend feature coordinates from [lon, lat] to Leaflet [lat, lon]', () => {
    const adapted = convertBackendFeatureToSegmentRisk(mockFeature);
    assert.strictEqual(adapted.coordinates.length, 2);
    assert.strictEqual(adapted.coordinates[0][0], 30.0766);
    assert.strictEqual(adapted.coordinates[0][1], 78.5028);
    assert.strictEqual(adapted.coordinates[1][0], 30.0782);
    assert.strictEqual(adapted.coordinates[1][1], 78.5045);
  });

  it('should preserve backend risk score, tier, and color', () => {
    const adapted = convertBackendFeatureToSegmentRisk(mockFeature);
    assert.strictEqual(adapted.riskScore, 54.2);
    assert.strictEqual(adapted.riskTier, 'HIGH');
    assert.strictEqual(adapted.colorHex, '#F97316');
  });

  it('should preserve PARTIAL status and missing features without assuming safe', () => {
    const adapted = convertBackendFeatureToSegmentRisk(mockFeature);
    assert.strictEqual(adapted.dataQualityRating, 'PARTIAL');
    assert.strictEqual(adapted.backendProperties.is_risk_complete, false);
    assert.deepStrictEqual(adapted.backendProperties.missing_features, ['is_cut_slope']);
    assert.strictEqual(adapted.backendProperties.is_cut_slope, null);
    assert.ok(adapted.disclaimer.includes('is_cut_slope'));
  });

  it('should correctly format segment identification and metrics', () => {
    const adapted = convertBackendFeatureToSegmentRisk(mockFeature);
    assert.strictEqual(adapted.id, 'seg_42');
    assert.strictEqual(adapted.index, 42);
    assert.ok(adapted.name.includes('#043'));
    assert.strictEqual(adapted.distanceKm, 0.25);
    assert.strictEqual(adapted.gradientDegrees, 28.5);
  });
});
