import React, { useState } from 'react';
import LocationPicker from './LocationPicker';

// The buttons come from the server (shipment.nextStatuses): only moves this person may make right now.
// The server checks again, so a stale screen can never push an invalid update through.
const StatusUpdateForm = ({ shipment, onStatus, onCheckpoint, busy }) => {
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [eta, setEta] = useState('');
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const next = shipment.nextStatuses.find((n) => n.status === status);
  const canCheckpoint = shipment.permissions.canRecordCheckpoint;
  if (!shipment.nextStatuses.length && !canCheckpoint) return null;

  const reset = () => { setStatus(''); setNote(''); setEta(''); setLocation(null); setError(''); };

  const submitStatus = async (event) => {
    event.preventDefault();
    if (!next) { setError('Choose the new status.'); return; }
    if (next.requiresNote && note.trim().length < 3) { setError('Please say why: a short note is required for this status.'); return; }
    const payload = { status, note: note.trim() || undefined, location: location || undefined };
    if (eta) payload.expectedDeliveryAt = new Date(eta).toISOString();
    const ok = await onStatus(payload);
    if (ok) reset();
  };

  const submitCheckpoint = async () => {
    if (!note.trim() && !location) { setError('Add a note or a location for the checkpoint.'); return; }
    const ok = await onCheckpoint({ note: note.trim() || undefined, location: location || undefined });
    if (ok) reset();
  };

  return (
    <form className="shipment-card" onSubmit={submitStatus}>
      <h3>Update this shipment</h3>
      {shipment.nextStatuses.length > 0 && (
        <label>
          New status
          <select value={status} onChange={(e) => { setStatus(e.target.value); setError(''); }}>
            <option value="">Choose...</option>
            {shipment.nextStatuses.map((n) => <option key={n.status} value={n.status}>{n.label}</option>)}
          </select>
        </label>
      )}
      <label>
        Note {next && next.requiresNote ? '(required)' : '(optional)'}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="What happened?" />
      </label>
      {(status === 'ready_for_pickup' || (next && next.asksNewEstimate)) && (
        <label>
          {status === 'ready_for_pickup' ? 'Expected delivery (leave empty for 48 hours from now)' : 'New expected delivery time'}
          <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} />
        </label>
      )}
      {(canCheckpoint || ['picked_up', 'in_transit', 'out_for_delivery', 'delayed', 'delivery_failed'].includes(status)) && <LocationPicker value={location} onChange={setLocation} />}
      {error && <p className="shipment-error" role="alert">{error}</p>}
      <div className="shipment-row">
        {shipment.nextStatuses.length > 0 && <button type="submit" className="bid-btn" disabled={busy}>Save status</button>}
        {canCheckpoint && <button type="button" className="shipment-secondary-btn" disabled={busy} onClick={submitCheckpoint}>Record checkpoint only</button>}
      </div>
    </form>
  );
};

export default StatusUpdateForm;
