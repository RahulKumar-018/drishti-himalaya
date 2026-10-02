import React, { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { Search, X, MapPin, Check } from 'lucide-react';
import { LocationPoint } from '../../types/location';
import { searchLocations } from '../../services/location/locationService';
import './LocationSearchInput.css';

export interface LocationSearchInputProps {
  id: string;
  label?: string;
  placeholder?: string;
  selectedLocation: LocationPoint | null;
  onSelectLocation: (location: LocationPoint) => void;
  onClear?: () => void;
  className?: string;
  autoFocus?: boolean;
}

export const LocationSearchInput: React.FC<LocationSearchInputProps> = ({
  id,
  label,
  placeholder = 'Search city, town, destination...',
  selectedLocation,
  onSelectLocation,
  onClear,
  className,
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState(selectedLocation?.name ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const [results, setResults] = useState<LocationPoint[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal input value when selectedLocation changes externally
  useEffect(() => {
    if (selectedLocation) {
      setInputValue(selectedLocation.name);
    } else {
      setInputValue('');
    }
  }, [selectedLocation]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    if (val.trim().length > 0) {
      const searchRes = searchLocations(val, 6);
      setResults(searchRes);
      setIsOpen(true);
      setHighlightedIndex(-1);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  };

  const handleFocus = () => {
    if (inputValue.trim().length > 0) {
      const searchRes = searchLocations(inputValue, 6);
      setResults(searchRes);
      setIsOpen(true);
    }
  };

  const handleSelect = (loc: LocationPoint) => {
    setInputValue(loc.name);
    setIsOpen(false);
    onSelectLocation(loc);
  };

  const handleClear = () => {
    setInputValue('');
    setResults([]);
    setIsOpen(false);
    onClear?.();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        handleSelect(results[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={clsx('dh-location-search', className)}>
      {label && (
        <label htmlFor={id} className="dh-location-search__label">
          {label}
        </label>
      )}

      <div className="dh-location-search__input-wrapper">
        <span className="dh-location-search__prefix-icon" aria-hidden="true">
          {selectedLocation ? (
            <Check size={14} className="dh-location-search__icon-check" />
          ) : (
            <Search size={14} className="dh-location-search__icon-search" />
          )}
        </span>

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          className={clsx('dh-location-search__input', {
            'dh-location-search__input--selected': Boolean(selectedLocation),
          })}
        />

        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="dh-location-search__clear-btn"
            title="Clear location"
            aria-label="Clear location input"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Autocomplete Dropdown Menu */}
      {isOpen && (
        <ul
          id={`${id}-results`}
          role="listbox"
          className="dh-location-search__dropdown"
        >
          {results.length > 0 ? (
            results.map((loc, idx) => {
              const isHighlighted = idx === highlightedIndex;
              return (
                <li
                  key={loc.id}
                  id={`${id}-result-${loc.id}`}
                  role="option"
                  aria-selected={isHighlighted}
                  className={clsx('dh-location-search__option', {
                    'dh-location-search__option--highlighted': isHighlighted,
                  })}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => handleSelect(loc)}
                >
                  <div className="dh-location-search__option-main">
                    <MapPin size={12} className="dh-location-search__option-icon" aria-hidden="true" />
                    <span className="dh-location-search__option-name">{loc.name}</span>
                    <span className="dh-location-search__option-category">{loc.category}</span>
                  </div>
                  <div className="dh-location-search__option-sub">
                    {loc.district ? `${loc.district}, ` : ''}{loc.state}
                    {loc.elevationM ? ` · ${loc.elevationM}m MSL` : ''}
                  </div>
                </li>
              );
            })
          ) : (
            <li className="dh-location-search__empty">
              No matching Uttarakhand locations found.
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
