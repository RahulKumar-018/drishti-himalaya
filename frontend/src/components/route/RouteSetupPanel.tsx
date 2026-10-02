/**
 * ==============================================================================
 * DRISHTI-HIMALAYA - ROUTE SETUP PANEL
 * Phase 1: Dynamic Location & Destination Selection System
 * ==============================================================================
 */

import React from 'react';
import clsx from 'clsx';
import {
  Navigation,
  MapPin,
  ArrowUpDown,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Crosshair,
  Info,
} from 'lucide-react';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { LocationSearchInput } from './LocationSearchInput';
import { LocationPoint } from '../../types/location';
import { UseLocationSelectionReturn } from '../../hooks/useLocationSelection';
import { getPopularDestinations } from '../../services/location/locationService';
import './RouteSetupPanel.css';

export interface RouteSetupPanelProps {
  locationSelection: UseLocationSelectionReturn;
  className?: string;
}

export const RouteSetupPanel: React.FC<RouteSetupPanelProps> = ({
  locationSelection,
  className,
}) => {
  const {
    origin,
    destination,
    liveLocation,
    selectionMode,
    isLocating,
    locationError,
    validationError,
    isRouteReady,
    activeRoute,
    isRouting,
    routingError,
    retryRouting,
    setOrigin,
    setDestination,
    swapLocations,
    useLiveLocationAsOrigin,
    startMapSelection,
    cancelMapSelection,
    analyzeRoute,
    resetSelection,
  } = locationSelection;

  const popularDestinations = getPopularDestinations();

  const handleChipClick = (point: LocationPoint) => {
    setDestination(point);
  };

  const handleAnalyzeClick = () => {
    analyzeRoute();
  };

  return (
    <Card
      variant="elevated"
      title="Route Setup"
      subtitle="Choose start location and destination"
      headerAction={
        <Badge variant="accent" size="sm">
          PHASE 2: REAL ROAD ROUTING
        </Badge>
      }
      className={clsx('dh-route-setup', className)}
    >
      <div className="dh-route-setup__body">
        {/* Helper Instructions */}
        <p className="dh-route-setup__intro">
          Select your departure point and destination to prepare a Himalayan corridor risk assessment.
        </p>

        {/* 1. START LOCATION (ORIGIN) */}
        <div className="dh-route-setup__section">
          <div className="dh-route-setup__section-header">
            <span className="dh-route-setup__section-title">
              <span className="dh-route-setup__marker-indicator dh-route-setup__marker-indicator--start" />
              START LOCATION
            </span>
            {origin && (
              <span className="dh-route-setup__coord-label">
                {origin.latitude.toFixed(4)}° N, {origin.longitude.toFixed(4)}° E
              </span>
            )}
          </div>

          <LocationSearchInput
            id="origin-search"
            placeholder="Search starting city, town, or node..."
            selectedLocation={origin}
            onSelectLocation={setOrigin}
            onClear={() => setOrigin(null)}
          />

          {/* Start Location Action Buttons */}
          <div className="dh-route-setup__btn-row">
            <Button
              variant="secondary"
              size="sm"
              loading={isLocating}
              loadingText="LOCATING..."
              leadingIcon={!isLocating ? <Navigation size={12} /> : undefined}
              onClick={useLiveLocationAsOrigin}
              className="dh-route-setup__action-btn"
              title="Use browser GPS geolocation"
            >
              USE MY LOCATION
            </Button>

            <Button
              variant={selectionMode === 'origin' ? 'primary' : 'ghost'}
              size="sm"
              leadingIcon={<Crosshair size={12} />}
              onClick={() => {
                if (selectionMode === 'origin') {
                  cancelMapSelection();
                } else {
                  startMapSelection('origin');
                }
              }}
              className={clsx('dh-route-setup__action-btn', {
                'dh-route-setup__action-btn--active': selectionMode === 'origin',
              })}
              title="Pick origin directly by clicking the map"
            >
              {selectionMode === 'origin' ? 'CANCEL MAP PICK' : 'PICK ON MAP'}
            </Button>
          </div>

          {/* GPS Accuracy Badge */}
          {liveLocation && origin?.source === 'live' && (
            <div className="dh-route-setup__gps-info" role="status">
              <span className="dh-route-setup__gps-dot" aria-hidden="true" />
              <span>GPS Accuracy: ±{liveLocation.accuracyMeters} meters (Local State Only)</span>
            </div>
          )}
        </div>

        {/* 2. SWAP CONTROL */}
        <div className="dh-route-setup__swap-row">
          <button
            type="button"
            className="dh-route-setup__swap-btn"
            onClick={swapLocations}
            title="Swap origin and destination"
            aria-label="Swap origin and destination"
          >
            <ArrowUpDown size={14} />
          </button>
        </div>

        {/* 3. DESTINATION */}
        <div className="dh-route-setup__section">
          <div className="dh-route-setup__section-header">
            <span className="dh-route-setup__section-title">
              <span className="dh-route-setup__marker-indicator dh-route-setup__marker-indicator--dest" />
              DESTINATION
            </span>
            {destination && (
              <span className="dh-route-setup__coord-label">
                {destination.latitude.toFixed(4)}° N, {destination.longitude.toFixed(4)}° E
              </span>
            )}
          </div>

          <LocationSearchInput
            id="destination-search"
            placeholder="Search destination shrine, resort, or town..."
            selectedLocation={destination}
            onSelectLocation={setDestination}
            onClear={() => setDestination(null)}
          />

          <div className="dh-route-setup__btn-row">
            <Button
              variant={selectionMode === 'destination' ? 'primary' : 'ghost'}
              size="sm"
              leadingIcon={<Crosshair size={12} />}
              onClick={() => {
                if (selectionMode === 'destination') {
                  cancelMapSelection();
                } else {
                  startMapSelection('destination');
                }
              }}
              className={clsx('dh-route-setup__action-btn', {
                'dh-route-setup__action-btn--active': selectionMode === 'destination',
              })}
              title="Pick destination directly by clicking the map"
            >
              {selectionMode === 'destination' ? 'CANCEL MAP PICK' : 'PICK ON MAP'}
            </Button>
          </div>
        </div>

        {/* 4. POPULAR UTTARAKHAND DESTINATION CHIPS */}
        <div className="dh-route-setup__chips-section">
          <span className="dh-route-setup__chips-label">
            POPULAR UTTARAKHAND DESTINATIONS
          </span>
          <div className="dh-route-setup__chips-grid" role="group" aria-label="Popular destinations">
            {popularDestinations.map((loc) => {
              const isSelected = destination?.id === loc.id;
              return (
                <button
                  key={loc.id}
                  type="button"
                  onClick={() => handleChipClick(loc)}
                  className={clsx('dh-route-setup__chip', {
                    'dh-route-setup__chip--selected': isSelected,
                  })}
                  title={`Select ${loc.name} as destination`}
                >
                  <MapPin size={10} className="dh-route-setup__chip-icon" aria-hidden="true" />
                  <span>{loc.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. SELECTION MODE BANNER (When Picking on Map) */}
        {selectionMode && (
          <div className="dh-route-setup__selection-notice" role="status">
            <Crosshair size={14} className="dh-route-setup__selection-icon" aria-hidden="true" />
            <div className="dh-route-setup__selection-text">
              <strong>Map Selection Active:</strong> Click anywhere on the map to place a pin for{' '}
              {selectionMode === 'origin' ? 'Start Location' : 'Destination'}, then confirm.
            </div>
            <button
              type="button"
              className="dh-route-setup__cancel-mode-btn"
              onClick={cancelMapSelection}
            >
              Cancel
            </button>
          </div>
        )}

        {/* 6. GEOLOCATION / SYSTEM ERROR ALERT */}
        {locationError && (
          <div className="dh-route-setup__alert dh-route-setup__alert--error" role="alert">
            <AlertTriangle size={14} className="dh-route-setup__alert-icon" aria-hidden="true" />
            <span className="dh-route-setup__alert-text">{locationError}</span>
          </div>
        )}

        {/* 7. VALIDATION ERROR ALERT */}
        {validationError && (
          <div className="dh-route-setup__alert dh-route-setup__alert--warning" role="alert">
            <AlertTriangle size={14} className="dh-route-setup__alert-icon" aria-hidden="true" />
            <span className="dh-route-setup__alert-text">{validationError}</span>
          </div>
        )}

        {/* 7b. ROUTING IN PROGRESS NOTICE */}
        {isRouting && (
          <div className="dh-route-setup__alert dh-route-setup__alert--loading" role="status">
            <span className="dh-route-setup__spinner" aria-hidden="true" />
            <span className="dh-route-setup__alert-text">
              Calculating mountain road geometry via OSRM (OpenStreetMap)...
            </span>
          </div>
        )}

        {/* 7c. ROUTING ERROR ALERT (Road Route Unavailable) */}
        {routingError && !isRouting && (
          <div className="dh-route-setup__alert dh-route-setup__alert--error" role="alert">
            <AlertTriangle size={14} className="dh-route-setup__alert-icon" aria-hidden="true" />
            <div className="dh-route-setup__alert-content">
              <span className="dh-route-setup__alert-title">Road Route Unavailable</span>
              <span className="dh-route-setup__alert-text">{routingError}</span>
              <button
                type="button"
                className="dh-route-setup__retry-btn"
                onClick={retryRouting}
              >
                Retry Routing
              </button>
            </div>
          </div>
        )}

        {/* 8. PHASE 2 REAL ROAD ROUTE READY CARD */}
        {activeRoute && activeRoute.status === 'success' && origin && destination && (
          <div className="dh-route-setup__ready-card" role="status">
            <div className="dh-route-setup__ready-header">
              <CheckCircle2 size={16} className="dh-route-setup__ready-icon" aria-hidden="true" />
              <span className="dh-route-setup__ready-title">ROAD ROUTE READY</span>
              <span className="dh-route-setup__ready-provider">{activeRoute.provider}</span>
            </div>
            <div className="dh-route-setup__ready-pair">
              <span className="dh-route-setup__ready-node">{origin.name}</span>
              <ArrowRight size={13} className="dh-route-setup__ready-arrow" aria-hidden="true" />
              <span className="dh-route-setup__ready-node">{destination.name}</span>
            </div>

            <div className="dh-route-setup__route-metrics">
              <div className="dh-route-setup__metric-item">
                <span className="dh-route-setup__metric-k">Road Distance</span>
                <span className="dh-route-setup__metric-v dh-route-setup__metric-v--accent">
                  {activeRoute.metrics.formattedDistance}
                </span>
              </div>
              <div className="dh-route-setup__metric-item">
                <span className="dh-route-setup__metric-k">Est. Duration</span>
                <span className="dh-route-setup__metric-v">
                  {activeRoute.metrics.formattedDuration}
                </span>
              </div>
              <div className="dh-route-setup__metric-item">
                <span className="dh-route-setup__metric-k">Elevation Profile</span>
                <span className="dh-route-setup__metric-v">
                  {activeRoute.metrics.elevationMin !== null
                    ? `${activeRoute.metrics.elevationMin}m → ${activeRoute.metrics.elevationMax}m`
                    : 'Unavailable'}
                </span>
              </div>
              <div className="dh-route-setup__metric-item">
                <span className="dh-route-setup__metric-k">Peak Gradient</span>
                <span className="dh-route-setup__metric-v">
                  {activeRoute.metrics.peakGradientDegrees !== null
                    ? `${activeRoute.metrics.peakGradientDegrees}° (${activeRoute.metrics.peakGradientPercent}%)`
                    : '—'}
                </span>
              </div>
            </div>

            <div className="dh-route-setup__route-footer">
              <span>{activeRoute.metrics.sampleCount} geodesic samples (~500m spacing)</span>
              <span>DEM Quality: {activeRoute.metrics.elevationCoverageRatio || 'Unavailable'}</span>
            </div>
          </div>
        )}

        {/* 8b. ROUTE INPUT READY (Fallback / Pre-Analysis) */}
        {!activeRoute && isRouteReady && origin && destination && !isRouting && !routingError && (
          <div className="dh-route-setup__ready-card" role="status">
            <div className="dh-route-setup__ready-header">
              <CheckCircle2 size={16} className="dh-route-setup__ready-icon" aria-hidden="true" />
              <span className="dh-route-setup__ready-title">ROUTE INPUT READY</span>
            </div>
            <div className="dh-route-setup__ready-pair">
              <span className="dh-route-setup__ready-node">{origin.name}</span>
              <ArrowRight size={13} className="dh-route-setup__ready-arrow" aria-hidden="true" />
              <span className="dh-route-setup__ready-node">{destination.name}</span>
            </div>
            <p className="dh-route-setup__ready-desc">
              Origin and destination coordinates confirmed. Click Analyze Route to calculate physical road geometry.
            </p>
          </div>
        )}

        {/* 9. PRIMARY ACTIONS */}
        <div className="dh-route-setup__actions">
          <Button
            variant="primary"
            size="md"
            onClick={handleAnalyzeClick}
            loading={isRouting}
            loadingText="ROUTING..."
            trailingIcon={!isRouting ? <ArrowRight size={14} /> : undefined}
            className="dh-route-setup__analyze-btn"
          >
            {activeRoute ? 'RE-ANALYZE ROAD ROUTE' : 'ANALYZE ROUTE'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetSelection}
            leadingIcon={<RotateCcw size={12} />}
            className="dh-route-setup__reset-btn"
            title="Reset to default pilot corridor"
          >
            RESET ROUTE INPUT
          </Button>
        </div>

        {/* 10. TECHNICAL LIMITATION / METHODOLOGY NOTE */}
        <div className="dh-route-setup__note" role="note">
          <Info size={13} className="dh-route-setup__note-icon" aria-hidden="true" />
          <p className="dh-route-setup__note-text">
            Phase 2 delivers real drivable road routing via OSRM with geodesic ~500m sampling and Copernicus DEM elevation profiling. Routing provides road geometry and navigation metrics. It does not predict landslides or evaluate geotechnical slope stability.
          </p>
        </div>
      </div>
    </Card>
  );
};
