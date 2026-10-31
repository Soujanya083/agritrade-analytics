import React from 'react';

const OtpModal = ({ otpModal, setOtpModal, submitOtp }) => (
  (
    otpModal.open && (

      <div className="modal-backdrop">

        <div className="modal-card">

          <h3>Delivery OTP Verification</h3>

          <p>
            Enter the secure OTP sent after dispatch.
          </p>

          <input
            type="text"
            value={otpModal.otpCode}
            onChange={(e) =>
              setOtpModal((prev) => ({
                ...prev,
                otpCode: e.target.value,
              }))
            }
            placeholder="Enter 6-digit OTP"
          />

          <div className="modal-actions">

            <button
              className="small-btn"
              onClick={() =>
                setOtpModal({
                  open: false,
                  transactionId: null,
                  otpCode: '',
                })
              }
            >
              Cancel
            </button>

            <button
              className="bid-btn modal-submit"
              onClick={submitOtp}
            >
              Submit OTP
            </button>

          </div>

        </div>

      </div>

    )
  ) || null
);

export default OtpModal;
