import React, { useCallback, useEffect, useState } from 'react';
import { shipmentApi } from './shipmentApi';
import {
  JOURNEY, formatDateTime, journeyProgress, statusLabel, statusTone, timeUntil,
} from './shipmentUtils';
import QrCode from './QrCode';
import ShipmentTimeline from './ShipmentTimeline';
import AlertsList from './AlertsList';
import StatusUpdateForm from './StatusUpdateForm';
import DeliveryConfirm from './DeliveryConfirm';
import IssueReport from './IssueReport';
import PhotoUploader from './PhotoUploader';
import PhotoGallery from './PhotoGallery';
import CarrierPanel from './CarrierPanel';

const REFRESH_MS = 30000;

const ShipmentDetail = ({ code, onBack, api = shipmentApi }) => {
  const [shipment, setShipment] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState(null);
  const [showQr, setShowQr] = useState(false);

  const load = useCallback(async () => {
    try {
      setShipment(await api.getShipment(code));
      setError('');
    } catch (e) {
      setError(e.status === 404 ? 'This shipment was not found, or you are not part of it.' : e.message);
    }
  }, [api, code]);

  useEffect(() => {
    setShipment(null); setQr(null); setShowQr(false); setNotice('');
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // runs one action, shows the outcome, refreshes the screen; resolves true on success
  const run = async (action, success) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const out = await action();
      if (out && out.shipment) setShipment(out.shipment); else await load();
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleQr = async () => {
    if (!showQr && !qr) {
      try { setQr(await api.getQr(code)); } catch (e) { setError(e.message); return; }
    }
    setShowQr((v) => !v);
  };

  if (!shipment) {
    return (
      <div className="shipments-panel">
        <button type="button" className="shipment-link-btn" onClick={onBack}>Back to shipments</button>
        {error ? <p className="shipment-error" role="alert">{error}</p> : <p className="shipment-muted">Loading shipment...</p>}
      </div>
    );
  }

  // exceptions (delayed, damage, investigation) keep the last normal step the shipment reached
  const lastNormal = [...shipment.timeline].reverse().find((e) => e.type === 'status_change' && JOURNEY.includes(e.status));
  const progress = Math.round(journeyProgress(shipment.status, lastNormal ? lastNormal.status : undefined) * 100);
  const loc = shipment.tracking.lastLocation;
  const eta = shipment.deliveredAt ? null : timeUntil(shipment.expectedDeliveryAt);
  const openAlerts = shipment.alerts.filter((a) => a.status !== 'resolved');
  const closedAlerts = shipment.alerts.filter((a) => a.status === 'resolved');

  return (
    <div className="shipments-panel">
      <button type="button" className="shipment-link-btn" onClick={onBack}>Back to shipments</button>

      <header className="shipment-card shipment-head">
        <div>
          <div className="shipment-code">{shipment.shipmentId}</div>
          <h2>{shipment.crop.name} - {shipment.quantityDispatchedKg} kg</h2>
          <p className="shipment-muted">{shipment.origin || 'Origin not set'} to {shipment.destination || 'destination not set'}</p>
          <p className="shipment-muted">
            Farmer: {shipment.people.farmer} | Buyer: {shipment.people.buyer} | Carrier: {shipment.people.carrier.assigned ? shipment.people.carrier.name : 'the farmer'}
          </p>
        </div>
        <div className="shipment-head__status">
          <span className={`shipment-badge tone-${statusTone(shipment.status)}`}>{statusLabel(shipment.status)}</span>
          <div className="shipment-muted">Updated {formatDateTime(shipment.statusUpdatedAt)}</div>
          {shipment.expectedDeliveryAt && !shipment.deliveredAt && (
            <div>Expected {formatDateTime(shipment.expectedDeliveryAt)}{eta ? ` (${eta})` : ''}</div>
          )}
          {shipment.deliveredAt && <div>Delivered {formatDateTime(shipment.deliveredAt)}</div>}
        </div>
      </header>

      <div className="shipment-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Progress of the delivery">
        <div className="shipment-progress__bar" style={{ width: `${progress}%` }} />
      </div>

      {shipment.payout.onHold && <p className="shipment-warning" role="status">The payout is on hold while a problem with this delivery is reviewed.</p>}
      {notice && <p className="shipment-notice" role="status">{notice}</p>}
      {error && <p className="shipment-error" role="alert">{error}</p>}

      <section className="shipment-card" aria-label="Tracking mode">
        <h3>Where is it?</h3>
        <p className={`shipment-tracking ${shipment.tracking.live ? 'is-live' : 'not-live'}`}>
          {shipment.tracking.live ? 'LIVE' : 'NOT LIVE'}: {shipment.tracking.label}
        </p>
        {loc && (
          <p>
            Last position: <strong>{loc.label || (loc.lat != null ? `${loc.lat}, ${loc.lng}` : 'recorded')}</strong>
            {shipment.tracking.ageMinutes != null ? ` (${shipment.tracking.ageMinutes} min ago)` : ''}
            {loc.lat != null && (
              <> | <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=14/${loc.lat}/${loc.lng}`} target="_blank" rel="noopener noreferrer">Open map</a></>
            )}
          </p>
        )}
      </section>

      <section aria-label="Alerts">
        <h3>Alerts {openAlerts.length > 0 ? `(${openAlerts.length} open)` : ''}</h3>
        <AlertsList alerts={openAlerts} roles={shipment.yourRoles} busy={busy} onAction={(id, action, note) => run(() => api.alertAction(id, action, note), 'Alert updated.')} />
        {closedAlerts.length > 0 && (
          <details>
            <summary>{closedAlerts.length} resolved alert(s)</summary>
            <AlertsList alerts={closedAlerts} roles={shipment.yourRoles} busy={busy} onAction={() => false} />
          </details>
        )}
      </section>

      <DeliveryConfirm shipment={shipment} api={api} onConfirmed={(out) => { setShipment(out.shipment); setNotice(out.message); }} />

      <StatusUpdateForm
        shipment={shipment}
        busy={busy}
        onStatus={(payload) => run(() => api.updateStatus(code, payload), 'Status updated.')}
        onCheckpoint={(payload) => run(() => api.addCheckpoint(code, payload), 'Checkpoint recorded.')}
      />

      <CarrierPanel
        shipment={shipment}
        busy={busy}
        onAssign={(email) => run(() => api.assignCarrier(code, email), 'Carrier assigned.')}
        onRemove={() => run(() => api.removeCarrier(code), 'The farmer will deliver.')}
      />

      <IssueReport shipment={shipment} busy={busy} onReport={(payload) => run(() => api.reportIssue(code, payload), 'Problem reported. Add photos below as evidence.')} />
      <PhotoUploader shipment={shipment} api={api} onUploaded={load} />

      <section className="shipment-card" aria-label="Timeline">
        <h3>Tracking timeline</h3>
        <ShipmentTimeline events={shipment.timeline} />
      </section>

      <section className="shipment-card" aria-label="Photos">
        <h3>Photos</h3>
        <PhotoGallery code={shipment.shipmentId} photos={shipment.photos} api={api} />
      </section>

      <section className="shipment-card" aria-label="QR code">
        <h3>QR code</h3>
        <p className="shipment-muted">
          Print or show this code on the load. Scanning it opens this page, but only people who are logged in and part of this shipment can see anything.
        </p>
        <button type="button" className="shipment-secondary-btn" onClick={toggleQr}>{showQr ? 'Hide QR code' : 'Show QR code'}</button>
        {showQr && qr && (
          <div className="shipment-qr">
            <QrCode size={qr.size} modules={qr.modules} label={`QR code for shipment ${shipment.shipmentId}`} />
            <div className="shipment-code">{shipment.shipmentId}</div>
            <button type="button" className="shipment-link-btn" onClick={() => window.print()}>Print</button>
          </div>
        )}
      </section>

      <p className="shipment-muted shipment-disclaimer">
        AgriBid records and monitors each shipment so that problems are noticed early and can be checked afterwards. It cannot guarantee that goods arrive safely: use the timeline, photos and alerts as evidence.
      </p>
    </div>
  );
};

export default ShipmentDetail;
