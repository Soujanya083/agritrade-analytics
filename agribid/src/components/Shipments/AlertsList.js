import React, { useState } from 'react';
import { ALERT_TYPE_LABELS, alertActionsFor, formatDateTime } from './shipmentUtils';

const ACTION_LABEL = { acknowledge: 'Acknowledge', investigate: 'Add investigation note', resolve: 'Resolve' };
const prettyKey = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
const prettyValue = (v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v));

const AlertCard = ({ alert, roles, onAction, busy }) => {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const actions = alertActionsFor(alert, roles);
  const details = Object.entries(alert.details || {}).filter(([, v]) => v !== null && v !== undefined);
  return (
    <li className={`shipment-alert sev-${alert.severity} ${alert.status === 'resolved' ? 'is-resolved' : ''}`}>
      <div className="shipment-alert__head">
        <span className={`shipment-chip sev-chip-${alert.severity}`}>{alert.severity}</span>
        <strong>{ALERT_TYPE_LABELS[alert.type] || alert.type}</strong>
        <span className="shipment-chip">{alert.status}</span>
        <span className="shipment-muted">{formatDateTime(alert.raisedAt)}</span>
      </div>
      <p className="shipment-alert__reason"><strong>Why you are seeing this:</strong> {alert.reason}</p>
      <button type="button" className="shipment-link-btn" onClick={() => setOpen((o) => !o)}>{open ? 'Hide the numbers' : 'Show the numbers behind it'}</button>
      {open && (
        <dl className="shipment-details">
          {details.map(([k, v]) => (<React.Fragment key={k}><dt>{prettyKey(k)}</dt><dd>{prettyValue(v)}</dd></React.Fragment>))}
        </dl>
      )}
      {alert.history.length > 0 && (
        <ul className="shipment-alert__history">
          {alert.history.map((h) => (<li key={`${h.at}-${h.action}-${h.byName}`}>{formatDateTime(h.at)} | {h.byRole} {h.byName ? `(${h.byName})` : ''}: {h.action}{h.text ? ` - ${h.text}` : ''}</li>))}
        </ul>
      )}
      {alert.status === 'resolved' && alert.resolutionNote && <p className="shipment-muted">Resolution: {alert.resolutionNote}</p>}
      {actions.length > 0 && (
        <div className="shipment-alert__actions">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note (required to resolve)" aria-label="Note for this alert" />
          <div className="shipment-row">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                className={a === 'resolve' ? 'bid-btn' : 'shipment-secondary-btn'}
                disabled={busy}
                onClick={async () => { const ok = await onAction(alert.id, a, note); if (ok) setNote(''); }}
              >
                {ACTION_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
};

const AlertsList = ({ alerts, roles, onAction, busy }) => {
  if (!alerts.length) return <p className="shipment-muted">No alerts for this shipment.</p>;
  return <ul className="shipment-alerts">{alerts.map((a) => <AlertCard key={a.id} alert={a} roles={roles} onAction={onAction} busy={busy} />)}</ul>;
};

export default AlertsList;
