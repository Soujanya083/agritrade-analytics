import React, { useEffect, useState } from 'react';
import { shipmentApi } from './shipmentApi';
import { formatDateTime } from './shipmentUtils';

// Photos are private: each is fetched with the user's login and shown from a temporary in-browser URL.
const Photo = ({ code, photo, api }) => {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    let objectUrl = '';
    api.photoBlob(code, photo.photoId)
      .then((blob) => { if (alive) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [code, photo.photoId, api]);
  return (
    <figure className="shipment-photo">
      {url ? <img src={url} alt={photo.caption || `${photo.kind} evidence`} /> : <div className="shipment-photo__placeholder">{failed ? 'Photo unavailable' : 'Loading...'}</div>}
      <figcaption>
        <strong>{photo.kind}</strong> | {photo.uploadedByRole} | {formatDateTime(photo.uploadedAt)}
        {photo.caption ? <div>{photo.caption}</div> : null}
      </figcaption>
    </figure>
  );
};

const PhotoGallery = ({ code, photos, api = shipmentApi }) => {
  if (!photos.length) return <p className="shipment-muted">No photos yet.</p>;
  return <div className="shipment-photos">{photos.map((p) => <Photo key={p.photoId} code={code} photo={p} api={api} />)}</div>;
};

export default PhotoGallery;
