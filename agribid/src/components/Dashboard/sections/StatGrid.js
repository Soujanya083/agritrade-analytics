import React from 'react';

const StatGrid = ({ activeTab, buyerStats, farmerStats, isFarmer }) => (
  (
    (activeTab === 'dashboard' ||
      activeTab === 'browse') && (

      <section className="stat-grid">

        {(isFarmer
          ? farmerStats
          : buyerStats
        ).map((item) => (

          <article
            key={item.label}
            className={`stat-card ${item.accent}`}
          >
            <h3>{item.label}</h3>
            <p>{item.value}</p>
          </article>

        ))}

      </section>

    )
  ) || null
);

export default StatGrid;
