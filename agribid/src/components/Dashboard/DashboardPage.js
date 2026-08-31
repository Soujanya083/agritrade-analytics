import React, { useEffect, useMemo, useState } from 'react';
import './DashboardPage.css';
import AnalyticsPanel from './AnalyticsPanel';

const API_BASE = process.env.REACT_APP_API_BASE_URL || `http://${window.location.hostname || 'localhost'}:5000/api`;
const COMPANION_GUIDE = [
  {
    crop: 'Tomato',
    season: 'Warm season',
    category: 'Vegetables',
    bestWith: ['Basil', 'Marigold', 'Onion'],
    avoid: ['Potato', 'Cabbage'],
    benefits: ['Repels pests naturally', 'Improves bed diversity', 'Supports healthier fruit set'],
    tip: 'Keep plants spaced and prune lower leaves for airflow.',
  },
  {
    crop: 'Onion',
    season: 'Winter',
    category: 'Vegetables',
    bestWith: ['Carrot', 'Beetroot', 'Lettuce'],
    avoid: ['Beans', 'Peas'],
    benefits: ['Deters carrot fly', 'Uses limited space efficiently', 'Pairs well in mixed beds'],
    tip: 'Intercrop in rows to keep harvesting simple.',
  },
  {
    crop: 'Carrot',
    season: 'Winter',
    category: 'Vegetables',
    bestWith: ['Onion', 'Leek', 'Radish'],
    avoid: ['Dill', 'Parsnip'],
    benefits: ['Helpful root pairing', 'Reduces pest pressure', 'Improves soil coverage'],
    tip: 'Use loose, stone-free soil for straight roots.',
  },
  {
    crop: 'Potato',
    season: 'Winter/Spring',
    category: 'Vegetables',
    bestWith: ['Beans', 'Cabbage', 'Corn'],
    avoid: ['Tomato', 'Cucumber'],
    benefits: ['Encourages mixed rooting depth', 'Makes better use of bed area', 'Balances nutrients'],
    tip: 'Rotate beds each season to reduce disease buildup.',
  },
  {
    crop: 'Cotton',
    season: 'Summer',
    category: 'Grains',
    bestWith: ['Onion', 'Sunflower', 'Cowpea'],
    avoid: ['Potato', 'Brinjal'],
    benefits: ['Supports beneficial insects', 'Provides border diversity', 'Improves field resilience'],
    tip: 'Use border crops to attract pollinators and reduce pests.',
  },
  {
    crop: 'Sugarcane',
    season: 'Year-round',
    category: 'Grains',
    bestWith: ['Coriander', 'Onion', 'Garlic'],
    avoid: ['Mustard'],
    benefits: ['Gives space for short-duration crops', 'Improves land use', 'Supports staggered harvesting'],
    tip: 'Intercrop only while the cane canopy is still open.',
  },
  {
    crop: 'Maize',
    season: 'Kharif/Summer',
    category: 'Grains',
    bestWith: ['Beans', 'Pumpkin', 'Cowpea'],
    avoid: ['Rice'],
    benefits: ['Creates a support structure for climbers', 'Spreads risk across crops', 'Improves soil cover'],
    tip: 'Plant climbers after maize is established.',
  },
  {
    crop: 'Beans',
    season: 'Warm season',
    category: 'Vegetables',
    bestWith: ['Maize', 'Carrot', 'Cabbage'],
    avoid: ['Onion', 'Garlic'],
    benefits: ['Fixes nitrogen', 'Boosts soil fertility', 'Fits well in mixed rows'],
    tip: 'Avoid over-fertilizing with nitrogen when intercropping.',
  },
  {
    crop: 'Mango',
    season: 'Summer',
    category: 'Fruits',
    bestWith: ['Turmeric', 'Ginger', 'Pigeon Pea'],
    avoid: ['Banana close spacing', 'Potato'],
    benefits: ['Allows under-canopy intercrops', 'Supports deep-root harmony', 'Improves orchard land use'],
    tip: 'Keep understory crops low and avoid shading the young trees.',
  },
  {
    crop: 'Banana',
    season: 'Year-round',
    category: 'Fruits',
    bestWith: ['Coriander', 'Spinach', 'Beans'],
    avoid: ['Potato', 'Brinjal'],
    benefits: ['Works well in humid mixed plots', 'Adds quick ground cover', 'Benefits from short-duration intercrops'],
    tip: 'Maintain wide spacing and steady moisture for best results.',
  },
  {
    crop: 'Citrus',
    season: 'Spring/Summer',
    category: 'Fruits',
    bestWith: ['Legumes', 'Alyssum', 'Marigold'],
    avoid: ['Wheat', 'Heavy climbers'],
    benefits: ['Attracts pollinators', 'Helps suppress weeds', 'Supports orchard biodiversity'],
    tip: 'Use low-growing companions so roots and canopy do not compete.',
  },
  {
    crop: 'Grapes',
    season: 'Summer',
    category: 'Fruits',
    bestWith: ['Garlic', 'Chives', 'Clover'],
    avoid: ['Potato', 'Tomato'],
    benefits: ['Improves pest management', 'Covers exposed soil', 'Helps maintain vineyard balance'],
    tip: 'Prune regularly and keep companion plants away from the vine base.',
  },
  {
    crop: 'Papaya',
    season: 'Warm season',
    category: 'Fruits',
    bestWith: ['Marigold', 'Sweet Potato', 'Beans'],
    avoid: ['Banana dense planting'],
    benefits: ['Provides useful mixed cropping space', 'Encourages pollinator activity', 'Reduces bare soil exposure'],
    tip: 'Avoid waterlogging and give each plant enough sunlight.',
  },
];

