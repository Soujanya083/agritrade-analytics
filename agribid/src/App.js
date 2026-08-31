import React, { useEffect, useState } from 'react';
import Hero from './components/Hero/Hero';
import Features from './components/Features/Features';
import HowItWorks from './components/HowItWorks/HowItWorks';
import Footer from './components/Footer/Footer';
import LoginPage from './components/Auth/LoginPage';
import SignupPage from './components/Auth/SignupPage';
import DashboardPage from './components/Dashboard/DashboardPage';
import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('home');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setCurrentUser(parsedUser);
        setCurrentView('dashboard');
      } catch (error) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  const navigateTo = (viewName) => {
    setCurrentView(viewName);
    window.scrollTo(0, 0);
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    navigateTo('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    setCurrentUser(null);
    navigateTo('home');
  };

  const renderView = () => {
    switch (currentView) {
      case 'home':
        return (
          <>
            <Hero onNavigate={navigateTo} />
            <Features />
            <HowItWorks />
            <section className="cta-section">
              <div className="cta-container">
                <h2 className="cta-title">Ready to Get Started?</h2>
                <p className="cta-text">
                  Join thousands of farmers and buyers already trading on AgriMarket
                </p>
                <button 
                  className="cta-button" 
                  onClick={() => navigateTo('signup')}
                >
                  Sign Up Now
                </button>
              </div>
            </section>
            <Footer />
          </>
        );

      case 'login':
        return (
          <div className="auth-wrapper">
            <button className="back-home-btn" onClick={() => navigateTo('home')}>
              ← Back to Home
            </button>
            <LoginPage onNavigate={navigateTo} onLoginSuccess={handleLoginSuccess} />
          </div>
        );

      case 'signup':
        return (
          <div className="auth-wrapper">
            <button className="back-home-btn" onClick={() => navigateTo('home')}>
              ← Back to Home
            </button>
            <SignupPage onNavigate={navigateTo} />
          </div>
        );

      case 'dashboard':
        return <DashboardPage user={currentUser} onLogout={handleLogout} onNavigate={navigateTo} />;

      default:
        return <Hero onNavigate={navigateTo} />;
    }
  };

  return (
    <div className="App">
      <main>
        {renderView()}
      </main>
    </div>
  );
}

export default App;