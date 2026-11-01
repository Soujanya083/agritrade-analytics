import React from 'react';
import { describeEvent, formatDateTime, statusTone } from './shipmentUtils';

const roleText = (by) => [by.role && by.role.replace(/^./, (c) => c.toUpperCase()), by.name].filter(Boolean).join(' - ');

// Oldest first: this is the shipment's history in order, every entry with its time and who recorded it.
const ShipmentTimeline = ({ events }) => (
  <ol className="shipment-timeline" aria-label="Tracking timeline">
    {events.map((e) => (
      <li key={e.id} className={`shipment-timeline__item tone-${e.status ? statusTone(e.status) : 'neutral'}`}>
        <div className="shipment-timeline__what">{describeEvent(e)}</div>
        <div className="shipment-timeline__meta">
          <time dateTime={e.at}>{formatDateTime(e.at)}</time>
          {e.by && (e.by.role || e.by.name) ? <span> | {roleText(e.by)}</span> : null}
        </div>
        {e.note ? <div className="shipment-timeline__note">{e.note}</div> : null}
        {e.location ? (
          <div className="shipment-timeline__loc">
            {e.location.label || (e.location.lat != null ? `${e.location.lat}, ${e.location.lng}` : '')}
            <span className="shipment-chip chip-source"> {e.location.sourceLabel}</span>
          </div>
        ) : null}
      </li>
    ))}
  </ol>
);

export default ShipmentTimeline;
