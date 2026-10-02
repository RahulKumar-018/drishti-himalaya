import React from 'react';
import clsx from 'clsx';
import { Clock, MapPin, ShieldAlert, ArrowRight } from 'lucide-react';
import { Badge } from '../common/Badge';
import { RiskLevel } from '../../services/risk/types';
import './RecentEventsList.css';

export interface HazardIncident {
  id: string;
  title: string;
  location: string;
  timestamp: string;
  severity: RiskLevel;
  category: 'Landslide' | 'Cloudburst' | 'Rockfall' | 'Road Subsidence' | 'Flash Flood';
  description: string;
  responseStatus: 'CLEARED' | 'ACTIVE_MONITORING' | 'CIVIL_RESPONSE_DEPLOYED';
}

export const RECENT_INCIDENTS_DATA: HazardIncident[] = [
  {
    id: 'inc-01',
    title: 'Debris Flow Triggered Near Birahi Confluence',
    location: 'NH-7 Km 138, Birahi Bend (Chamoli)',
    timestamp: '42 mins ago',
    severity: 'HIGH',
    category: 'Landslide',
    description:
      'Continuous 18mm/h precipitation saturated weathered limestone scree, releasing ~250m³ debris onto road shoulder. BRO clearance underway.',
    responseStatus: 'CIVIL_RESPONSE_DEPLOYED',
  },
  {
    id: 'inc-02',
    title: 'Subsidence Monitoring Alert along Upper Joshimath',
    location: 'NH-7 Km 182, Marwari Sector',
    timestamp: '2 hours ago',
    severity: 'SEVERE',
    category: 'Road Subsidence',
    description:
      'Infiltration from upper slopes triggered displacement sensors. Heavy vehicular transit diverted via lower bypass road.',
    responseStatus: 'ACTIVE_MONITORING',
  },
  {
    id: 'inc-03',
    title: 'Isolated Rockfall Cleared Near Sirobagarh',
    location: 'NH-7 Km 88, Srinagar – Rudraprayag',
    timestamp: '4 hours ago',
    severity: 'MODERATE',
    category: 'Rockfall',
    description:
      'Pre-monsoon boulder detachment cleared by local highway maintenance crew. Traffic moving with 20 km/h advisory speed limit.',
    responseStatus: 'CLEARED',
  },
  {
    id: 'inc-04',
    title: 'Elevated Alaknanda River Discharge Warning',
    location: 'Rudraprayag Sangam Hydrometric Post',
    timestamp: '6 hours ago',
    severity: 'MODERATE',
    category: 'Flash Flood',
    description:
      'Upstream glacier melt and local cloudburst caused 1.8m surge at Mandakini-Alaknanda confluence. Low-lying ghats cordoned.',
    responseStatus: 'ACTIVE_MONITORING',
  },
];

export interface RecentEventsListProps {
  incidents?: HazardIncident[];
  onViewAll?: () => void;
  onSelectIncident?: (incident: HazardIncident) => void;
  className?: string;
}

export const RecentEventsList: React.FC<RecentEventsListProps> = ({
  incidents = RECENT_INCIDENTS_DATA,
  onViewAll,
  onSelectIncident,
  className,
}) => {
  const getBadgeVariant = (severity: RiskLevel) => {
    switch (severity) {
      case 'LOW':
        return 'low';
      case 'MODERATE':
        return 'moderate';
      case 'HIGH':
        return 'high';
      case 'SEVERE':
        return 'severe';
      default:
        return 'default';
    }
  };

  return (
    <div className={clsx('dh-recent-events', className)}>
      <div className="dh-recent-events__header">
        <div className="dh-recent-events__title-lockup">
          <ShieldAlert size={14} className="dh-recent-events__title-icon" />
          <h3 className="dh-recent-events__title">RECENT GEOTECHNICAL EVENTS</h3>
        </div>
        {onViewAll && (
          <button
            type="button"
            className="dh-recent-events__view-all-btn"
            onClick={onViewAll}
          >
            <span>View All Bulletins</span>
            <ArrowRight size={11} />
          </button>
        )}
      </div>

      <div className="dh-recent-events__list">
        {incidents.map((item) => (
          <div
            key={item.id}
            className={clsx('dh-recent-events__item', {
              'dh-recent-events__item--clickable': Boolean(onSelectIncident),
            })}
            onClick={() => onSelectIncident?.(item)}
          >
            <div className="dh-recent-events__item-top">
              <div className="dh-recent-events__tags">
                <Badge variant={getBadgeVariant(item.severity)} size="sm">
                  {item.severity}
                </Badge>
                <span className="dh-recent-events__cat">{item.category}</span>
              </div>
              <div className="dh-recent-events__time">
                <Clock size={11} />
                <span>{item.timestamp}</span>
              </div>
            </div>

            <h4 className="dh-recent-events__item-title">{item.title}</h4>

            <div className="dh-recent-events__item-location">
              <MapPin size={11} />
              <span>{item.location}</span>
            </div>

            <p className="dh-recent-events__item-desc">{item.description}</p>

            <div className="dh-recent-events__item-status">
              <span className="dh-recent-events__status-label">Status:</span>
              <span className="dh-recent-events__status-val">
                {item.responseStatus.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
