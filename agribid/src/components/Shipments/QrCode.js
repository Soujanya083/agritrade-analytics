import React from 'react';

// Draws the QR matrix the server returned ("modules": one string of 0/1 per row) as an SVG.
// Nothing from the server is ever injected as HTML: only numbers become path commands.
const QrCode = ({ size, modules, label = 'QR code for this shipment', pixels = 220 }) => {
  const quiet = 4; // the blank border readers need
  const total = size + quiet * 2;
  const path = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (row[x] === '1') {
        let end = x;
        while (end < size && row[end] === '1') end += 1;
        path.push(`M${x + quiet} ${y + quiet}h${end - x}v1h-${end - x}z`);
        x = end;
      } else {
        x += 1;
      }
    }
  });
  return (
    <svg className="qr-code" width={pixels} height={pixels} viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path.join('')} fill="#000000" />
    </svg>
  );
};

export default QrCode;
