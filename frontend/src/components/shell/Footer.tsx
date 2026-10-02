import React from 'react';
import clsx from 'clsx';
import { Mountain, Shield, Radio, Phone } from 'lucide-react';
import './Footer.css';

export interface FooterProps {
  className?: string;
  onNavigate?: (tab: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ className, onNavigate }) => {
  return (
    <footer className={clsx('dh-footer', className)}>
      <div className="dh-footer__container">
        {/* Brand & Purpose Column */}
        <div className="dh-footer__col dh-footer__col--brand">
          <div className="dh-footer__brand-lockup">
            <div className="dh-footer__logo">
              <Mountain size={18} />
            </div>
            <div>
              <span className="dh-footer__brand-name">DRISHTI HIMALAYA</span>
              <span className="dh-footer__tagline">ROAD HAZARD DECISION SUPPORT SYSTEM</span>
            </div>
          </div>
          <p className="dh-footer__desc">
            Geospatial early warning intelligence for Himalayan highway corridors.
            Combining high-resolution Copernicus DEM terrain models, real-time Open-Meteo hydro-meteorological telemetry, and deterministic geotechnical hazard index scoring.
          </p>
          <div className="dh-footer__status-badge">
            <span className="dh-footer__status-dot" aria-hidden="true" />
            <span>Pilot Sector: NH-7 Garhwal Himalaya (Rishikesh – Joshimath)</span>
          </div>
        </div>

        {/* Quick Links Column */}
        <div className="dh-footer__col">
          <h4 className="dh-footer__col-title">Navigation</h4>
          <ul className="dh-footer__links">
            <li>
              <button type="button" onClick={() => onNavigate?.('home')} className="dh-footer__link">
                Home / Overview
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate?.('dashboard')} className="dh-footer__link">
                Risk Dashboard
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate?.('map')} className="dh-footer__link">
                Interactive Corridor Map
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate?.('risk-analysis')} className="dh-footer__link">
                Risk Factor Analysis
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate?.('alerts')} className="dh-footer__link">
                Early Warning Alerts
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate?.('about')} className="dh-footer__link">
                About &amp; Methodology
              </button>
            </li>
          </ul>
        </div>

        {/* Telemetry & Scientific Sources */}
        <div className="dh-footer__col">
          <h4 className="dh-footer__col-title">
            <Radio size={13} className="dh-footer__col-icon" />
            Telemetry Sources
          </h4>
          <ul className="dh-footer__meta-list">
            <li>
              <span className="dh-footer__meta-k">Precipitation:</span>
              <span className="dh-footer__meta-v">Open-Meteo Hourly API (Keyless)</span>
            </li>
            <li>
              <span className="dh-footer__meta-k">Elevation Model:</span>
              <span className="dh-footer__meta-v">Copernicus DEM GLO-90 (90m MSL)</span>
            </li>
            <li>
              <span className="dh-footer__meta-k">Road Routing:</span>
              <span className="dh-footer__meta-v">Open Source Routing Machine (OSRM)</span>
            </li>
            <li>
              <span className="dh-footer__meta-k">Base Maps:</span>
              <span className="dh-footer__meta-v">OpenStreetMap Contributors</span>
            </li>
            <li>
              <span className="dh-footer__meta-k">Disaggregation:</span>
              <span className="dh-footer__meta-v">250m Uniform Route Slices</span>
            </li>
          </ul>
        </div>

        {/* Emergency & Civil Protection Numbers */}
        <div className="dh-footer__col">
          <h4 className="dh-footer__col-title">
            <Phone size={13} className="dh-footer__col-icon" />
            Emergency Contacts
          </h4>
          <ul className="dh-footer__helpline-list">
            <li>
              <span className="dh-footer__helpline-name">Uttarakhand SDRF Control:</span>
              <span className="dh-footer__helpline-num">1070 / 112</span>
            </li>
            <li>
              <span className="dh-footer__helpline-name">NHAI Emergency Helpline:</span>
              <span className="dh-footer__helpline-num">1033</span>
            </li>
            <li>
              <span className="dh-footer__helpline-name">Disaster Operations Center:</span>
              <span className="dh-footer__helpline-num">0135-2710334</span>
            </li>
            <li>
              <span className="dh-footer__helpline-name">Pilgrim Assistance Cell:</span>
              <span className="dh-footer__helpline-num">1364</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Bar: Copyright & Judicial Disclaimer */}
      <div className="dh-footer__bottom">
        <div className="dh-footer__bottom-container">
          <p className="dh-footer__disclaimer">
            <Shield size={12} className="dh-footer__disclaimer-icon" />
            <strong>Scientific &amp; Technical Caveat:</strong> Drishti Himalaya is a decision support tool providing deterministic hazard scoring based on real-time hydro-meteorological and DEM gradient models. It does not predict landslides or guarantee absolute roadway clearance. Exercise field caution and heed official district disaster management advisories.
          </p>
          <div className="dh-footer__copyright">
            &copy; {new Date().getFullYear()} Drishti Himalaya · Hackathon Prototype Release
          </div>
        </div>
      </div>
    </footer>
  );
};
