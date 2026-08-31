import React from 'react';
import './Hero.css';

// Add { onNavigate } as a prop
const Hero = ({ onNavigate }) => {
  return (
    <section className="hero">
      <div className="hero__content">
        <img className="hero__logo" src="/logo.png" alt="AgriBid logo" />
        <h1 className="hero__title">AgriMarket</h1>
        <p className="hero__subtitle">
          Connecting farmers directly with buyers...
        </p>
        <div className="hero__actions">
          {/* Change these from static buttons to call the function */}
          <button 
            className="btn btn--farmer" 
            onClick={() => onNavigate('login')}
          >
            I'm a Farmer
          </button>
          <button 
            className="btn btn--buyer" 
            onClick={() => onNavigate('login')}
          >
            I'm a Buyer
          </button>
        </div>
      </div>
    </section>
  );
};

export default Hero;