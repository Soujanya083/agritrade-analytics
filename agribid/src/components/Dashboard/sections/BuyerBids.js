import React from 'react';

const BuyerBids = ({ activeTab, isFarmer, myBids }) => (
  (
    !isFarmer &&
      activeTab === 'mybids' && (

        <section className="listing-section">

          <div className="listing-header">
            <h2>My Bids</h2>
          </div>

          <div className="simple-list">

            {myBids.map((bid) => (

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
                    Bid: INR {bid.amount}/kg |
                    Status: {bid.status}
                  </p>

                </div>

              </div>

            ))}

          </div>

        </section>

      )
  ) || null
);

export default BuyerBids;
