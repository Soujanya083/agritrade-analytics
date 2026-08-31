import React from 'react';
import './HowItWorks.css';

const HowItWorks = () => {
  return (
    <section className="how-it-works">
      <h2 className="section-title">How It Works</h2>
      <div className="how__container">
        {/* Farmers Side */}
        <div className="how__card">
          <h3 className="how__user-type farmer-text">For Farmers</h3>
          <ul className="how__list">
            <li><span className="step step--green">1</span> <div><strong>Register & List Your Crops</strong><p>Create an account and upload details</p></div></li>
            <li><span className="step step--green">2</span> <div><strong>Receive Bids</strong><p>Buyers place competitive bids</p></div></li>
            <li><span className="step step--green">3</span> <div><strong>Accept & Deliver</strong><p>Accept the best bid</p></div></li>
            <li><span className="step step--green">4</span> <div><strong>Get Paid</strong><p>Receive payment (95% of price)</p></div></li>
          </ul>
        </div>

        {/* Buyers Side */}
        <div className="how__card">
          <h3 className="how__user-type buyer-text">For Buyers</h3>
          <ul className="how__list">
            <li><span className="step step--blue">1</span> <div><strong>Browse Crops</strong><p>Explore crops from verified farmers</p></div></li>
            <li><span className="step step--blue">2</span> <div><strong>Place Your Bid</strong><p>Submit competitive bids</p></div></li>
            <li><span className="step step--blue">3</span> <div><strong>Complete Payment</strong><p>Pay securely when bid is accepted</p></div></li>
            <li><span className="step step--blue">4</span> <div><strong>Receive Delivery</strong><p>Get crops and confirm receipt</p></div></li>
          </ul>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;