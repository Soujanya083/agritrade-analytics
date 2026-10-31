// DashboardPage.js - the dashboard shell: navigation, tab switching and layout.
// State and actions live in useDashboardData.js; each screen is a component in sections/.
import React from 'react';
import './DashboardPage.css';
import AnalyticsPanel from './AnalyticsPanel';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';
import CompanionPlanting from '../Companion/CompanionPlanting';
import useDashboardData from './useDashboardData';
import TopNav from './sections/TopNav';
import StatGrid from './sections/StatGrid';
import FarmerActions from './sections/FarmerActions';
import BuyerSearch from './sections/BuyerSearch';
import UploadForm from './sections/UploadForm';
import CropListings from './sections/CropListings';
import FarmerBids from './sections/FarmerBids';
import BuyerBids from './sections/BuyerBids';
import TransactionsSection from './sections/TransactionsSection';
import UpiModal from './sections/UpiModal';
import NotificationsSection from './sections/NotificationsSection';
import OtpModal from './sections/OtpModal';

const DashboardPage = ({ user, onLogout, onNavigate }) => {
  const {
    acceptBid,
    activeTab,
    addListing,
    buyerStats,
    categoryOptions,
    confirmUpiPayment,
    deleteListing,
    farmerBids,
    farmerStats,
    handleUploadChange,
    isFarmer,
    isLoading,
    isLoadingMore,
    listingHasMore,
    listingTotal,
    loadData,
    loadError,
    loadMoreListings,
    markAllRead,
    markDispatch,
    markNotificationRead,
    myBids,
    myListings,
    notifications,
    openOtpModal,
    otpModal,
    placeBid,
    searchText,
    selectedCategory,
    setActiveTab,
    setOtpModal,
    setSearchText,
    setSelectedCategory,
    setShowUploadForm,
    setUpiModal,
    showUploadForm,
    startRazorpayPayment,
    startUpiPayment,
    submitOtp,
    transactions,
    unreadCount,
    upiModal,
    uploadData,
    userId,
    visibleListings,
  } = useDashboardData({ user, onLogout });

  if (!user) {
    return (
      <div className="dashboard-empty">
        <p>Session expired. Please login again.</p>

        <button
          onClick={() => onNavigate('login')}
          className="action-btn green"
        >
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-page">

      {/* ================= NAVIGATION ================= */}

      <TopNav
        activeTab={activeTab}
        isFarmer={isFarmer}
        onLogout={onLogout}
        setActiveTab={setActiveTab}
        user={user}
      />

      {/* ================= MAIN CONTENT ================= */}

      <main className="dashboard-content">

        {/* ANALYTICS PAGE */}

        {activeTab === 'analytics' ? (

          <>
            <h1>Analytics Dashboard</h1>

            <p className="subheading">
              Explore crop prices, demand forecasts, buyer behaviour and marketplace insights.
            </p>

            <AnalyticsPanel />
          </>

        ) : activeTab === 'market-intelligence' ? (

          <>
            <h1>Market Intelligence Dashboard</h1>

            <p className="subheading">
              Research-facing view: data quality, seasonal patterns, market-wide crop scoring,
              anomaly detection, and decision backtesting - separate from the per-crop
              operational analytics above.
            </p>

            <MarketIntelligenceDashboard />
          </>

        ) : (

          <>

            <h1>Welcome back, {user.fullName}!</h1>

            <p className="subheading">
              {isFarmer
                ? 'Manage your crops and track your sales'
                : 'Browse and bid on quality crops from verified farmers'}
            </p>

            {isLoading && (
              <p className="subheading">
                Loading data...
              </p>
            )}

            {loadError && (
              <div
                role="alert"
                style={{
                  background: '#fdecea',
                  border: '1px solid #f5c6cb',
                  color: '#8a1c1c',
                  borderRadius: 10,
                  padding: '10px 14px',
                  margin: '12px 0',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span>{loadError}</span>
                <button
                  type="button"
                  className="small-btn"
                  onClick={loadData}
                >
                  Retry
                </button>
              </div>
            )}

            {/* ================= STATS ================= */}

            <StatGrid
              activeTab={activeTab}
              buyerStats={buyerStats}
              farmerStats={farmerStats}
              isFarmer={isFarmer}
            />

            {/* ================= FARMER ACTIONS ================= */}

            <FarmerActions
              activeTab={activeTab}
              isFarmer={isFarmer}
              setActiveTab={setActiveTab}
              setShowUploadForm={setShowUploadForm}
            />

            {/* ================= BUYER SEARCH ================= */}

            <BuyerSearch
              activeTab={activeTab}
              categoryOptions={categoryOptions}
              isFarmer={isFarmer}
              searchText={searchText}
              selectedCategory={selectedCategory}
              setSearchText={setSearchText}
              setSelectedCategory={setSelectedCategory}
            />

            {/* ================= UPLOAD CROP ================= */}

            <UploadForm
              activeTab={activeTab}
              addListing={addListing}
              handleUploadChange={handleUploadChange}
              isFarmer={isFarmer}
              showUploadForm={showUploadForm}
              uploadData={uploadData}
            />

            {/* ================= CROP LISTINGS ================= */}

            <CropListings
              activeTab={activeTab}
              deleteListing={deleteListing}
              isFarmer={isFarmer}
              isLoadingMore={isLoadingMore}
              listingHasMore={listingHasMore}
              listingTotal={listingTotal}
              loadMoreListings={loadMoreListings}
              myListings={myListings}
              placeBid={placeBid}
              userId={userId}
              visibleListings={visibleListings}
            />

            {/* ================= FARMER BIDS ================= */}

            <FarmerBids
              acceptBid={acceptBid}
              activeTab={activeTab}
              farmerBids={farmerBids}
              isFarmer={isFarmer}
            />

            {/* ================= BUYER BIDS ================= */}

            <BuyerBids activeTab={activeTab} isFarmer={isFarmer} myBids={myBids} />

            {/* ================= TRANSACTIONS ================= */}

            <TransactionsSection
              activeTab={activeTab}
              isFarmer={isFarmer}
              markDispatch={markDispatch}
              openOtpModal={openOtpModal}
              startRazorpayPayment={startRazorpayPayment}
              startUpiPayment={startUpiPayment}
              transactions={transactions}
            />

            {/* ================= COMPANION PLANTING ================= */}

            {activeTab === 'companion' && <CompanionPlanting />}

            {/* ================= NOTIFICATIONS ================= */}

            <NotificationsSection
              markAllRead={markAllRead}
              markNotificationRead={markNotificationRead}
              notifications={notifications}
              unreadCount={unreadCount}
            />

          </>

        )}

      </main>

      {/* ================= UPI MODAL ================= */}

      <UpiModal confirmUpiPayment={confirmUpiPayment} setUpiModal={setUpiModal} upiModal={upiModal} />

      {/* ================= OTP MODAL ================= */}

      <OtpModal otpModal={otpModal} setOtpModal={setOtpModal} submitOtp={submitOtp} />

    </div>
  );
};

export default DashboardPage;
