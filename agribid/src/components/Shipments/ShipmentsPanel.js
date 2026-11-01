import React, { useCallback, useEffect, useState } from 'react';
import './Shipments.css';
import { shipmentApi } from './shipmentApi';
import {
  buildShipmentHash, formatDateTime, parseShipmentHash, statusLabel, statusTone, timeUntil,
} from './shipmentUtils';
import ShipmentDetail from './ShipmentDetail';
import QrScanner from './QrScanner';

const EMPTY = {
  Farmer: 'Shipments appear here when you accept a bid.',
  Buyer: 'Shipments appear here when a farmer accepts your bid.',
  Transporter: 'Shipments appear here when a farmer assigns you as the carrier.',
};

// The Shipments tab: your shipments, a way to open one by scanning its QR code or typing its code, and the detail view.
// The address bar (#/shipment/CODE) says which shipment is open, so a scanned QR link opens the right one.
const ShipmentsPanel = ({ user, api = shipmentApi }) => {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [scanning, setScanning] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.listShipments({ active: filter === 'active' ? 'true' : undefined, limit: 50 });
      setList(out.shipments);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [api, filter]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    const apply = async () => {
      const target = parseShipmentHash(window.location.hash);
      if (!target) { setSelected(null); return; }
      if (target.type === 'code') { setSelected(target.value); return; }
      try { // an older deal that has no shipment yet: it is created on first look
        const s = await api.getByTransaction(target.value);
        window.location.hash = buildShipmentHash(s.shipmentId);
      } catch (e) {
        setError(e.message);
        window.location.hash = '';
      }
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [api]);

  const open = (code) => { window.location.hash = buildShipmentHash(code); };
  const close = () => { window.location.hash = ''; loadList(); };
  const scanned = useCallback((code) => { setScanning(false); window.location.hash = buildShipmentHash(code); }, []);

  if (selected) return <ShipmentDetail code={selected} onBack={close} api={api} />;

  return (
    <div className="shipments-panel">
      <div className="shipment-row shipment-toolbar">
        <h2>Shipments</h2>
        <div className="shipment-row">
          <button type="button" className={filter === 'active' ? 'bid-btn' : 'shipment-secondary-btn'} onClick={() => setFilter('active')}>Active</button>
          <button type="button" className={filter === 'all' ? 'bid-btn' : 'shipment-secondary-btn'} onClick={() => setFilter('all')}>All</button>
          <button type="button" className="shipment-secondary-btn" onClick={() => setScanning((s) => !s)}>Scan QR or enter code</button>
        </div>
      </div>

      {scanning && <QrScanner onCode={scanned} onClose={() => setScanning(false)} />}
      {error && <p className="shipment-error" role="alert">{error}</p>}
      {loading && <p className="shipment-muted">Loading...</p>}
      {!loading && !error && list.length === 0 && <p className="shipment-muted">{EMPTY[user.role] || 'No shipments yet.'}</p>}

      <ul className="shipment-list">
        {list.map((s) => (
          <li key={s.shipmentId} className="shipment-card shipment-list__item">
            <div>
              <div className="shipment-code">{s.shipmentId}</div>
              <strong>{s.crop} - {s.quantityDispatchedKg} kg</strong>
              <div className="shipment-muted">{s.origin || '?'} to {s.destination || '?'} | you are the {s.yourPart}</div>
              {s.expectedDeliveryAt && s.status !== 'delivered' && <div className="shipment-muted">Expected {formatDateTime(s.expectedDeliveryAt)} ({timeUntil(s.expectedDeliveryAt)})</div>}
            </div>
            <div className="shipment-list__side">
              <span className={`shipment-badge tone-${statusTone(s.status)}`}>{statusLabel(s.status)}</span>
              {s.openAlerts > 0 && <span className={`shipment-chip sev-chip-${s.worstAlertSeverity}`}>{s.openAlerts} alert{s.openAlerts > 1 ? 's' : ''}</span>}
              <button type="button" className="bid-btn" onClick={() => open(s.shipmentId)}>Open</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ShipmentsPanel;
