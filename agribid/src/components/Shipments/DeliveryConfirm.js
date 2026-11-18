import React, { useEffect, useState } from 'react';
import { shipmentApi } from './shipmentApi';
import { formatDateTime } from './shipmentUtils';

// The buyer confirms the delivery: the one-time code, the quantity actually received, and any damage.
// The code is e-mailed to the buyer. In development mode only, the server shows it here (clearly labelled).
const DeliveryConfirm = ({ shipment, onConfirmed, api = shipmentApi }) => {
  const [code, setCode] = useState('');
  const [received, setReceived] = useState('');
  const [condition, setCondition] = useState('ok');
  const [damaged, setDamaged] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [devCode, setDevCode] = useState('');
  const [waitSeconds, setWaitSeconds] = useState(0);

  useEffect(() => {
    if (waitSeconds <= 0) return undefined;
    const t = setTimeout(() => setWaitSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [waitSeconds]);

  if (!shipment.permissions.canConfirmDelivery) return null;
  const d = shipment.delivery;

  const askForCode = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      const out = await api.requestDeliveryCode(shipment.shipmentId);
      setInfo(out.message);
      setDevCode(out.devCode || '');
    } catch (e) {
      setError(e.message);
      if (e.retryAfterSeconds) setWaitSeconds(e.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event) => {
    event.preventDefault();
    setError(''); setInfo('');
    if (!/^[0-9]{6}$/.test(code.trim())) { setError('Enter the 6-digit delivery code.'); return; }
    if (received === '' || Number(received) < 0) { setError('Enter the quantity you received, in kilograms (0 if nothing arrived).'); return; }
    if (condition !== 'ok' && note.trim().length < 5) { setError('Please describe the damage or what is missing.'); return; }
    setBusy(true);
    try {
      const out = await api.confirmDelivery(shipment.shipmentId, {
        otp: code.trim(), receivedQuantityKg: Number(received), condition, damagedQuantityKg: damaged === '' ? undefined : Number(damaged), note: note.trim() || undefined,
      });
      setCode(''); setDevCode('');
      onConfirmed(out);
    } catch (e) {
      setCode('');
      setError(e.attemptsRemaining != null ? `${e.message} ${e.attemptsRemaining} attempt(s) left.` : e.message);
      if (e.retryAfterSeconds) setWaitSeconds(e.retryAfterSeconds);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="shipment-card delivery-confirm" onSubmit={confirm}>
      <h3>Confirm delivery</h3>
      <p className="shipment-muted">
        Confirm only after the goods are in your hands and you have checked them. Never give the code to anyone before that.
        {d.codeActive && d.expiresAt ? ` Your current code works until ${formatDateTime(d.expiresAt)}.` : ' You have no active code: ask for one below.'}
      </p>
      <div className="shipment-row">
        <button type="button" className="shipment-secondary-btn" onClick={askForCode} disabled={busy || waitSeconds > 0}>
          {waitSeconds > 0 ? `Wait ${waitSeconds} s` : 'Send me a delivery code'}
        </button>
      </div>
      {devCode && (
        <p className="shipment-devcode" role="status">
          DEVELOPMENT MODE: your code is <strong>{devCode}</strong>. In production it is sent to your e-mail and never shown here.
        </p>
      )}
      {info && !devCode && <p className="shipment-muted" role="status">{info}</p>}
      <label>
        Delivery code
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits" />
      </label>
      <label>
        Quantity received (kg) - dispatched: {shipment.quantityDispatchedKg} kg
        <input type="number" min="0" step="0.1" value={received} onChange={(e) => setReceived(e.target.value)} />
      </label>
      <label>
        Condition of the goods
        <select value={condition} onChange={(e) => setCondition(e.target.value)}>
          <option value="ok">Everything is fine</option>
          <option value="damaged">Some goods are damaged</option>
          <option value="missing_items">Some goods are missing</option>
        </select>
      </label>
      {condition !== 'ok' && (
        <>
          <label>
            How many kg are affected? (optional)
            <input type="number" min="0" step="0.1" value={damaged} onChange={(e) => setDamaged(e.target.value)} />
          </label>
          <label>
            Describe the problem (required)
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} />
          </label>
          <p className="shipment-muted">You can add photos as evidence after confirming. The payout stays on hold until the problem is reviewed.</p>
        </>
      )}
      {error && <p className="shipment-error" role="alert">{error}</p>}
      <button type="submit" className="bid-btn" disabled={busy}>{busy ? 'Checking...' : 'Confirm delivery'}</button>
    </form>
  );
};

export default DeliveryConfirm;
