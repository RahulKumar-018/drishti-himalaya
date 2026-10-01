import React from 'react';
import clsx from 'clsx';
import { ArrowRight, MapPin } from 'lucide-react';
import './CorridorStatus.css';

export interface CorridorStatusProps {
  highwayCode?: string;
  origin?: string;
  destination?: string;
  region?: string;
  tag?: string;
  className?: string;
}

export const CorridorStatus: React.FC<CorridorStatusProps> = ({
  highwayCode = 'NH-7',
  origin = 'Rishikesh',
  destination = 'Joshimath',
  region = 'UTTARAKHAND',
  tag = 'PILOT CORRIDOR',
  className,
}) => {
  return (
    <section
      className={clsx('dh-corridor-status', className)}
      aria-label="Active Corridor Context"
    >
      <div className="dh-corridor-status__container">
        {/* Left Segment: Highway Identifier and Trajectory */}
        <div className="dh-corridor-status__route">
          <span className="dh-corridor-status__highway">{highwayCode}</span>

          <div className="dh-corridor-status__waypoints">
            <span className="dh-corridor-status__point">{origin}</span>
            <ArrowRight
              size={13}
              className="dh-corridor-status__arrow"
              aria-hidden="true"
            />
            <span className="dh-corridor-status__point">{destination}</span>
          </div>
        </div>

        {/* Right Segment: Contextual Geographic Metadata */}
        <div className="dh-corridor-status__meta">
          <div className="dh-corridor-status__region">
            <MapPin size={11} className="dh-corridor-status__pin" aria-hidden="true" />
            <span>{region}</span>
          </div>
          <span className="dh-corridor-status__divider" aria-hidden="true" />
          <span className="dh-corridor-status__tag">{tag}</span>
        </div>
      </div>
    </section>
  );
};
