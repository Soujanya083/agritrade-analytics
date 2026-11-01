import React, { useEffect, useRef, useState } from 'react';
import { extractShipmentCode } from './shipmentUtils';

// Scans a shipment QR code with the camera where the browser supports it (BarcodeDetector, needs https and the
// user's permission). Everywhere else - and always as an alternative - the code can be typed or pasted. Phone
// camera apps also work on their own: the QR holds a link that opens this app.
const QrScanner = ({ onCode, onClose }) => {
  const videoRef = useRef(null);
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('');
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

  useEffect(() => {
    if (!supported) return undefined;
    let stream = null;
    let timer = null;
    let stopped = false;
    const start = async () => {
      try {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        timer = setInterval(async () => {
          try {
            const found = await detector.detect(videoRef.current);
            const code = found.length ? extractShipmentCode(found[0].rawValue) : null;
            if (code) onCode(code);
          } catch (e) { /* a frame that could not be read: try the next one */ }
        }, 500);
      } catch (e) {
        setMessage('The camera could not be opened. You can type the shipment code instead.');
      }
    };
    start();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onCode]);

  const submitManual = (event) => {
    event.preventDefault();
    const code = extractShipmentCode(manual);
    if (!code) { setMessage('That does not look like a shipment code (it starts with SHP-).'); return; }
    onCode(code);
  };

  return (
    <div className="shipment-card qr-scanner">
      <h3>Open a shipment</h3>
      {supported ? (
        <video ref={videoRef} className="qr-scanner__video" muted playsInline aria-label="Camera view for scanning a shipment QR code" />
      ) : (
        <p className="shipment-muted">Scanning with the camera is not available in this browser. Use your phone&apos;s camera app on the QR code, or type the code below.</p>
      )}
      <form onSubmit={submitManual} className="shipment-row">
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Shipment code, e.g. SHP-20261030-ABCD2345"
          aria-label="Shipment code"
          autoCapitalize="characters"
        />
        <button type="submit" className="bid-btn">Open</button>
        <button type="button" className="shipment-link-btn" onClick={onClose}>Cancel</button>
      </form>
      {message && <p className="shipment-error" role="alert">{message}</p>}
    </div>
  );
};

export default QrScanner;
