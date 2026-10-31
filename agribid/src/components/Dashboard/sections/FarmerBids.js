import React from 'react';

const FarmerBids = ({ acceptBid, activeTab, farmerBids, isFarmer }) => (
  (
    isFarmer &&
      activeTab === 'dashboard' && (

        <section className="listing-section">

          <div className="listing-header">
            <h2>Bids on My Crops</h2>
          </div>

          <div className="simple-list">

            {farmerBids.map((bid) => (

              <div
                key={bid._id}
                className="simple-item"
              >

                <div>

                  <strong>
                    {bid.cropId?.cropName} (
                    {bid.cropId?.variety})
                  </strong>

                  <p>
                    Buyer: {bid.buyerId?.fullName} |
                    Bid: INR {bid.amount}/kg |
                    Status: {bid.status}
                  </p>

                  <p>
                    {bid.buyerId?.location ||
                      'Buyer location not set'}
                  </p>

                  <p>
                    Delivery Address:{' '}
                    {bid.buyerId?.deliveryAddress ||
                      'Not provided'}
                  </p>

                </div>

                {bid.status === 'active' &&
                  bid.cropId?.status === 'open' && (

                    <button
                      className="bid-btn"
                      onClick={() =>
                        acceptBid(bid._id)
                      }
                    >
                      Accept Bid
                    </button>

                  )}

              </div>

            ))}

          </div>

        </section>

      )
  ) || null
);

export default FarmerBids;
