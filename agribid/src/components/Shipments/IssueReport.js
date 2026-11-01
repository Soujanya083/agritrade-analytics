import React, { useState } from 'react';

// Report damaged or missing goods. Photos are added afterwards (below the form), so the evidence is attached to the report.
const IssueReport = ({ shipment, onReport, busy }) => {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('damage');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  if (!shipment.permissions.canReportIssue) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (description.trim().length < 5) { setError('Please describe what is wrong.'); return; }
    const ok = await onReport({ kind, description: description.trim(), affectedQuantityKg: amount === '' ? undefined : Number(amount) });
    if (ok) { setOpen(false); setDescription(''); setAmount(''); setError(''); }
  };

  if (!open) return <button type="button" className="shipment-secondary-btn" onClick={() => setOpen(true)}>Report damaged or missing goods</button>;
  return (
    <form className="shipment-card" onSubmit={submit}>
      <h3>Report a problem</h3>
      <label>
        What happened?
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="damage">Goods are damaged</option>
          <option value="missing">Goods are missing</option>
          <option value="quantity">The quantity is wrong</option>
        </select>
      </label>
      <label>
        Describe it
        <textarea rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        Affected quantity in kg (optional)
        <input type="number" min="0" step="0.1" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {error && <p className="shipment-error" role="alert">{error}</p>}
      <div className="shipment-row">
        <button type="submit" className="bid-btn" disabled={busy}>Send report</button>
        <button type="button" className="shipment-link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
};

export default IssueReport;