const encodeSvgDataUri = (svg) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const LISTING_IMAGES = {
  Grains: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#fef3c7" />
          <stop offset="100%" stop-color="#fff7ed" />
        </linearGradient>
        <linearGradient id="field" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#d97706" />
        </linearGradient>
      </defs>
      <rect width="480" height="320" rx="28" fill="url(#sky)" />
      <path d="M0 220C70 190 120 180 180 200C250 225 300 175 360 182C410 188 445 198 480 186V320H0Z" fill="#fcd34d" />
      <path d="M0 240C80 205 145 210 205 224C270 240 310 210 372 206C417 203 450 210 480 202V320H0Z" fill="url(#field)" />
      <g fill="#fff8dc" stroke="#b45309" stroke-width="4">
        <path d="M125 90c-12 22-10 56 0 90 12-30 19-63 0-90Z" />
        <path d="M165 70c-12 26-11 63 0 100 13-34 19-74 0-100Z" />
        <path d="M205 88c-12 22-10 56 0 90 12-30 19-63 0-90Z" />
        <path d="M245 66c-12 26-11 63 0 100 13-34 19-74 0-100Z" />
        <path d="M285 84c-12 22-10 56 0 90 12-30 19-63 0-90Z" />
        <path d="M325 74c-12 26-11 63 0 100 13-34 19-74 0-100Z" />
      </g>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial, sans-serif" font-size="28" font-weight="700">Grains</text>
    </svg>
  `),
  Vegetables: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#dcfce7" />
          <stop offset="100%" stop-color="#f0fdf4" />
        </linearGradient>
        <linearGradient id="leaf" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" />
          <stop offset="100%" stop-color="#15803d" />
        </linearGradient>
      </defs>
      <rect width="480" height="320" rx="28" fill="url(#bg)" />
      <circle cx="145" cy="180" r="48" fill="#f97316" />
      <circle cx="228" cy="170" r="56" fill="#ef4444" />
      <circle cx="314" cy="184" r="50" fill="#84cc16" />
      <path d="M120 120c-5-22 4-38 24-52 20 10 30 26 32 48-17-6-34-4-56 4Z" fill="url(#leaf)" />
      <path d="M208 102c-4-20 5-36 24-48 18 10 28 24 30 46-16-5-31-4-54 2Z" fill="url(#leaf)" />
      <path d="M300 118c-6-20 2-36 20-50 20 8 31 22 36 44-18-4-35-2-56 6Z" fill="url(#leaf)" />
      <path d="M0 244H480V320H0Z" fill="#86efac" />
      <text x="36" y="286" fill="#166534" font-family="Arial, sans-serif" font-size="28" font-weight="700">Vegetables</text>
    </svg>
  `),
  Fruits: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <defs>
        <linearGradient id="bg2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#ffe4e6" />
          <stop offset="100%" stop-color="#fff1f2" />
        </linearGradient>
      </defs>
      <rect width="480" height="320" rx="28" fill="url(#bg2)" />
      <circle cx="160" cy="176" r="56" fill="#fb7185" />
      <circle cx="245" cy="162" r="62" fill="#f97316" />
      <circle cx="332" cy="182" r="50" fill="#eab308" />
      <path d="M145 110c8-20 22-30 44-32 14 12 16 27 8 46-18-10-33-12-52-14Z" fill="#16a34a" />
      <path d="M230 92c8-20 22-30 44-32 14 12 16 27 8 46-18-10-33-12-52-14Z" fill="#16a34a" />
      <path d="M318 116c7-18 20-28 40-30 13 11 15 25 7 42-16-8-30-10-47-12Z" fill="#16a34a" />
      <text x="36" y="286" fill="#9f1239" font-family="Arial, sans-serif" font-size="28" font-weight="700">Fruits</text>
    </svg>
  `),
};

const getListingImage = (item) => LISTING_IMAGES[item.category] || LISTING_IMAGES.Vegetables;

const DashboardPage = ({ user, onLogout, onNavigate }) => {
  const [activeTab, setActiveTab] = useState(user?.role === 'Farmer' ? 'dashboard' : 'browse');
  const [crops, setCrops] = useState([]);
  const [myBids, setMyBids] = useState([]);
  const [farmerBids, setFarmerBids] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [companionSearch, setCompanionSearch] = useState('');
  const [companionCategory, setCompanionCategory] = useState('All Crops');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedCompanionCrop, setSelectedCompanionCrop] = useState(null);
  const [otpModal, setOtpModal] = useState({ open: false, transactionId: null, otpCode: '' });
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

  const userId = user?.id || user?._id || '';
  const isFarmer = user?.role === 'Farmer';

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Request failed');
    return data;
  };

  const loadData = async () => {
    if (!userId) return;
    setIsLoading(true);
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
          fetchJson(`${API_BASE}/transactions/user/${userId}?role=Farmer`),
        ]);
        setFarmerBids(bidData.bids || []);
        setTransactions(txnData.transactions || []);
      } else {
        const [bidData, txnData] = await Promise.all([
          fetchJson(`${API_BASE}/bids/buyer/${userId}`),
          fetchJson(`${API_BASE}/transactions/user/${userId}?role=Buyer`),
        ]);
        setMyBids(bidData.bids || []);
        setTransactions(txnData.transactions || []);
      }
    } catch (error) {
      window.alert(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isFarmer]);

  const categoryOptions = useMemo(
    () => ['All Categories', ...new Set(crops.map((item) => item.category))],
    [crops]
  );

  const visibleListings = useMemo(
    () =>
      crops.filter((item) => {
        const matchesSearch =
          item.cropName.toLowerCase().includes(searchText.toLowerCase()) ||
          item.variety.toLowerCase().includes(searchText.toLowerCase());
        const matchesCategory =
          selectedCategory === 'All Categories' || item.category === selectedCategory;
        return matchesSearch && matchesCategory && item.status === 'open';
      }),
    [crops, searchText, selectedCategory]
  );

  const myListings = useMemo(
    () => (
      isFarmer
        ? crops.filter(
          (item) => String(item.farmerId) === String(userId) && item.status === 'open'
        )
        : []
    ),
    [isFarmer, crops, userId]
  );

  const wonBids = useMemo(
    () => myBids.filter((bid) => bid.status === 'accepted' || bid.status === 'delivery_completed'),
    [myBids]
  );

  const totalRevenue = useMemo(
    () => (isFarmer ? transactions.reduce((sum, item) => sum + (item.payout || 0), 0) : 0),
    [isFarmer, transactions]
  );

  const companionCategories = useMemo(
    () => ['All Crops', ...new Set(COMPANION_GUIDE.map((item) => item.category))],
    []
  );

  const filteredCompanionGuide = useMemo(
    () =>
      COMPANION_GUIDE.filter((item) => {
        const matchesSearch = item.crop.toLowerCase().includes(companionSearch.toLowerCase());
        const matchesCategory = companionCategory === 'All Crops' || item.category === companionCategory;
        return matchesSearch && matchesCategory;
      }),
    [companionCategory, companionSearch]
  );

  useEffect(() => {
    if (!selectedCompanionCrop && filteredCompanionGuide.length > 0) {
      setSelectedCompanionCrop(filteredCompanionGuide[0]);
    }
    if (selectedCompanionCrop && !filteredCompanionGuide.some((item) => item.crop === selectedCompanionCrop.crop)) {
      setSelectedCompanionCrop(filteredCompanionGuide[0] || null);
    }
  }, [filteredCompanionGuide, selectedCompanionCrop]);

  const farmerStats = [
    { label: 'Active Listings', value: myListings.length || 0, accent: 'green' },
    { label: 'Active Bids', value: farmerBids.filter((item) => item.status === 'active').length, accent: 'blue' },
    { label: 'Total Revenue', value: `INR ${totalRevenue.toLocaleString()}`, accent: 'purple' },
  ];

  const buyerStats = [
    { label: 'Available Crops', value: visibleListings.length, accent: 'blue' },
    { label: 'My Active Bids', value: myBids.length, accent: 'green' },
    { label: 'Won Bids', value: wonBids.length, accent: 'purple' },
  ];

  const handleUploadChange = (event) => {
    const { name, value, files } = event.target;
    if (name === 'imageFile') {
      const file = files && files[0];
      if (!file) {
        setUploadData((prev) => ({ ...prev, imageUrl: '' }));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setUploadData((prev) => ({ ...prev, imageUrl: reader.result }));
      };
      reader.readAsDataURL(file);
      return;
    }
    setUploadData((prev) => ({ ...prev, [name]: value }));
  };

  const addListing = async (event) => {
    event.preventDefault();
    const quantityKg = Number(uploadData.quantityKg);
    const basePrice = Number(uploadData.basePrice);
    if (!uploadData.cropName || !uploadData.variety || !quantityKg || !basePrice) return;
    try {
      await fetchJson(`${API_BASE}/crops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmerId: userId,
          cropName: uploadData.cropName,
          variety: uploadData.variety,
          quantityKg,
          location: uploadData.location || user.location || 'India',
          harvestedDate: uploadData.harvestedDate || new Date().toLocaleDateString(),
          basePrice,
          category: uploadData.category,
          imageUrl: uploadData.imageUrl || getListingImage(uploadData),
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
    if (!Number.isFinite(bidValue) || bidValue <= listing.currentBid) {
      window.alert('Bid amount should be greater than current bid.');
      return;
    }
    try {
      await fetchJson(`${API_BASE}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cropId: listing._id, buyerId: userId, amount: bidValue }),
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: userId }),
      });
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  // UPI Payment Modal State
  const [upiModal, setUpiModal] = useState({ open: false, transaction: null });

  // Replace Razorpay payment with UPI QR/manual confirmation
  const startUpiPayment = (transaction) => {
    setUpiModal({ open: true, transaction });
  };

  const confirmUpiPayment = async () => {
    if (!upiModal.transaction) return;
    try {
      await fetchJson(`${API_BASE}/transactions/${upiModal.transaction._id}/confirm-upi-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: userId }),
      });
      window.alert('Payment marked as completed.');
      setUpiModal({ open: false, transaction: null });
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markDispatch = async (transactionId) => {
    try {
      await fetchJson(`${API_BASE}/transactions/${transactionId}/mark-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerId: userId }),
      });
      window.alert('Dispatch marked and OTP sent to buyer notifications.');
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const openOtpModal = (transactionId) => {
    setOtpModal({ open: true, transactionId, otpCode: '' });
  };

  const submitOtp = async () => {
    try {
      await fetchJson(`${API_BASE}/transactions/${otpModal.transactionId}/complete-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buyerId: userId, otpCode: otpModal.otpCode }),
      });
      setOtpModal({ open: false, transactionId: null, otpCode: '' });
      window.alert('Delivery marked completed.');
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await fetchJson(`${API_BASE}/notifications/${notificationId}/read`, { method: 'PATCH' });
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  const markAllRead = async () => {
    try {
      await fetchJson(`${API_BASE}/notifications/user/${userId}/read-all`, { method: 'PATCH' });
      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  };

  if (!user) {
    return (
      <div className="dashboard-empty">
        <p>Session expired. Please login again.</p>
        <button onClick={() => onNavigate('login')} className="action-btn green">
          Go to Login
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <header className="top-nav">
        <div className="brand">
          <img className="brand__logo" src="/logo.png" alt="AgriBid logo" />
          <span>AgriBid</span>
        </div>
        <nav>
          {isFarmer ? (
            <>
              <button className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
              <button className={`nav-link ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>Upload Crop</button>
              <button className={`nav-link ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
              <button className={`nav-link ${activeTab === 'companion' ? 'active' : ''}`} onClick={() => setActiveTab('companion')}>Companion Planting</button>
              <button className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
            </>
          ) : (
            <>
              <button className={`nav-link ${activeTab === 'browse' ? 'active' : ''}`} onClick={() => setActiveTab('browse')}>Browse Crops</button>
              <button className={`nav-link ${activeTab === 'mybids' ? 'active' : ''}`} onClick={() => setActiveTab('mybids')}>My Bids</button>
              <button className={`nav-link ${activeTab === 'transactions' ? 'active' : ''}`} onClick={() => setActiveTab('transactions')}>Transactions</button>
              <button className={`nav-link ${activeTab === 'companion' ? 'active' : ''}`} onClick={() => setActiveTab('companion')}>Companion Planting</button>
              <button className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>Analytics</button>
            </>
          )}
        </nav>
        <div className="profile-chip">
          <div>
            <div className="name">{user.fullName}</div>
            <div className="role">{user.role}</div>
          </div>
          <button onClick={onLogout} className="logout-btn">Logout</button>
        </div>
      </header>

      <main className="dashboard-content">
        <h1>Welcome back, {user.fullName}!</h1>
        <p className="subheading">
          {isFarmer
            ? 'Manage your crops and track your sales'
            : 'Browse and bid on quality crops from verified farmers'}
        </p>
        {isLoading && <p className="subheading">Loading data...</p>}

        {(activeTab === 'dashboard' || activeTab === 'browse') && (
          <section className="stat-grid">
            {(isFarmer ? farmerStats : buyerStats).map((item) => (
              <article key={item.label} className={`stat-card ${item.accent}`}>
                <h3>{item.label}</h3>
                <p>{item.value}</p>
              </article>
            ))}
          </section>
        )}

        {isFarmer && activeTab === 'dashboard' ? (
          <section className="farmer-actions">
            <button className="action-btn green" onClick={() => { setActiveTab('upload'); setShowUploadForm(true); }}>
              Upload New Crop
            </button>
            <button className="action-btn purple" onClick={() => setActiveTab('companion')}>
              Companion Planting Guide
            </button>
          </section>
        ) : !isFarmer && activeTab === 'browse' ? (
          <section className="search-bar">
            <input
              type="text"
              placeholder="Search crops..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        {(showUploadForm || activeTab === 'upload') && isFarmer && (
          <section className="upload-form-wrap">
            <form className="upload-form" onSubmit={addListing}>
              <input name="cropName" value={uploadData.cropName} onChange={handleUploadChange} placeholder="Crop Name" required />
              <input name="variety" value={uploadData.variety} onChange={handleUploadChange} placeholder="Variety" required />
              <input name="quantityKg" type="number" min="1" value={uploadData.quantityKg} onChange={handleUploadChange} placeholder="Quantity (kg)" required />
              <input name="location" value={uploadData.location} onChange={handleUploadChange} placeholder="Location" />
              <input name="harvestedDate" value={uploadData.harvestedDate} onChange={handleUploadChange} placeholder="Harvested Date (MM/DD/YYYY)" />
              <input name="basePrice" type="number" min="1" value={uploadData.basePrice} onChange={handleUploadChange} placeholder="Base Price (INR/kg)" required />
              <label className="upload-label">Upload Crop Image</label>
              <input name="imageFile" type="file" accept="image/*" onChange={handleUploadChange} />
              {uploadData.imageUrl && (
                <img className="upload-preview" src={uploadData.imageUrl} alt="Preview" />
              )}
              <select name="category" value={uploadData.category} onChange={handleUploadChange}>
                <option value="Grains">Grains</option>
                <option value="Vegetables">Vegetables</option>
                <option value="Fruits">Fruits</option>
              </select>
              <button type="submit" className="action-btn green">Save Listing</button>
            </form>
          </section>
        )}

        {(activeTab === 'dashboard' || activeTab === 'browse') && (
          <section className="listing-section">
            <div className="listing-header">
              <h2>{isFarmer ? 'My Active Listings' : 'Available Crops'}</h2>
              <span>{isFarmer ? myListings.length : visibleListings.length}</span>
            </div>
            <div className="listing-grid">
              {(isFarmer ? myListings : visibleListings).map((item) => (
                <article key={item._id} className="listing-card">
                  <img className="listing-image" src={item.imageUrl || getListingImage(item)} alt={`${item.cropName} ${item.variety}`} />
                  <div className="listing-body">
                    <h3>{item.cropName} - {item.variety}</h3>
                    <p>{item.quantityKg.toLocaleString()} kg</p>
                    <p>{item.location}</p>
                    <p>Harvested: {item.harvestedDate}</p>
                    <p>Status: <strong>{item.status}</strong></p>
                  </div>
                  <div className="price-row">
                    <span>Base Price: INR {item.basePrice}/kg</span>
                    <strong>Current Bid: INR {item.currentBid}/kg</strong>
                  </div>
                  {!isFarmer && <button className="bid-btn" onClick={() => placeBid(item)}>Place Bid</button>}
                </article>
              ))}
            </div>
          </section>
        )}

        {isFarmer && activeTab === 'dashboard' && (
          <section className="listing-section">
            <div className="listing-header"><h2>Bids on My Crops</h2></div>
            <div className="simple-list">
              {farmerBids.map((bid) => (
                <div key={bid._id} className="simple-item">
                  <div>
                    <strong>{bid.cropId?.cropName} ({bid.cropId?.variety})</strong>
                    <p>Buyer: {bid.buyerId?.fullName} | Bid: INR {bid.amount}/kg | Status: {bid.status}</p>
                    <p>{bid.buyerId?.location || 'Buyer location not set'}</p>
                    <p>Delivery Address: {bid.buyerId?.deliveryAddress || 'Not provided'}</p>
                  </div>
                  {bid.status === 'active' && bid.cropId?.status === 'open' && (
                    <button className="bid-btn" onClick={() => acceptBid(bid._id)}>Accept Bid</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {!isFarmer && activeTab === 'mybids' && (
          <section className="listing-section">
            <div className="listing-header"><h2>My Bids</h2></div>
            <div className="simple-list">
              {myBids.map((bid) => (
                <div key={bid._id} className="simple-item">
                  <div>
                    <strong>{bid.cropId?.cropName} ({bid.cropId?.variety})</strong>
                    <p>Bid: INR {bid.amount}/kg | Status: {bid.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'transactions' && (
          <section className="listing-section">
            <div className="listing-header"><h2>Transactions</h2></div>
            <div className="simple-list">
              {transactions.map((txn) => (
                <div key={txn._id} className="simple-item">
                  <div>
                    <strong>{txn.cropId?.cropName} - {txn.cropId?.quantityKg} kg</strong>
                    <p>Status: {txn.status} | Amount: INR {txn.totalAmount?.toLocaleString()} | Platform Fee: INR {txn.platformFee?.toLocaleString()} | Payout: INR {txn.payout?.toLocaleString()}</p>
                  </div>
                  {!isFarmer && txn.status === 'awaiting_payment' && (
                    <button className="bid-btn" onClick={() => startUpiPayment(txn)}>Pay Now (UPI)</button>
                  )}
                        {/* UPI Payment Modal */}
                        {upiModal.open && (
                          <div className="modal-backdrop">
                            <div className="modal-card">
                              <h3>UPI Payment</h3>
                              <p>Scan the QR code or use the UPI ID below to pay the total amount.</p>
                              <div style={{ textAlign: 'center', margin: '16px 0' }}>
                                {/* Replace with your actual UPI QR code image or generator */}
                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=your-upi-id@bank&pn=AgriMarket&am=" alt="UPI QR" style={{ width: 200, height: 200 }} />
                                <div style={{ marginTop: 8 }}><strong>UPI ID:</strong> your-upi-id@bank</div>
                                <div style={{ marginTop: 8 }}>
                                  <strong>Amount:</strong> INR {upiModal.transaction?.totalAmount?.toLocaleString()}
                                </div>
                              </div>
                              <p>After payment, click below to confirm.</p>
                              <div className="modal-actions">
                                <button className="small-btn" onClick={() => setUpiModal({ open: false, transaction: null })}>Cancel</button>
                                <button className="bid-btn modal-submit" onClick={confirmUpiPayment}>I have paid</button>
                              </div>
                            </div>
                          </div>
                        )}
                  {isFarmer && txn.status === 'payment_confirmed' && (
                    <button className="bid-btn" onClick={() => markDispatch(txn._id)}>Mark Dispatch</button>
                  )}
                  {!isFarmer && txn.status === 'dispatched' && (
                    <button className="bid-btn" onClick={() => openOtpModal(txn._id)}>Enter OTP</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'companion' && (
          <section className="companion-layout">
            <div className="companion-list">
              <div className="companion-header">
                <div>
                  <h2>Companion Planting</h2>
                  <p>Pick a crop to see what grows well beside it and what should stay away.</p>
                </div>
                <div className="companion-count">{filteredCompanionGuide.length} crops</div>
              </div>
              <input
                type="text"
                placeholder="Search companion crops..."
                value={companionSearch}
                onChange={(e) => setCompanionSearch(e.target.value)}
              />
              <div className="filter-chips">
                {companionCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`chip ${companionCategory === category ? 'active' : ''}`}
                    onClick={() => setCompanionCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="companion-grid">
                {filteredCompanionGuide.map((item) => (
                  <button
                    key={item.crop}
                    type="button"
                    className={`companion-card ${selectedCompanionCrop?.crop === item.crop ? 'selected' : ''}`}
                    onClick={() => setSelectedCompanionCrop(item)}
                  >
                    <div className="companion-card__top">
                      <strong>{item.crop}</strong>
                      <span>{item.category}</span>
                    </div>
                    <p>{item.season}</p>
                    <div className="companion-tags">
                      {item.bestWith.slice(0, 3).map((pair) => (
                        <span key={pair} className="tag good">+ {pair}</span>
                      ))}
                    </div>
                  </button>
                ))}
                {filteredCompanionGuide.length === 0 && (
                  <div className="empty-state">No companion planting matches found.</div>
                )}
              </div>
            </div>
            <div className="companion-detail">
              {selectedCompanionCrop ? (
                <>
                  <div className="detail-hero">
                    <div>
                      <p className="detail-kicker">Companion planting guide</p>
                      <h2>{selectedCompanionCrop.crop}</h2>
                      <p className="detail-season">{selectedCompanionCrop.season} · {selectedCompanionCrop.category}</p>
                    </div>
                    <div className="detail-stat">
                      <span>Best matches</span>
                      <strong>{selectedCompanionCrop.bestWith.length}</strong>
                    </div>
                  </div>
                  <div className="detail-section">
                    <h3>Best companions</h3>
                    <div className="pill-row">
                      {selectedCompanionCrop.bestWith.map((item) => (
                        <span key={item} className="pill good">{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="detail-section">
                    <h3>Avoid planting with</h3>
                    <div className="pill-row">
                      {selectedCompanionCrop.avoid.map((item) => (
                        <span key={item} className="pill avoid">{item}</span>
                      ))}
                    </div>
                  </div>
                  <div className="detail-section">
                    <h3>Why it works</h3>
                    <ul className="detail-list">
                      {selectedCompanionCrop.benefits.map((benefit) => (
                        <li key={benefit}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="detail-tip">
                    <strong>Field tip:</strong> {selectedCompanionCrop.tip}
                  </div>
                </>
              ) : (
                <>
                  <h2>Select a crop to get started</h2>
                  <p>Choose a crop from the list to see its companion planting recommendations.</p>
                </>
              )}
            </div>
          </section>
        )}

        <section className="listing-section">
          <div className="listing-header">
            <h2>Notifications {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}</h2>
            <button className="small-btn" onClick={markAllRead}>Mark all read</button>
          </div>
          <div className="simple-list">
            {notifications.slice(0, 10).map((item) => (
              <div key={item._id} className={`simple-item ${item.isRead ? 'read' : 'unread'}`}>
                <p>{item.message}</p>
                {!item.isRead && <button className="small-btn" onClick={() => markNotificationRead(item._id)}>Mark read</button>}
              </div>
            ))}
          </div>
        </section>

        {activeTab === 'analytics' && <AnalyticsPanel />}
      </main>

      {otpModal.open && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>Delivery OTP Verification</h3>
            <p>Enter the secure OTP sent after dispatch.</p>
            <input
              type="text"
              value={otpModal.otpCode}
              onChange={(e) => setOtpModal((prev) => ({ ...prev, otpCode: e.target.value }))}
              placeholder="Enter 6-digit OTP"
            />
            <div className="modal-actions">
              <button className="small-btn" onClick={() => setOtpModal({ open: false, transactionId: null, otpCode: '' })}>Cancel</button>
              <button className="bid-btn modal-submit" onClick={submitOtp}>Submit OTP</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;