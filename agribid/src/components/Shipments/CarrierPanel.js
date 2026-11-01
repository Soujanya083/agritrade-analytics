import React, { useState } from 'react';

// Who is carrying the goods. The farmer can name a registered transporter by e-mail, or deliver themselves.
const CarrierPanel = ({ shipment, onAssign, onRemove, busy }) => {
  const [email, setEmail] = useState('');
  const carrier = shipment.people.carrier;
  return (
    <div className="shipment-card">
      <h3>Carrier</h3>
      <p>
        {carrier.assigned ? <>Transporter: <strong>{carrier.name}</strong></> : <>No transporter assigned: <strong>the farmer delivers</strong>.</>}
      </p>
      {shipment.permissions.canAssignCarrier && (
        <form
          className="shipment-row"
          onSubmit={async (e) => { e.preventDefault(); if (email.trim() && await onAssign(email.trim())) setEmail(''); }}
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Transporter's registered e-mail" aria-label="Transporter e-mail" />
          <button type="submit" className="shipment-secondary-btn" disabled={busy || !email.trim()}>Assign</button>
          {carrier.assigned && <button type="button" className="shipment-link-btn" disabled={busy} onClick={onRemove}>Remove (I will deliver)</button>}
        </form>
      )}
    </div>
  );
};

export default CarrierPanel;
