import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Search, BellRing } from 'lucide-react';
import { AlertCard, HazardAlert } from './AlertCard';
import { EmptyState } from '../common/EmptyState';
import './AlertFeed.css';

export const DEMO_ALERTS: HazardAlert[] = [
  {
    id: 'alt-01',
    code: 'DH-ALT-7041',
    severity: 'SEVERE',
    category: 'Road Subsidence',
    title: 'Rapid Talus Displacement & Roadbed Cracking',
    location: 'NH-7 Km 184 (Marwari – Joshimath)',
    coordinates: [30.5526, 79.5684],
    timestamp: '18 mins ago',
    issuedAtIso: '2026-10-02T13:45:00Z',
    triggerCondition: 'Cumulative 72h antecedent rainfall 112mm; slope sensor displacement > 12mm/hr',
    recommendedAction: 'Halt all heavy commercial vehicles. Divert light traffic via lower Helang bypass. SDRF station at Joshimath mobilized.',
    affectedKmMarker: 'Km 182.0 to 186.5',
    isActive: true,
  },
  {
    id: 'alt-02',
    code: 'DH-ALT-7042',
    severity: 'HIGH',
    category: 'Landslide Scar',
    title: 'Birahi Gorge Historical Scar Saturated',
    location: 'NH-7 Km 138 (Birahi Bend, Chamoli)',
    coordinates: [30.4072, 79.3364],
    timestamp: '1 hour ago',
    issuedAtIso: '2026-10-02T13:00:00Z',
    triggerCondition: 'Current precipitation intensity 28.5 mm/h exceeds 25 mm/h runoff flash threshold',
    recommendedAction: 'Mandatory single-lane convoy movement under pilot escort. Spotters stationed at ridge top.',
    affectedKmMarker: 'Km 137.2 to 139.8',
    isActive: true,
  },
  {
    id: 'alt-03',
    code: 'DH-ALT-7043',
    severity: 'HIGH',
    category: 'Flash Flood',
    title: 'Surge In Mandakini-Alaknanda River Confluence',
    location: 'Rudraprayag Sangam Hydrometric Post',
    coordinates: [30.2858, 78.9814],
    timestamp: '2 hours ago',
    issuedAtIso: '2026-10-02T12:00:00Z',
    triggerCondition: 'Hydraulic discharge spike: 1.6m above monsoon average baseline',
    recommendedAction: 'All riverside staging points and ghat parking evacuated. Highway bridge monitored for debris impact.',
    affectedKmMarker: 'Km 76.0 to 78.5',
    isActive: true,
  },
  {
    id: 'alt-04',
    code: 'DH-ALT-7044',
    severity: 'MODERATE',
    category: 'Rockfall',
    title: 'Intermittent Rolling Debris Hazard Near Sirobagarh',
    location: 'NH-7 Km 88 (Srinagar – Rudraprayag)',
    coordinates: [30.2450, 78.8920],
    timestamp: '3.5 hours ago',
    issuedAtIso: '2026-10-02T10:30:00Z',
    triggerCondition: 'Moderate rainfall with thermal freeze-thaw loosening weathered quartzite joints',
    recommendedAction: 'Speed limit restricted to 25 km/h. Avoid stopping along overhang cliff sections.',
    affectedKmMarker: 'Km 87.0 to 89.2',
    isActive: true,
  },
  {
    id: 'alt-05',
    code: 'DH-ALT-7045',
    severity: 'ADVISORY',
    category: 'Intense Rainfall',
    title: 'Pre-Monsoon Convective Cloud Cluster Moving East',
    location: 'Garhwal Foothills (Rishikesh – Devprayag)',
    coordinates: [30.1459, 78.5986],
    timestamp: '5 hours ago',
    issuedAtIso: '2026-10-02T09:00:00Z',
    triggerCondition: 'Open-Meteo precipitation probability elevated to 75% for next 6-hour window',
    recommendedAction: 'Pilgrimage convoys advised to clear Devprayag pass prior to nightfall.',
    affectedKmMarker: 'Km 12.0 to 45.0',
    isActive: true,
  },
];

export interface AlertFeedProps {
  alerts?: HazardAlert[];
  onLocateOnMap?: (alert: HazardAlert) => void;
  className?: string;
}

export const AlertFeed: React.FC<AlertFeedProps> = ({
  alerts = DEMO_ALERTS,
  onLocateOnMap,
  className,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredAlerts = useMemo(() => {
    return alerts.filter((item) => {
      const matchesSeverity =
        filterSeverity === 'ALL' || item.severity === filterSeverity;
      const matchesQuery =
        searchQuery === '' ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.code.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSeverity && matchesQuery;
    });
  }, [alerts, filterSeverity, searchQuery]);

  const severityCounts = useMemo(() => {
    return {
      ALL: alerts.length,
      SEVERE: alerts.filter((a) => a.severity === 'SEVERE').length,
      HIGH: alerts.filter((a) => a.severity === 'HIGH').length,
      MODERATE: alerts.filter((a) => a.severity === 'MODERATE').length,
      ADVISORY: alerts.filter((a) => a.severity === 'ADVISORY').length,
    };
  }, [alerts]);

  return (
    <div className={clsx('dh-alert-feed', className)}>
      {/* Controls Bar: Search & Severity Filter */}
      <div className="dh-alert-feed__controls">
        <div className="dh-alert-feed__search-wrapper">
          <Search size={14} className="dh-alert-feed__search-icon" aria-hidden="true" />
          <input
            type="text"
            className="dh-alert-feed__search-input"
            placeholder="Search alerts by sector, code, or hazard..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter alerts by search keyword"
          />
        </div>

        {/* Severity Filter Tabs */}
        <div className="dh-alert-feed__tabs" role="tablist">
          {[
            { key: 'ALL', label: 'All Alerts', count: severityCounts.ALL },
            { key: 'SEVERE', label: 'Severe', count: severityCounts.SEVERE, color: 'var(--risk-severe)' },
            { key: 'HIGH', label: 'High', count: severityCounts.HIGH, color: 'var(--risk-high)' },
            { key: 'MODERATE', label: 'Moderate', count: severityCounts.MODERATE, color: 'var(--risk-moderate)' },
            { key: 'ADVISORY', label: 'Advisory', count: severityCounts.ADVISORY, color: 'var(--accent-primary)' },
          ].map((tab) => {
            const isActive = filterSeverity === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={clsx('dh-alert-feed__tab-btn', {
                  'dh-alert-feed__tab-btn--active': isActive,
                })}
                onClick={() => setFilterSeverity(tab.key)}
              >
                <span>{tab.label}</span>
                <span
                  className="dh-alert-feed__tab-count"
                  style={tab.color ? { color: tab.color } : undefined}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Feed List */}
      <div className="dh-alert-feed__list">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onLocateOnMap={onLocateOnMap}
            />
          ))
        ) : (
          <EmptyState
            icon={<BellRing size={28} />}
            title="No Matching Alerts"
            description="No active geotechnical or hydro-meteorological alerts match your current filter parameters."
          />
        )}
      </div>
    </div>
  );
};
