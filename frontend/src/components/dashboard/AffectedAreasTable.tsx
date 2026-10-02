import React from 'react';
import clsx from 'clsx';
import { MapPin } from 'lucide-react';
import { Badge } from '../common/Badge';
import { RiskLevel } from '../../services/risk/types';
import './AffectedAreasTable.css';

export interface CorridorSector {
  id: string;
  name: string;
  highway: string;
  district: string;
  elevationM: number;
  riskLevel: RiskLevel;
  riskScore: number;
  hazardType: string;
  operationalStatus: 'NORMAL' | 'CAUTION' | 'RESTRICTED' | 'STANDBY';
  coordinates: [number, number];
}

export const CORRIDOR_SECTORS_DATA: CorridorSector[] = [
  {
    id: 'sec-01',
    name: 'Rishikesh – Byasi Sector',
    highway: 'NH-7',
    district: 'Tehri Garhwal',
    elevationM: 372,
    riskLevel: 'LOW',
    riskScore: 14.2,
    hazardType: 'Foothill fluvial stability',
    operationalStatus: 'NORMAL',
    coordinates: [30.1033, 78.2947],
  },
  {
    id: 'sec-02',
    name: 'Devprayag Confluence Gorge',
    highway: 'NH-7',
    district: 'Pauri Garhwal',
    elevationM: 475,
    riskLevel: 'LOW',
    riskScore: 21.8,
    hazardType: 'Cut-slope joint fractures',
    operationalStatus: 'NORMAL',
    coordinates: [30.1459, 78.5986],
  },
  {
    id: 'sec-03',
    name: 'Srinagar Valley Alignment',
    highway: 'NH-7',
    district: 'Pauri Garhwal',
    elevationM: 560,
    riskLevel: 'LOW',
    riskScore: 18.5,
    hazardType: 'Broad valley alluvial terrace',
    operationalStatus: 'NORMAL',
    coordinates: [30.2223, 78.7844],
  },
  {
    id: 'sec-04',
    name: 'Rudraprayag Sangam Choke',
    highway: 'NH-7 / NH-107',
    district: 'Rudraprayag',
    elevationM: 610,
    riskLevel: 'MODERATE',
    riskScore: 38.6,
    hazardType: 'Steep phyllite bedrock gorge',
    operationalStatus: 'CAUTION',
    coordinates: [30.2858, 78.9814],
  },
  {
    id: 'sec-05',
    name: 'Karnaprayag – Langasu',
    highway: 'NH-7',
    district: 'Chamoli',
    elevationM: 780,
    riskLevel: 'MODERATE',
    riskScore: 42.1,
    hazardType: 'Pindar river cut-slope erosion',
    operationalStatus: 'CAUTION',
    coordinates: [30.2588, 79.2185],
  },
  {
    id: 'sec-06',
    name: 'Chamoli – Birahi Bend',
    highway: 'NH-7',
    district: 'Chamoli',
    elevationM: 1040,
    riskLevel: 'HIGH',
    riskScore: 58.4,
    hazardType: 'Historical Birahi landslide scar zone',
    operationalStatus: 'RESTRICTED',
    coordinates: [30.4072, 79.3364],
  },
  {
    id: 'sec-07',
    name: 'Pipalkoti – Helang Gorge',
    highway: 'NH-7',
    district: 'Chamoli',
    elevationM: 1340,
    riskLevel: 'HIGH',
    riskScore: 66.2,
    hazardType: 'Severe tectonic shear & active talus',
    operationalStatus: 'RESTRICTED',
    coordinates: [30.4293, 79.4312],
  },
  {
    id: 'sec-08',
    name: 'Joshimath Escarpment Corridor',
    highway: 'NH-7',
    district: 'Chamoli',
    elevationM: 1890,
    riskLevel: 'SEVERE',
    riskScore: 78.9,
    hazardType: 'Subsidence moraine debris & runoff',
    operationalStatus: 'RESTRICTED',
    coordinates: [30.5526, 79.5684],
  },
];

export interface AffectedAreasTableProps {
  sectors?: CorridorSector[];
  onSelectSector?: (sector: CorridorSector) => void;
  className?: string;
}

export const AffectedAreasTable: React.FC<AffectedAreasTableProps> = ({
  sectors = CORRIDOR_SECTORS_DATA,
  onSelectSector,
  className,
}) => {
  const getBadgeVariant = (level: RiskLevel) => {
    switch (level) {
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

  const getStatusBadge = (status: CorridorSector['operationalStatus']) => {
    switch (status) {
      case 'NORMAL':
        return (
          <span className="dh-affected-table__status dh-affected-table__status--normal">
            CLEAR
          </span>
        );
      case 'CAUTION':
        return (
          <span className="dh-affected-table__status dh-affected-table__status--caution">
            CAUTION
          </span>
        );
      case 'RESTRICTED':
        return (
          <span className="dh-affected-table__status dh-affected-table__status--restricted">
            ESCORTED
          </span>
        );
      case 'STANDBY':
        return (
          <span className="dh-affected-table__status dh-affected-table__status--standby">
            STANDBY
          </span>
        );
    }
  };

  return (
    <div className={clsx('dh-affected-table-wrapper', className)}>
      <div className="dh-affected-table__header">
        <div>
          <h3 className="dh-affected-table__title">AFFECTED CORRIDOR SECTORS</h3>
          <span className="dh-affected-table__subtitle">
            Garhwal Himalayan Transit Stations &amp; Hazard Vulnerability
          </span>
        </div>
        <div className="dh-affected-table__count-pill">
          {sectors.length} Monitored Sectors
        </div>
      </div>

      <div className="dh-affected-table__scroll">
        <table className="dh-affected-table">
          <thead>
            <tr>
              <th>Sector &amp; Highway</th>
              <th>District</th>
              <th>Elevation</th>
              <th>Hazard Condition</th>
              <th>Risk Score</th>
              <th>Advisory</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((sec) => (
              <tr key={sec.id}>
                <td>
                  <div className="dh-affected-table__sector-name">
                    <span className="dh-affected-table__name">{sec.name}</span>
                    <span className="dh-affected-table__hwy-code">{sec.highway}</span>
                  </div>
                </td>
                <td className="dh-affected-table__district">{sec.district}</td>
                <td>
                  <span className="dh-affected-table__mono">{sec.elevationM} m</span>
                </td>
                <td className="dh-affected-table__hazard">{sec.hazardType}</td>
                <td>
                  <Badge variant={getBadgeVariant(sec.riskLevel)} size="sm">
                    {sec.riskScore.toFixed(1)} · {sec.riskLevel}
                  </Badge>
                </td>
                <td>{getStatusBadge(sec.operationalStatus)}</td>
                <td>
                  {onSelectSector && (
                    <button
                      type="button"
                      className="dh-affected-table__action-btn"
                      onClick={() => onSelectSector(sec)}
                      title={`Inspect ${sec.name} on Interactive Map`}
                    >
                      <MapPin size={11} />
                      <span>Map</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
