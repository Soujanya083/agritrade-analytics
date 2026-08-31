import React, { useState } from 'react';
import './SignupPage.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || `http://${window.location.hostname || 'localhost'}:5000`;

const SignupPage = ({ onNavigate }) => {
  const [role, setRole] = useState('Farmer');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    location: '',
    deliveryAddress: '',
    password: '',
    confirmPassword: ''
  });
  const [verificationState, setVerificationState] = useState({
    awaiting: false,
    otp: '',
    email: '',
    serverOtp: null,
  });

  const validateEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleVerifyOtp = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationState.email, otp: verificationState.otp }),
      });

      const data = await response.json();
      if (response.ok) {
        alert('Your account is verified. Please login now.');
        onNavigate('login');
      } else {
        alert(data.message || 'OTP verification failed');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      alert('Unable to verify OTP right now. Please try again.');
    }
  };

  const handleResendOtp = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationState.email || formData.email }),
      });

      const data = await response.json();
      if (response.ok) {
        alert('A new OTP has been sent.');
        setVerificationState((prev) => ({ ...prev, serverOtp: data.otp || prev.serverOtp }));
      } else {
        alert(data.message || 'Unable to resend OTP');
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      alert('Unable to resend OTP right now. Please try again.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateEmail(formData.email)) {
      alert('Please enter a valid email address.');
      return;
    }
    if (formData.password.length < 8) {
      alert('Password must be at least 8 characters long.');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    if (role === 'Buyer' && !formData.deliveryAddress.trim()) {
      alert('Buyer delivery address is required.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, ...formData }),
      });

      const data = await response.json();

      if (response.ok) {
        setVerificationState({
          awaiting: true,
          email: formData.email,
          otp: '',
          serverOtp: data.otp || null,
        });
        alert('Signup successful! Enter the OTP sent to your email or phone to verify your account.');
      } else {
        alert(data.message || 'Signup failed');
      }
    } catch (error) {
      console.error('Error during signup:', error);
      alert('Cannot connect to server. Make sure your Node.js backend is running!');
    }
  };

  return (
    <section className="signup-container">
      <div className="signup__header">
        <img className="signup__logo" src="/logo.png" alt="AgriBid logo" />
        <div className="signup__brand">AgriBid</div>
        <h1 className="signup__title">Create Account</h1>
        <p className="signup__subtitle">Join our community of farmers and buyers</p>
      </div>

      <div className="signup__card">
        <div className="signup__toggle-tabs">
          <button 
            type="button"
            className={`tab-btn ${role === 'Farmer' ? 'active green' : ''}`}
            onClick={() => setRole('Farmer')}
          >
            Farmer
          </button>
          <button 
            type="button"
            className={`tab-btn ${role === 'Buyer' ? 'active blue' : ''}`}
            onClick={() => setRole('Buyer')}
          >
            Buyer
          </button>
        </div>

        <form className="signup__form" onSubmit={handleSubmit}>
          {!verificationState.awaiting ? (
            <>
              <div className="form__row">
                <div className="form__group">
                  <label>Full Name *</label>
                  <input type="text" name="fullName" placeholder="John Doe" value={formData.fullName} onChange={handleChange} required />
                </div>
                <div className="form__group">
                  <label>Phone Number *</label>
                  <input type="tel" name="phone" placeholder="+91 98765 43210" value={formData.phone} onChange={handleChange} required />
                </div>
              </div>

              <div className="form__group">
                <label>Email Address *</label>
                <input type="email" name="email" placeholder="name@example.com" value={formData.email} onChange={handleChange} required />
              </div>

              <div className="form__group">
                <label>Location/City *</label>
                <input type="text" name="location" placeholder="e.g. Bangalore, Karnataka" onChange={handleChange} required />
              </div>

              <div className="form__group">
                <label>{role === 'Buyer' ? 'Delivery Address *' : 'Delivery Address (optional)'}</label>
                <textarea
                  name="deliveryAddress"
                  placeholder="Street, city, district, state"
                  onChange={handleChange}
                  value={formData.deliveryAddress}
                  rows="3"
                  required={role === 'Buyer'}
                />
              </div>

              <div className="form__row">
                <div className="form__group">
                  <label>Password *</label>
                  <input type="password" name="password" placeholder="••••••••" onChange={handleChange} required minLength={8} />
                </div>
                <div className="form__group">
                  <label>Confirm Password *</label>
                  <input type="password" name="confirmPassword" placeholder="••••••••" onChange={handleChange} required />
                </div>
              </div>

              <button type="submit" className="signup-btn green-btn">Create Account</button>
            </>
          ) : (
            <>
              <div className="form__group">
                <label>Verification OTP</label>
                <input
                  type="text"
                  name="otp"
                  placeholder="Enter 6-digit OTP"
                  value={verificationState.otp}
                  onChange={(e) => setVerificationState((prev) => ({ ...prev, otp: e.target.value }))}
                  required
                />
              </div>
              <button type="button" className="signup-btn green-btn" onClick={handleVerifyOtp}>Verify OTP</button>
              <button type="button" className="signup-btn blue-btn" onClick={handleResendOtp}>Resend OTP</button>
              {verificationState.serverOtp && process.env.NODE_ENV === 'development' && (
                <p className="otp-debug">Development OTP: {verificationState.serverOtp}</p>
              )}
            </>
          )}
        </form>

        <p className="login-link">
          Already have an account? <span onClick={() => onNavigate('login')}>Login</span>
        </p>
      </div>
    </section>
  );
};

export default SignupPage;