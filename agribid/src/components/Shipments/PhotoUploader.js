import React, { useState } from 'react';
import { shipmentApi } from './shipmentApi';
import { compressImage } from './shipmentUtils';

const KINDS_BY_ROLE = { pickup: ['farmer', 'carrier', 'admin'], delivery: ['buyer', 'carrier', 'admin'], damage: ['farmer', 'buyer', 'carrier', 'admin'] };
const KIND_LABEL = { pickup: 'Goods at pickup', delivery: 'Goods at delivery', damage: 'Damage or missing goods' };

const PhotoUploader = ({ shipment, onUploaded, defaultKind, api = shipmentApi }) => {
  const kinds = Object.keys(KINDS_BY_ROLE).filter((k) => shipment.yourRoles.some((r) => KINDS_BY_ROLE[k].includes(r)));
  const [kind, setKind] = useState(defaultKind && kinds.includes(defaultKind) ? defaultKind : kinds[kinds.length - 1]);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  if (!shipment.permissions.canUploadPhoto || !kinds.length) return null;

  const choose = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setError(''); setDone(''); setBusy(true);
    try {
      const ready = await compressImage(file);
      await api.uploadPhoto(shipment.shipmentId, { kind, caption: caption.trim(), file: ready });
      setCaption('');
      setDone('Photo saved. It can only be seen by people on this shipment.');
      onUploaded();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shipment-card">
      <h3>Add a photo</h3>
      <div className="shipment-row">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What the photo shows">
          {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
        </select>
        <input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={200} placeholder="Short caption (optional)" aria-label="Photo caption" />
      </div>
      <label className="shipment-file">
        {busy ? 'Uploading...' : 'Take or choose a photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={choose} disabled={busy} />
      </label>
      {done && <p className="shipment-muted" role="status">{done}</p>}
      {error && <p className="shipment-error" role="alert">{error}</p>}
    </div>
  );
};

export default PhotoUploader;
