import React, { useEffect, useMemo, useState } from 'react';
import './DashboardPage.css';
import AnalyticsPanel from './AnalyticsPanel';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';
import CompanionPlanting from '../Companion/CompanionPlanting';
import { ListingImage } from './listingImages';
import { prepareImageForUpload, todayIso } from '../../utils/imageTools';

const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  `http://${window.location.hostname || 'localhost'}:5000/api`;


// Receiving UPI account for the manual-UPI flow. Configure it with
// REACT_APP_UPI_ID (and REACT_APP_UPI_NAME) at build time. There is
// deliberately no default: the old code showed a fake "your-upi-id@bank".
const UPI_ID = process.env.REACT_APP_UPI_ID || '';
const UPI_NAME = process.env.REACT_APP_UPI_NAME || 'AgriTrade';
const upiLink = (transaction) => {
  const amount = Number(transaction?.totalAmount || 0).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR`;
};

const DashboardPage = ({ user, onLogout, onNavigate }) => {
  const [activeTab, setActiveTab] = useState(
    user?.role === 'Farmer' ? 'dashboard' : 'browse'
  );

  const [crops, setCrops] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [farmerBids, setFarmerBids] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] =
    useState('All Categories');

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [otpModal, setOtpModal] = useState({
    open: false,
    transactionId: null,
    otpCode: '',
  });

  const [upiModal, setUpiModal] = useState({
    open: false,
    transaction: null,
  });

  const [uploadData, setUploadData] = useState({
    cropName: '',
    variety: '',
    quantityKg: '',
    location: '',
    harvestedDate: '',
    basePrice: '',
    category: 'Grains',
    imageUrl: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const userId = user?.id || user?._id || '';
  const isFarmer = user?.role === 'Farmer';

  const fetchJson = async (url, options = {}) => {
    const token = localStorage.getItem('token');
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      // Token missing/expired - force back to login rather than
      // showing a confusing generic error.
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      if (onLogout) onLogout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  };

  const loadData = async () => {
    if (!userId) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const [cropData, notifData] = await Promise.all([
        fetchJson(`${API_BASE}/crops`),
        fetchJson(`${API_BASE}/notifications/${userId}`),
      ]);

      setCrops(cropData.crops || []);
      setNotifications(notifData.notifications || []);
      setUnreadCount(notifData.unreadCount || 0);

      if (isFarmer) {
        const [bidData, txnData] = await Promise.all([
          fetchJson(`${API_BASE}/bids/farmer/${userId}`),
          fetchJson(
            `${API_BASE}/transactions/user/${userId}?role=Farmer`
          ),
        ]);

        setFarmerBids(bidData.bids || []);
        setTransactions(txnData.transactions || []);
      } else {
        const [bidData, txnData] = await Promise.all([
          fetchJson(`${API_BASE}/bids/buyer/${userId}`),
          fetchJson(
            `${API_BASE}/transactions/user/${userId}?role=Buyer`
          ),
        ]);

        setMyBids(bidData.bids || []);
        setTransactions(txnData.transactions || []);
      }
    } catch (error) {
      // Inline banner with a retry button instead of a blocking alert().
      setLoadError(error.message || 'Could not load your data.');
    } finally {
      setIsLoading(false);
    }
  };

  // The analytics client fires this when the server says the token is no
  // longer valid, so the user lands on the login page instead of seeing
  // charts silently fail.
  useEffect(() => {
    const handleUnauthorized = () => {
      if (onLogout) onLogout();
    };
    window.addEventListener('agritrade:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('agritrade:unauthorized', handleUnauthorized);
  }, [onLogout]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isFarmer]);

  const categoryOptions = useMemo(
    () => ['All Categories', ...new Set(crops.map((item) => item.category))],
    [crops]
  );

  const visibleListings = useMemo(() => {
    return crops.filter((item) => {
      const matchesSearch =
        item.cropName
          .toLowerCase()
          .includes(searchText.toLowerCase()) ||
        item.variety
          .toLowerCase()
          .includes(searchText.toLowerCase());

      const matchesCategory =
        selectedCategory === 'All Categories' ||
        item.category === selectedCategory;

      return (
        matchesSearch &&
        matchesCategory &&
        item.status === 'open'
      );
    });
  }, [crops, searchText, selectedCategory]);

  const myListings = useMemo(() => {
    if (!isFarmer) return [];

    return crops.filter(
      (item) =>
        String(item.farmerId) === String(userId) &&
        item.status === 'open'
    );
  }, [isFarmer, crops, userId]);

  const wonBids = useMemo(
    () =>
      myBids.filter(
        (bid) =>
          bid.status === 'accepted' ||
          bid.status === 'delivery_completed'
      ),
    [myBids]
  );

  const totalRevenue = useMemo(() => {
    if (!isFarmer) return 0;

    return transactions.reduce(
      (sum, item) => sum + (item.payout || 0),
      0
    );
  }, [isFarmer, transactions]);

  const farmerStats = [
    {
      label: 'Active Listings',
      value: myListings.length || 0,
      accent: 'green',
    },
    {
      label: 'Active Bids',
      value: farmerBids.filter(
        (item) => item.status === 'active'
      ).length,
      accent: 'blue',
    },
    {
      label: 'Total Revenue',
      value: `INR ${totalRevenue.toLocaleString()}`,
      accent: 'purple',
    },
  ];

  const buyerStats = [
    {
      label: 'Available Crops',
      value: visibleListings.length,
      accent: 'blue',
    },
    {
      label: 'My Active Bids',
      value: myBids.length,
      accent: 'green',
    },
    {
      label: 'Won Bids',
      value: wonBids.length,
      accent: 'purple',
    },
  ];

  const handleUploadChange = (event) => {
    const { name, value, files } = event.target;

    if (name === 'imageFile') {
      const file = files && files[0];

      if (!file) {
        setUploadData((prev) => ({
          ...prev,
          imageUrl: '',
        }));
        return;
      }

      // Shrink to a few hundred KB in the browser (server limit: 400 KB).
      prepareImageForUpload(file)
        .then((dataUri) => {
          setUploadData((prev) => ({
            ...prev,
            imageUrl: dataUri,
          }));
        })
        .catch((err) => {
          window.alert(err.message);
          event.target.value = '';
          setUploadData((prev) => ({
            ...prev,
            imageUrl: '',
          }));
        });
      return;
    }

    setUploadData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const addListing = async (event) => {
    event.preventDefault();

    const quantityKg = Number(uploadData.quantityKg);
    const basePrice = Number(uploadData.basePrice);

    if (
      !uploadData.cropName ||
      !uploadData.variety ||
      !quantityKg ||
      !basePrice
    ) {
      return;
    }

    try {
      await fetchJson(`${API_BASE}/crops`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cropName: uploadData.cropName,
          variety: uploadData.variety,
          quantityKg,
          location:
            uploadData.location ||
            user.location ||
            'India',
          harvestedDate:
            uploadData.harvestedDate ||
            todayIso(),
          basePrice,
          category: uploadData.category,
          // Only a photo the farmer uploaded is sent. With none, the server
          // looks up a real photo of the crop (or the card shows an icon).
          imageUrl: uploadData.imageUrl || undefined,
        }),
      });

      setUploadData({
        cropName: '',
        variety: '',
        quantityKg: '',
        location: '',
        harvestedDate: '',
        basePrice: '',
        category: 'Grains',
        imageUrl: '',
      });

      setShowUploadForm(false);
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const placeBid = async (listing) => {
    const rawBid = window.prompt(
      `Place your bid for ${listing.cropName} ${listing.variety}. Current bid: INR ${listing.currentBid}/kg`,
      String(listing.currentBid + 1)
    );

    if (!rawBid) return;

    const bidValue = Number(rawBid);

    if (
      !Number.isFinite(bidValue) ||
      bidValue <= listing.currentBid
    ) {
      window.alert(
        'Bid amount should be greater than current bid.'
      );
      return;
    }

    try {
      await fetchJson(`${API_BASE}/bids`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cropId: listing._id,
          amount: bidValue,
        }),
      });

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const acceptBid = async (bidId) => {
    try {
      await fetchJson(`${API_BASE}/bids/${bidId}/accept`, {
        method: 'POST',
      });

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const startUpiPayment = (transaction) => {
    setUpiModal({
      open: true,
      transaction,
    });
  };

  const confirmUpiPayment = async () => {
    if (!upiModal.transaction) return;

    try {
      await fetchJson(
        `${API_BASE}/transactions/${upiModal.transaction._id}/confirm-upi-payment`,
        {
          method: 'POST',
        }
      );

      window.alert('Payment marked as completed.');

      setUpiModal({
        open: false,
        transaction: null,
      });

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  // Real Razorpay checkout: creates an order via the backend, opens
  // Razorpay's hosted checkout, and on success sends the signed
  // response to /verify-payment. This was previously dead code from
  // the frontend's side - verify-payment existed but nothing ever
  // called create-order or opened the checkout widget, so it could
  // never actually succeed. Requires window.Razorpay, loaded via the
  // checkout.js script tag in public/index.html.
  const startRazorpayPayment = async (transaction) => {
    if (!window.Razorpay) {
      window.alert('Payment gateway failed to load. Check your internet connection and try again.');
      return;
    }

    try {
      const order = await fetchJson(
        `${API_BASE}/transactions/${transaction._id}/create-order`,
        { method: 'POST' }
      );

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'AgriTrade AI',
        description: `Payment for ${transaction.cropId?.cropName || 'crop purchase'}`,
        handler: async (response) => {
          try {
            await fetchJson(
              `${API_BASE}/transactions/${transaction._id}/verify-payment`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                }),
              }
            );
            window.alert('Payment verified successfully.');
            await loadData();
          } catch (error) {
            // Order was paid on Razorpay's side but our signature check
            // failed or the request errored - don't tell the buyer it
            // succeeded when we can't confirm that ourselves.
            window.alert(`Payment made, but verification failed: ${error.message}. Please contact support.`);
          }
        },
        modal: {
          ondismiss: () => {
            // Buyer closed the checkout without paying. Transaction
            // stays in awaiting_payment - they can just retry.
          },
        },
      });

      rzp.open();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markDispatch = async (transactionId) => {
    try {
      await fetchJson(
        `${API_BASE}/transactions/${transactionId}/mark-dispatch`,
        {
          method: 'POST',
        }
      );

      window.alert(
        'Dispatch marked and OTP sent to buyer notifications.'
      );

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const openOtpModal = (transactionId) => {
    setOtpModal({
      open: true,
      transactionId,
      otpCode: '',
    });
  };

  const submitOtp = async () => {
    try {
      await fetchJson(
        `${API_BASE}/transactions/${otpModal.transactionId}/complete-delivery`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            otpCode: otpModal.otpCode,
          }),
        }
      );

      setOtpModal({
        open: false,
        transactionId: null,
        otpCode: '',
      });

      window.alert('Delivery marked completed.');

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await fetchJson(
        `${API_BASE}/notifications/${notificationId}/read`,
        {
          method: 'PATCH',
        }
      );

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markAllRead = async () => {
    try {
      await fetchJson(
        `${API_BASE}/notifications/user/${userId}/read-all`,
        {
          method: 'PATCH',
        }
      );

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

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

            {(activeTab === 'dashboard' ||
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

            )}

            {/* ================= FARMER ACTIONS ================= */}

            {isFarmer &&
              activeTab === 'dashboard' && (

                <section className="farmer-actions">

                  <button
                    className="action-btn green"
                    onClick={() => {
                      setActiveTab('upload');
                      setShowUploadForm(true);
                    }}
                  >
                    Upload New Crop
                  </button>

                  <button
                    className="action-btn purple"
                    onClick={() =>
                      setActiveTab('companion')
                    }
                  >
                    Companion Planting Guide
                  </button>

                </section>

              )}

            {/* ================= BUYER SEARCH ================= */}

            {!isFarmer &&
              activeTab === 'browse' && (

                <section className="search-bar">

                  <input
                    type="text"
                    placeholder="Search crops..."
                    value={searchText}
                    onChange={(event) =>
                      setSearchText(event.target.value)
                    }
                  />

                  <select
                    value={selectedCategory}
                    onChange={(event) =>
                      setSelectedCategory(event.target.value)
                    }
                  >

                    {categoryOptions.map((option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ))}

                  </select>

                </section>

              )}

            {/* ================= UPLOAD CROP ================= */}

            {(showUploadForm ||
              activeTab === 'upload') &&
              isFarmer && (

                <section className="upload-form-wrap">

                  <form
                    className="upload-form"
                    onSubmit={addListing}
                  >

                    <input
                      name="cropName"
                      value={uploadData.cropName}
                      onChange={handleUploadChange}
                      placeholder="Crop Name"
                      required
                    />

                    <input
                      name="variety"
                      value={uploadData.variety}
                      onChange={handleUploadChange}
                      placeholder="Variety"
                      required
                    />

                    <input
                      name="quantityKg"
                      type="number"
                      min="1"
                      value={uploadData.quantityKg}
                      onChange={handleUploadChange}
                      placeholder="Quantity (kg)"
                      required
                    />

                    <input
                      name="location"
                      value={uploadData.location}
                      onChange={handleUploadChange}
                      placeholder="Location"
                    />

                    <input
                      name="harvestedDate"
                      value={uploadData.harvestedDate}
                      onChange={handleUploadChange}
                      placeholder="Harvested Date"
                    />

                    <input
                      name="basePrice"
                      type="number"
                      min="1"
                      value={uploadData.basePrice}
                      onChange={handleUploadChange}
                      placeholder="Base Price (INR/kg)"
                      required
                    />

                    <label className="upload-label">
                      Upload Crop Image
                    </label>

                    <input
                      name="imageFile"
                      type="file"
                      accept="image/*"
                      onChange={handleUploadChange}
                    />

                    {uploadData.imageUrl && (
                      <img
                        className="upload-preview"
                        src={uploadData.imageUrl}
                        alt="Preview"
                      />
                    )}

                    <select
                      name="category"
                      value={uploadData.category}
                      onChange={handleUploadChange}
                    >
                      <option value="Grains">
                        Grains
                      </option>

                      <option value="Vegetables">
                        Vegetables
                      </option>

                      <option value="Fruits">
                        Fruits
                      </option>

                      <option value="Leafy">
                        Leafy crops
                      </option>
                    </select>

                    <button
                      type="submit"
                      className="action-btn green"
                    >
                      Save Listing
                    </button>

                  </form>

                </section>

              )}

            {/* ================= CROP LISTINGS ================= */}

            {(activeTab === 'dashboard' ||
              activeTab === 'browse') && (

              <section className="listing-section">

                <div className="listing-header">

                  <h2>
                    {isFarmer
                      ? 'My Active Listings'
                      : 'Available Crops'}
                  </h2>

                  <span>
                    {isFarmer
                      ? myListings.length
                      : visibleListings.length}
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

                    </article>

                  ))}

                </div>

              </section>

            )}

            {/* ================= FARMER BIDS ================= */}

            {isFarmer &&
              activeTab === 'dashboard' && (

                <section className="listing-section">

                  <div className="listing-header">
                    <h2>Bids on My Crops</h2>
                  </div>

                  <div className="simple-list">

                    {farmerBids.map((bid) => (

                      <div
                        key={bid._id}
                        className="simple-item"
                      >

                        <div>

                          <strong>
                            {bid.cropId?.cropName} (
                            {bid.cropId?.variety})
                          </strong>

                          <p>
                            Buyer: {bid.buyerId?.fullName} |
                            Bid: INR {bid.amount}/kg |
                            Status: {bid.status}
                          </p>

                          <p>
                            {bid.buyerId?.location ||
                              'Buyer location not set'}
                          </p>

                          <p>
                            Delivery Address:{' '}
                            {bid.buyerId?.deliveryAddress ||
                              'Not provided'}
                          </p>

                        </div>

                        {bid.status === 'active' &&
                          bid.cropId?.status === 'open' && (

                            <button
                              className="bid-btn"
                              onClick={() =>
                                acceptBid(bid._id)
                              }
                            >
                              Accept Bid
                            </button>

                          )}

                      </div>

                    ))}

                  </div>

                </section>

              )}

            {/* ================= BUYER BIDS ================= */}

            {!isFarmer &&
              activeTab === 'mybids' && (

                <section className="listing-section">

                  <div className="listing-header">
                    <h2>My Bids</h2>
                  </div>

                  <div className="simple-list">

                    {myBids.map((bid) => (

                      <div
                        key={bid._id}
                        className="simple-item"
                      >

                        <div>

                          <strong>
                            {bid.cropId?.cropName} (
                            {bid.cropId?.variety})
                          </strong>

                          <p>
                            Bid: INR {bid.amount}/kg |
                            Status: {bid.status}
                          </p>

                        </div>

                      </div>

                    ))}

                  </div>

                </section>

              )}

            {/* ================= TRANSACTIONS ================= */}

            {activeTab === 'transactions' && (

              <section className="listing-section">

                <div className="listing-header">
                  <h2>Transactions</h2>
                </div>

                <div className="simple-list">

                  {transactions.map((txn) => (

                    <div
                      key={txn._id}
                      className="simple-item"
                    >

                      <div>

                        <strong>
                          {txn.cropId?.cropName} -{' '}
                          {txn.cropId?.quantityKg} kg
                        </strong>

                        <p>
                          Status: {txn.status} | Amount: INR{' '}
                          {txn.totalAmount?.toLocaleString()} |
                          Platform Fee: INR{' '}
                          {txn.platformFee?.toLocaleString()} |
                          Payout: INR{' '}
                          {txn.payout?.toLocaleString()}
                        </p>

                      </div>

                      {!isFarmer &&
                        txn.status === 'awaiting_payment' && (

                          <button
                            className="bid-btn"
                            onClick={() =>
                              startUpiPayment(txn)
                            }
                          >
                            Pay Now (UPI)
                          </button>

                        )}

                      {!isFarmer &&
                        txn.status === 'awaiting_payment' && (

                          <button
                            className="bid-btn"
                            onClick={() =>
                              startRazorpayPayment(txn)
                            }
                            style={{ marginLeft: '8px' }}
                          >
                            Pay Now (Card/Netbanking)
                          </button>

                        )}

                      {isFarmer &&
                        txn.status === 'payment_confirmed' && (

                          <button
                            className="bid-btn"
                            onClick={() =>
                              markDispatch(txn._id)
                            }
                          >
                            Mark Dispatch
                          </button>

                        )}

                      {!isFarmer &&
                        txn.status === 'dispatched' && (

                          <button
                            className="bid-btn"
                            onClick={() =>
                              openOtpModal(txn._id)
                            }
                          >
                            Enter OTP
                          </button>

                        )}

                    </div>

                  ))}

                </div>

              </section>

            )}

            {/* ================= COMPANION PLANTING ================= */}

            {activeTab === 'companion' && <CompanionPlanting />}

            {/* ================= NOTIFICATIONS ================= */}

            <section className="listing-section">

              <div className="listing-header">

                <h2>
                  Notifications{' '}

                  {unreadCount > 0 && (
                    <span className="badge">
                      {unreadCount}
                    </span>
                  )}
                </h2>

                <button
                  className="small-btn"
                  onClick={markAllRead}
                >
                  Mark all read
                </button>

              </div>

              <div className="simple-list">

                {notifications.slice(0, 10).map((item) => (

                  <div
                    key={item._id}
                    className={`simple-item ${
                      item.isRead
                        ? 'read'
                        : 'unread'
                    }`}
                  >

                    <p>{item.message}</p>

                    {!item.isRead && (
                      <button
                        className="small-btn"
                        onClick={() =>
                          markNotificationRead(item._id)
                        }
                      >
                        Mark read
                      </button>
                    )}

                  </div>

                ))}

                {notifications.length === 0 && (
                  <div className="simple-item">
                    <p>No notifications yet.</p>
                  </div>
                )}

              </div>

            </section>

          </>

        )}

      </main>

      {/* ================= UPI MODAL ================= */}

      {upiModal.open && (

        <div className="modal-backdrop">

          <div className="modal-card">

            <h3>UPI Payment</h3>

            <p>
              Scan the QR code or use the UPI ID below to
              pay the total amount.
            </p>

            <div
              style={{
                textAlign: 'center',
                margin: '16px 0',
              }}
            >

              {UPI_ID ? (
                <>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink(upiModal.transaction))}`}
                    alt="UPI QR"
                    style={{
                      width: 200,
                      height: 200,
                    }}
                  />

                  <div style={{ marginTop: 8 }}>
                    <strong>UPI ID:</strong>{' '}
                    {UPI_ID}
                  </div>

                  <a
                    href={upiLink(upiModal.transaction)}
                    style={{ display: 'inline-block', marginTop: 8 }}
                  >
                    Open in my UPI app
                  </a>
                </>
              ) : (
                <div
                  style={{
                    background: '#fff8e1',
                    border: '1px solid #ffe082',
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 14,
                  }}
                >
                  <strong>Demo mode:</strong> UPI payments are not set
                  up for this deployment (no receiving UPI ID is
                  configured), so there is no QR code to scan.
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <strong>Amount:</strong> INR{' '}
                {upiModal.transaction?.totalAmount?.toLocaleString()}
              </div>

            </div>

            <p>
              After payment, click below to confirm.
            </p>

            <div className="modal-actions">

              <button
                className="small-btn"
                onClick={() =>
                  setUpiModal({
                    open: false,
                    transaction: null,
                  })
                }
              >
                Cancel
              </button>

              <button
                className="bid-btn modal-submit"
                onClick={confirmUpiPayment}
              >
                I have paid
              </button>

            </div>

          </div>

        </div>

      )}

      {/* ================= OTP MODAL ================= */}

      {otpModal.open && (

        <div className="modal-backdrop">

          <div className="modal-card">

            <h3>Delivery OTP Verification</h3>

            <p>
              Enter the secure OTP sent after dispatch.
            </p>

            <input
              type="text"
              value={otpModal.otpCode}
              onChange={(e) =>
                setOtpModal((prev) => ({
                  ...prev,
                  otpCode: e.target.value,
                }))
              }
              placeholder="Enter 6-digit OTP"
            />

            <div className="modal-actions">

              <button
                className="small-btn"
                onClick={() =>
                  setOtpModal({
                    open: false,
                    transactionId: null,
                    otpCode: '',
                  })
                }
              >
                Cancel
              </button>

              <button
                className="bid-btn modal-submit"
                onClick={submitOtp}
              >
                Submit OTP
              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
};

export default DashboardPage;