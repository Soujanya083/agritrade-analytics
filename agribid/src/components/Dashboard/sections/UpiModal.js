import React from 'react';
import { UPI_ID, upiLink } from '../dashboardConfig';

const UpiModal = ({ confirmUpiPayment, setUpiModal, upiModal }) => (
  (
    upiModal.open && (

      <div className="modal-backdrop">

        <div className="modal-card">

          <h3>UPI Payment</h3>

          <p>
            Scan the QR code or use the UPI ID below to
            pay the total amount.
          </p>

          <div
            style={{
              textAlign: 'center',
              margin: '16px 0',
            }}
          >

            {UPI_ID ? (
              <>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink(upiModal.transaction))}`}
                  alt="UPI QR"
                  style={{
                    width: 200,
                    height: 200,
                  }}
                />

                <div style={{ marginTop: 8 }}>
                  <strong>UPI ID:</strong>{' '}
                  {UPI_ID}
                </div>

                <a
                  href={upiLink(upiModal.transaction)}
                  style={{ display: 'inline-block', marginTop: 8 }}
                >
                  Open in my UPI app
                </a>
              </>
            ) : (
              <div
                style={{
                  background: '#fff8e1',
                  border: '1px solid #ffe082',
                  borderRadius: 10,
                  padding: 12,
                  fontSize: 14,
                }}
              >
                <strong>Demo mode:</strong> UPI payments are not set
                up for this deployment (no receiving UPI ID is
                configured), so there is no QR code to scan.
              </div>
            )}

            <div style={{ marginTop: 8 }}>
              <strong>Amount:</strong> INR{' '}
              {upiModal.transaction?.totalAmount?.toLocaleString()}
            </div>

          </div>

          <p>
            After payment, click below to confirm.
          </p>

          <div className="modal-actions">

            <button
              className="small-btn"
              onClick={() =>
                setUpiModal({
                  open: false,
                  transaction: null,
                })
              }
            >
              Cancel
            </button>

            <button
              className="bid-btn modal-submit"
              onClick={confirmUpiPayment}
            >
              I have paid
            </button>

          </div>

        </div>

      </div>

    )
  ) || null
);

export default UpiModal;
