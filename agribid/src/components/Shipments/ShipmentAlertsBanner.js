import React, { useEffect, useState } from 'react';
import { shipmentApi } from './shipmentApi';

// A one-line reminder at the top of the dashboard when any of your shipments has an open alert.
const ShipmentAlertsBanner = ({ onOpen, api = shipmentApi }) => {
  const [alerts, setAlerts] = useState([]);
  useEffect(() => {
    let alive = true;
    const load = () => api.listAlerts({ open: 'true' }).then((a) => { if (alive) setAlerts(a); }).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [api]);
  if (!alerts.length) return null;
  const critical = alerts.filter((a) => a.severity === 'critical').length;
  return (
    <div className={`shipment-banner ${critical ? 'is-critical' : ''}`} role="status">
      <span>
        {alerts.length} open shipment alert{alerts.length > 1 ? 's' : ''}{critical ? `, ${critical} critical` : ''}.
      </span>
      <button type="button" className="shipment-link-btn" onClick={onOpen}>View shipments</button>
    </div>
  );
};

export default ShipmentAlertsBanner;
