import React from 'react';

const TopNav = ({ activeTab, isFarmer, onLogout, setActiveTab, user }) => (
  (
    <header className="top-nav">

      <div className="brand">
        <img
          className="brand__logo"
          src="/logo.png"
          alt="AgriBid logo"
        />
        <span>AgriBid</span>
      </div>

      <nav>
        {isFarmer ? (
          <>
            <button
              className={`nav-link ${
                activeTab === 'dashboard' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>

            <button
              className={`nav-link ${
                activeTab === 'upload' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('upload')}
            >
              Upload Crop
            </button>

            <button
              className={`nav-link ${
                activeTab === 'transactions' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('transactions')}
            >
              Transactions
            </button>

            <button
              className={`nav-link ${
                activeTab === 'companion' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('companion')}
            >
              Companion Planting
            </button>

            <button
              className={`nav-link ${
                activeTab === 'analytics' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('analytics')}
            >
              Analytics
            </button>

            <button
              className={`nav-link ${
                activeTab === 'market-intelligence' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('market-intelligence')}
            >
              Market Intelligence
            </button>
          </>
        ) : (
          <>
            <button
              className={`nav-link ${
                activeTab === 'browse' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('browse')}
            >
              Browse Crops
            </button>

            <button
              className={`nav-link ${
                activeTab === 'mybids' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('mybids')}
            >
              My Bids
            </button>

            <button
              className={`nav-link ${
                activeTab === 'transactions' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('transactions')}
            >
              Transactions
            </button>

            <button
              className={`nav-link ${
                activeTab === 'companion' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('companion')}
            >
              Companion Planting
            </button>

            <button
              className={`nav-link ${
                activeTab === 'analytics' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('analytics')}
            >
              Analytics
            </button>

            <button
              className={`nav-link ${
                activeTab === 'market-intelligence' ? 'active' : ''
              }`}
              onClick={() => setActiveTab('market-intelligence')}
            >
              Market Intelligence
            </button>
          </>
        )}
      </nav>

      <div className="profile-chip">
        <div>
          <div className="name">{user.fullName}</div>
          <div className="role">{user.role}</div>
        </div>

        <button
          onClick={onLogout}
          className="logout-btn"
        >
          Logout
        </button>
      </div>

    </header>
  )
);

export default TopNav;
