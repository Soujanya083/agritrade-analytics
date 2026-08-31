import React, { useState } from 'react';
import './LoginPage.css';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || `http://${window.location.hostname || 'localhost'}:5000`;

const LoginPage = ({ onNavigate, onLoginSuccess }) => {
    const [activeRole, setActiveRole] = useState('Farmer');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const response = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, role: activeRole, phone }),
            });

            const data = await response.json();

            if (response.ok) {
                localStorage.setItem('user', JSON.stringify(data.user));
                if (onLoginSuccess) {
                    onLoginSuccess(data.user);
                } else {
                    onNavigate('home');
                }
            } else {
                alert(data.message);
            }
        } catch (error) {
            alert("Server is not responding. Did you start the Node.js server?");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <section className="login-container">
            <div className="login__header">
                <img className="login__logo" src="/logo.png" alt="AgriBid logo" />
                <div className="login__brand">AgriBid</div>
                <h1 className="login__title">Welcome Back</h1>
                <p className="login__subtitle">Login to manage your crops, bids and sales.</p>
            </div>
            <div className="login__card">
                <div className="login__toggle-tabs">
                    <button
                        type="button"
                        className={`tab-btn ${activeRole === 'Farmer' ? 'active green' : ''}`}
                        onClick={() => setActiveRole('Farmer')}
                    >Farmer</button>
                    <button
                        type="button"
                        className={`tab-btn ${activeRole === 'Buyer' ? 'active blue' : ''}`}
                        onClick={() => setActiveRole('Buyer')}
                    >Buyer</button>
                </div>

                <form className="login__form" onSubmit={handleLogin}>
                    <div className="form__group">
                        <label>Email Address *</label>
                        <div className="input-wrapper">
                            <input
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form__group">
                        <label>Phone Number *</label>
                        <div className="input-wrapper">
                            <input
                                type="tel"
                                placeholder="Enter your registered phone number"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <div className="form__group">
                        <label>Password *</label>
                        <div className="input-wrapper">
                            <input
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>
                    </div>

                    <button type="submit" className="login-btn green-btn" disabled={isSubmitting}>
                        {isSubmitting ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                <p className="signup-link">
                    New to AgriBid? <span onClick={() => onNavigate('signup')}>Create an account</span>
                </p>
            </div>
        </section>
    );
};

export default LoginPage;