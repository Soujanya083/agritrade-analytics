import React from 'react';
import { ListingImage } from '../listingImages';

const CropListings = ({ activeTab, deleteListing, isFarmer, isLoadingMore, listingHasMore, listingTotal, loadMoreListings, myListings, placeBid, userId, visibleListings }) => (
  (
    (activeTab === 'dashboard' ||
      activeTab === 'browse') && (

      <section className="listing-section">

        <div className="listing-header">

          <h2>
            {isFarmer
              ? 'My Active Listings'
              : 'Available Crops'}
          </h2>

          <span>
            {listingTotal}
          </span>

        </div>

        <div className="listing-grid">

          {(isFarmer
            ? myListings
            : visibleListings
          ).map((item) => (

            <article
              key={item._id}
              className="listing-card"
            >

              <ListingImage
                className="listing-image"
                item={item}
              />

              <div className="listing-body">

                <h3>
                  {item.cropName} - {item.variety}
                </h3>

                <p>
                  {item.quantityKg.toLocaleString()} kg
                </p>

                <p>{item.location}</p>

                <p>
                  Harvested: {item.harvestedDate}
                </p>

                <p>
                  Status:{' '}
                  <strong>{item.status}</strong>
                </p>

              </div>

              <div className="price-row">

                <span>
                  Base Price: INR {item.basePrice}/kg
                </span>

                <strong>
                  Current Bid: INR {item.currentBid}/kg
                </strong>

              </div>

              {!isFarmer && (
                <button
                  className="bid-btn"
                  onClick={() => placeBid(item)}
                >
                  Place Bid
                </button>
              )}

              {isFarmer && item.status === 'open' && String(item.farmerId?._id || item.farmerId) === String(userId) && (
                <button
                  className="bid-btn delete-btn"
                  onClick={() => deleteListing(item)}
                >
                  Delete my listing
                </button>
              )}

            </article>

          ))}

        </div>

        {listingHasMore && (
          <div className="load-more-row">
            <button
              type="button"
              className="bid-btn"
              onClick={loadMoreListings}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}

      </section>

    )
  ) || null
);

export default CropListings;
