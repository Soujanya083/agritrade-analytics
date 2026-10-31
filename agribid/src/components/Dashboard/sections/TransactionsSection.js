import React from 'react';

const TransactionsSection = ({ activeTab, isFarmer, markDispatch, openOtpModal, startRazorpayPayment, startUpiPayment, transactions }) => (
  (
    activeTab === 'transactions' && (

      <section className="listing-section">

        <div className="listing-header">
          <h2>Transactions</h2>
        </div>

        <div className="simple-list">

          {transactions.map((txn) => (

            <div
              key={txn._id}
              className="simple-item"
            >

              <div>

                <strong>
                  {txn.cropId?.cropName} -{' '}
                  {txn.cropId?.quantityKg} kg
                </strong>

                <p>
                  Status: {txn.status} | Amount: INR{' '}
                  {txn.totalAmount?.toLocaleString()} |
                  Platform Fee: INR{' '}
                  {txn.platformFee?.toLocaleString()} |
                  Payout: INR{' '}
                  {txn.payout?.toLocaleString()}
                </p>

              </div>

              {!isFarmer &&
                txn.status === 'awaiting_payment' && (

                  <button
                    className="bid-btn"
                    onClick={() =>
                      startUpiPayment(txn)
                    }
                  >
                    Pay Now (UPI)
                  </button>

                )}

              {!isFarmer &&
                txn.status === 'awaiting_payment' && (

                  <button
                    className="bid-btn"
                    onClick={() =>
                      startRazorpayPayment(txn)
                    }
                    style={{ marginLeft: '8px' }}
                  >
                    Pay Now (Card/Netbanking)
                  </button>

                )}

              {isFarmer &&
                txn.status === 'payment_confirmed' && (

                  <button
                    className="bid-btn"
                    onClick={() =>
                      markDispatch(txn._id)
                    }
                  >
                    Mark Dispatch
                  </button>

                )}

              {!isFarmer &&
                txn.status === 'dispatched' && (

                  <button
                    className="bid-btn"
                    onClick={() =>
                      openOtpModal(txn._id)
                    }
                  >
                    Enter OTP
                  </button>

                )}

            </div>

          ))}

        </div>

      </section>

    )
  ) || null
);

export default TransactionsSection;
