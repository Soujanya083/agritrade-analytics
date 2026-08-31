import React from 'react';
import './Features.css';

const features = [
  { title: "Competitive Bidding", desc: "Get the best price for your crops through our transparent bidding system", icon: "📈", color: "#e6fffa" },
  { title: "Secure Payments", desc: "Safe and secure payment processing with guaranteed farmer payouts", icon: "🛡️", color: "#ebf4ff" },
  { title: "Smart Farming", desc: "Get companion planting suggestions to maximize your yield", icon: "🌿", color: "#faf5ff" },
  { title: "Direct Connection", desc: "No middlemen - connect directly with verified buyers and farmers", icon: "🤝", color: "#fff5f5" },
  { title: "Fair Platform Fee", desc: "Only 5% platform fee - you keep 95% of your sale price", icon: "💰", color: "#e6fffa" },
  { title: "Track Everything", desc: "Monitor your listings, bids, and deliveries in real-time", icon: "📍", color: "#fff5f5" }
];

const Features = () => {
  return (
    <section className="features">
      <h2 className="features__title">Why Choose AgriMarket?</h2>
      <div className="features__grid">
        {features.map((f, i) => (
          <div key={i} className="feature-card">
            <div className="feature-card__icon" style={{ backgroundColor: f.color }}>{f.icon}</div>
            <h3 className="feature-card__title">{f.title}</h3>
            <p className="feature-card__desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default Features;