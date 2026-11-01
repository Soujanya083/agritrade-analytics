import React, { useState } from 'react';
import { getDevicePosition, simulationOffered } from './shipmentUtils';

// Where is the shipment? Three honest ways, each labelled for what it is:
//  - the phone's GPS (asks permission; a position is only ever called "live" if it is fresh)
//  - typing the place
//  - a SIMULATED position, offered only in demo builds
const LocationPicker = ({ value, onChange }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');

  const useGps = async () => {
    setError(''); setBusy(true);
    try {
      onChange(await getDevicePosition());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const typed = (text) => { setLabel(text); onChange(text.trim() ? { source: 'manual', label: text.trim() } : null); };
  const simulate = () => { onChange({ source: 'simulated', label: label.trim() || 'Simulated position', lat: 12.9716, lng: 77.5946 }); };

  return (
    <fieldset className="shipment-location">
      <legend>Location (optional)</legend>
      <div className="shipment-row">
        <button type="button" className="shipment-secondary-btn" onClick={useGps} disabled={busy}>{busy ? 'Getting position...' : 'Use my phone\'s GPS'}</button>
        <input value={label} onChange={(e) => typed(e.target.value)} placeholder="...or type the place, e.g. Tumkur toll plaza" aria-label="Place name" />
        {simulationOffered() && <button type="button" className="shipment-link-btn" onClick={simulate}>Use a simulated position (demo)</button>}
      </div>
      {value && (
        <p className="shipment-muted">
          {value.source === 'device_gps' && `GPS position captured (accuracy about ${Math.round(value.accuracyM)} m).`}
          {value.source === 'manual' && `Will be recorded as a manual update: "${value.label}" (not live).`}
          {value.source === 'simulated' && 'Will be recorded as SIMULATED: a demonstration, not a real position.'}
          {' '}<button type="button" className="shipment-link-btn" onClick={() => { onChange(null); setLabel(''); }}>Clear</button>
        </p>
      )}
      {error && <p className="shipment-error" role="alert">{error}</p>}
    </fieldset>
  );
};

export default LocationPicker;
