import React, { useEffect, useMemo, useState } from 'react';
import './DashboardPage.css';
import AnalyticsPanel from './AnalyticsPanel';
import MarketIntelligenceDashboard from './MarketIntelligenceDashboard';

const API_BASE =
  process.env.REACT_APP_API_BASE_URL ||
  `http://${window.location.hostname || 'localhost'}:5000/api`;

const COMPANION_GUIDE = [
  {
    crop: 'Tomato',
    season: 'Warm season',
    category: 'Vegetables',
    bestWith: ['Basil', 'Marigold', 'Onion'],
    avoid: ['Potato', 'Cabbage'],
    benefits: [
      'Repels pests naturally',
      'Improves bed diversity',
      'Supports healthier fruit set',
    ],
    tip: 'Keep plants spaced and prune lower leaves for airflow.',
  },
  {
    crop: 'Onion',
    season: 'Winter',
    category: 'Vegetables',
    bestWith: ['Carrot', 'Beetroot', 'Lettuce'],
    avoid: ['Beans', 'Peas'],
    benefits: [
      'Deters carrot fly',
      'Uses limited space efficiently',
      'Pairs well in mixed beds',
    ],
    tip: 'Intercrop in rows to keep harvesting simple.',
  },
  {
    crop: 'Carrot',
    season: 'Winter',
    category: 'Vegetables',
    bestWith: ['Onion', 'Leek', 'Radish'],
    avoid: ['Dill', 'Parsnip'],
    benefits: [
      'Helpful root pairing',
      'Reduces pest pressure',
      'Improves soil coverage',
    ],
    tip: 'Use loose, stone-free soil for straight roots.',
  },
  {
    crop: 'Potato',
    season: 'Winter/Spring',
    category: 'Vegetables',
    bestWith: ['Beans', 'Cabbage', 'Corn'],
    avoid: ['Tomato', 'Cucumber'],
    benefits: [
      'Encourages mixed rooting depth',
      'Makes better use of bed area',
      'Balances nutrients',
    ],
    tip: 'Rotate beds each season to reduce disease buildup.',
  },
  {
    crop: 'Cotton',
    season: 'Summer',
    category: 'Grains',
    bestWith: ['Onion', 'Sunflower', 'Cowpea'],
    avoid: ['Potato', 'Brinjal'],
    benefits: [
      'Supports beneficial insects',
      'Provides border diversity',
      'Improves field resilience',
    ],
    tip: 'Use border crops to attract pollinators and reduce pests.',
  },
  {
    crop: 'Sugarcane',
    season: 'Year-round',
    category: 'Grains',
    bestWith: ['Coriander', 'Onion', 'Garlic'],
    avoid: ['Mustard'],
    benefits: [
      'Gives space for short-duration crops',
      'Improves land use',
      'Supports staggered harvesting',
    ],
    tip: 'Intercrop only while the cane canopy is still open.',
  },
  {
    crop: 'Maize',
    season: 'Kharif/Summer',
    category: 'Grains',
    bestWith: ['Beans', 'Pumpkin', 'Cowpea'],
    avoid: ['Rice'],
    benefits: [
      'Creates a support structure for climbers',
      'Spreads risk across crops',
      'Improves soil cover',
    ],
    tip: 'Plant climbers after maize is established.',
  },
  {
    crop: 'Beans',
    season: 'Warm season',
    category: 'Vegetables',
    bestWith: ['Maize', 'Carrot', 'Cabbage'],
    avoid: ['Onion', 'Garlic'],
    benefits: [
      'Fixes nitrogen',
      'Boosts soil fertility',
      'Fits well in mixed rows',
    ],
    tip: 'Avoid over-fertilizing with nitrogen when intercropping.',
  },
  {
    crop: 'Mango',
    season: 'Summer',
    category: 'Fruits',
    bestWith: ['Turmeric', 'Ginger', 'Pigeon Pea'],
    avoid: ['Banana close spacing', 'Potato'],
    benefits: [
      'Allows under-canopy intercrops',
      'Supports deep-root harmony',
      'Improves orchard land use',
    ],
    tip: 'Keep understory crops low and avoid shading young trees.',
  },
  {
    crop: 'Banana',
    season: 'Year-round',
    category: 'Fruits',
    bestWith: ['Coriander', 'Spinach', 'Beans'],
    avoid: ['Potato', 'Brinjal'],
    benefits: [
      'Works well in humid mixed plots',
      'Adds quick ground cover',
      'Benefits from short-duration intercrops',
    ],
    tip: 'Maintain wide spacing and steady moisture for best results.',
  },
  {
    crop: 'Citrus',
    season: 'Spring/Summer',
    category: 'Fruits',
    bestWith: ['Legumes', 'Alyssum', 'Marigold'],
    avoid: ['Wheat', 'Heavy climbers'],
    benefits: [
      'Attracts pollinators',
      'Helps suppress weeds',
      'Supports orchard biodiversity',
    ],
    tip: 'Use low-growing companions so roots and canopy do not compete.',
  },
  {
    crop: 'Grapes',
    season: 'Summer',
    category: 'Fruits',
    bestWith: ['Garlic', 'Chives', 'Clover'],
    avoid: ['Potato', 'Tomato'],
    benefits: [
      'Improves pest management',
      'Covers exposed soil',
      'Helps maintain vineyard balance',
    ],
    tip: 'Prune regularly and keep companion plants away from the vine base.',
  },
  {
    crop: 'Papaya',
    season: 'Warm season',
    category: 'Fruits',
    bestWith: ['Marigold', 'Sweet Potato', 'Beans'],
    avoid: ['Banana dense planting'],
    benefits: [
      'Provides useful mixed cropping space',
      'Encourages pollinator activity',
      'Reduces bare soil exposure',
    ],
    tip: 'Avoid waterlogging and give each plant enough sunlight.',
  },
];

const encodeSvgDataUri = (svg) =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

const LISTING_IMAGES = {
  Grains: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M0 220C70 190 120 180 180 200C250 225 300 175 360 182C410 188 445 198 480 186V320H0Z" fill="#fcd34d"/>
      <path d="M0 240C80 205 145 210 205 224C270 240 310 210 372 206C417 203 450 210 480 202V320H0Z" fill="#d97706"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Grains</text>
    </svg>
  `),

  Vegetables: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#dcfce7"/>
      <circle cx="145" cy="180" r="48" fill="#f97316"/>
      <circle cx="228" cy="170" r="56" fill="#ef4444"/>
      <circle cx="314" cy="184" r="50" fill="#84cc16"/>
      <path d="M0 244H480V320H0Z" fill="#86efac"/>
      <text x="36" y="286" fill="#166534" font-family="Arial" font-size="28" font-weight="700">Vegetables</text>
    </svg>
  `),

  Fruits: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ffe4e6"/>
      <circle cx="160" cy="176" r="56" fill="#fb7185"/>
      <circle cx="245" cy="162" r="62" fill="#f97316"/>
      <circle cx="332" cy="182" r="50" fill="#eab308"/>
      <text x="36" y="286" fill="#9f1239" font-family="Arial" font-size="28" font-weight="700">Fruits</text>
    </svg>
  `),
};

// Per-crop icons for the crops most likely to be listed, so listings
// show a recognizable icon instead of just a generic category
// placeholder. Falls back to the category placeholder for any crop
// name not covered here - the marketplace accepts free-text crop
// names, so this can never be a complete fixed list, only a set of
// the most common ones worth a dedicated icon.
const CROP_IMAGES = {
  wheat: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M240 260V90" stroke="#b45309" stroke-width="6"/>
      <path d="M240 100C220 90 205 100 200 115C220 118 235 112 240 100Z" fill="#d97706"/>
      <path d="M240 100C260 90 275 100 280 115C260 118 245 112 240 100Z" fill="#d97706"/>
      <path d="M240 130C220 120 205 130 200 145C220 148 235 142 240 130Z" fill="#d97706"/>
      <path d="M240 130C260 120 275 130 280 145C260 148 245 142 240 130Z" fill="#d97706"/>
      <path d="M240 160C220 150 205 160 200 175C220 178 235 172 240 160Z" fill="#d97706"/>
      <path d="M240 160C260 150 275 160 280 175C260 178 245 172 240 160Z" fill="#d97706"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Wheat</text>
    </svg>
  `),

  rice: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#ecfccb"/>
      <ellipse cx="180" cy="150" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="220" cy="140" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="260" cy="150" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <ellipse cx="300" cy="142" rx="18" ry="34" fill="#f8fafc" stroke="#a3a3a3" stroke-width="2"/>
      <text x="36" y="286" fill="#365314" font-family="Arial" font-size="28" font-weight="700">Rice</text>
    </svg>
  `),

  maize: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef9c3"/>
      <ellipse cx="240" cy="160" rx="60" ry="95" fill="#facc15"/>
      <path d="M200 90C210 70 270 70 280 90" stroke="#16a34a" stroke-width="10" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Maize</text>
    </svg>
  `),

  corn: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef9c3"/>
      <ellipse cx="240" cy="160" rx="60" ry="95" fill="#facc15"/>
      <path d="M200 90C210 70 270 70 280 90" stroke="#16a34a" stroke-width="10" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Corn</text>
    </svg>
  `),

  millet: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <path d="M240 260V100" stroke="#92400e" stroke-width="6"/>
      <circle cx="230" cy="110" r="7" fill="#a16207"/>
      <circle cx="250" cy="120" r="7" fill="#a16207"/>
      <circle cx="228" cy="132" r="7" fill="#a16207"/>
      <circle cx="252" cy="142" r="7" fill="#a16207"/>
      <circle cx="230" cy="154" r="7" fill="#a16207"/>
      <text x="36" y="286" fill="#7c2d12" font-family="Arial" font-size="28" font-weight="700">Millet</text>
    </svg>
  `),

  tomato: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fee2e2"/>
      <circle cx="240" cy="180" r="66" fill="#ef4444"/>
      <path d="M215 122C225 108 255 108 265 122" stroke="#16a34a" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#991b1b" font-family="Arial" font-size="28" font-weight="700">Tomato</text>
    </svg>
  `),

  onion: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fdf2f8"/>
      <path d="M240 90C280 130 290 190 240 220C190 190 200 130 240 90Z" fill="#c026d3"/>
      <path d="M240 90V70" stroke="#4d7c0f" stroke-width="6"/>
      <text x="36" y="286" fill="#701a75" font-family="Arial" font-size="28" font-weight="700">Onion</text>
    </svg>
  `),

  potato: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef3c7"/>
      <ellipse cx="240" cy="170" rx="80" ry="55" fill="#ca8a04"/>
      <circle cx="210" cy="160" r="4" fill="#78350f"/>
      <circle cx="260" cy="185" r="4" fill="#78350f"/>
      <circle cx="245" cy="150" r="4" fill="#78350f"/>
      <text x="36" y="286" fill="#78350f" font-family="Arial" font-size="28" font-weight="700">Potato</text>
    </svg>
  `),

  chili: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fef2f2"/>
      <path d="M200 120C260 130 300 170 280 210C260 245 210 235 200 195C192 165 180 140 200 120Z" fill="#dc2626"/>
      <path d="M200 120C195 105 185 98 175 100" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#7f1d1d" font-family="Arial" font-size="28" font-weight="700">Chili</text>
    </svg>
  `),

  mango: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fff7ed"/>
      <path d="M200 130C260 120 300 160 285 205C270 245 215 245 195 210C178 180 175 145 200 130Z" fill="#f97316"/>
      <path d="M245 122C250 108 262 102 272 104" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Mango</text>
    </svg>
  `),

  banana: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fefce8"/>
      <path d="M180 210C190 140 260 100 310 120C300 160 280 180 250 195C220 210 195 215 180 210Z" fill="#facc15"/>
      <path d="M180 210C175 218 178 226 188 226" stroke="#854d0e" stroke-width="6" fill="none"/>
      <text x="36" y="286" fill="#854d0e" font-family="Arial" font-size="28" font-weight="700">Banana</text>
    </svg>
  `),

  grapes: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#f5f3ff"/>
      <circle cx="220" cy="140" r="20" fill="#7c3aed"/>
      <circle cx="250" cy="150" r="20" fill="#7c3aed"/>
      <circle cx="215" cy="175" r="20" fill="#7c3aed"/>
      <circle cx="248" cy="185" r="20" fill="#7c3aed"/>
      <circle cx="235" cy="205" r="20" fill="#7c3aed"/>
      <path d="M235 118V100" stroke="#15803d" stroke-width="6"/>
      <text x="36" y="286" fill="#4c1d95" font-family="Arial" font-size="28" font-weight="700">Grapes</text>
    </svg>
  `),

  papaya: encodeSvgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 320">
      <rect width="480" height="320" rx="28" fill="#fff7ed"/>
      <ellipse cx="240" cy="170" rx="55" ry="80" fill="#fb923c"/>
      <path d="M240 90C250 78 262 76 270 80" stroke="#15803d" stroke-width="8" fill="none"/>
      <text x="36" y="286" fill="#9a3412" font-family="Arial" font-size="28" font-weight="700">Papaya</text>
    </svg>
  `),
};

const getListingImage = (item) => {
  const key = (item.cropName || '').trim().toLowerCase();
  return (
    CROP_IMAGES[key] ||
    LISTING_IMAGES[item.category] ||
    LISTING_IMAGES.Vegetables
  );
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

  const [companionSearch, setCompanionSearch] = useState('');
  const [companionCategory, setCompanionCategory] =
    useState('All Crops');

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedCompanionCrop, setSelectedCompanionCrop] =
    useState(null);

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

  const companionCategories = useMemo(
    () => [
      'All Crops',
      ...new Set(COMPANION_GUIDE.map((item) => item.category)),
    ],
    []
  );

  const filteredCompanionGuide = useMemo(() => {
    return COMPANION_GUIDE.filter((item) => {
      const matchesSearch = item.crop
        .toLowerCase()
        .includes(companionSearch.toLowerCase());

      const matchesCategory =
        companionCategory === 'All Crops' ||
        item.category === companionCategory;

      return matchesSearch && matchesCategory;
    });
  }, [companionCategory, companionSearch]);

  useEffect(() => {
    if (
      !selectedCompanionCrop &&
      filteredCompanionGuide.length > 0
    ) {
      setSelectedCompanionCrop(filteredCompanionGuide[0]);
    }

    if (
      selectedCompanionCrop &&
      !filteredCompanionGuide.some(
        (item) => item.crop === selectedCompanionCrop.crop
      )
    ) {
      setSelectedCompanionCrop(
        filteredCompanionGuide[0] || null
      );
    }
  }, [filteredCompanionGuide, selectedCompanionCrop]);

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

      const reader = new FileReader();

      reader.onload = () => {
        setUploadData((prev) => ({
          ...prev,
          imageUrl: reader.result,
        }));
      };

      reader.readAsDataURL(file);
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
            new Date().toLocaleDateString(),
          basePrice,
          category: uploadData.category,
          imageUrl:
            uploadData.imageUrl ||
            getListingImage(uploadData),
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

                      <img
                        className="listing-image"
                        src={
                          item.imageUrl ||
                          getListingImage(item)
                        }
                        alt={`${item.cropName} ${item.variety}`}
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

            {activeTab === 'companion' && (

              <section className="companion-layout">

                <div className="companion-list">

                  <div className="companion-header">

                    <div>
                      <h2>Companion Planting</h2>

                      <p>
                        Pick a crop to see what grows well
                        beside it and what should stay away.
                      </p>
                    </div>

                    <div className="companion-count">
                      {filteredCompanionGuide.length} crops
                    </div>

                  </div>

                  <input
                    type="text"
                    placeholder="Search companion crops..."
                    value={companionSearch}
                    onChange={(e) =>
                      setCompanionSearch(e.target.value)
                    }
                  />

                  <div className="filter-chips">

                    {companionCategories.map((category) => (

                      <button
                        key={category}
                        type="button"
                        className={`chip ${
                          companionCategory === category
                            ? 'active'
                            : ''
                        }`}
                        onClick={() =>
                          setCompanionCategory(category)
                        }
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
                        className={`companion-card ${
                          selectedCompanionCrop?.crop ===
                          item.crop
                            ? 'selected'
                            : ''
                        }`}
                        onClick={() =>
                          setSelectedCompanionCrop(item)
                        }
                      >

                        <div className="companion-card__top">

                          <strong>{item.crop}</strong>

                          <span>{item.category}</span>

                        </div>

                        <p>{item.season}</p>

                        <div className="companion-tags">

                          {item.bestWith
                            .slice(0, 3)
                            .map((pair) => (

                              <span
                                key={pair}
                                className="tag good"
                              >
                                + {pair}
                              </span>

                            ))}

                        </div>

                      </button>

                    ))}

                    {filteredCompanionGuide.length === 0 && (
                      <div className="empty-state">
                        No companion planting matches found.
                      </div>
                    )}

                  </div>

                </div>

                <div className="companion-detail">

                  {selectedCompanionCrop ? (

                    <>

                      <div className="detail-hero">

                        <div>

                          <p className="detail-kicker">
                            Companion planting guide
                          </p>

                          <h2>
                            {selectedCompanionCrop.crop}
                          </h2>

                          <p className="detail-season">
                            {selectedCompanionCrop.season} ·{' '}
                            {selectedCompanionCrop.category}
                          </p>

                        </div>

                        <div className="detail-stat">

                          <span>Best matches</span>

                          <strong>
                            {
                              selectedCompanionCrop.bestWith
                                .length
                            }
                          </strong>

                        </div>

                      </div>

                      <div className="detail-section">

                        <h3>Best companions</h3>

                        <div className="pill-row">

                          {selectedCompanionCrop.bestWith.map(
                            (item) => (
                              <span
                                key={item}
                                className="pill good"
                              >
                                {item}
                              </span>
                            )
                          )}

                        </div>

                      </div>

                      <div className="detail-section">

                        <h3>Avoid planting with</h3>

                        <div className="pill-row">

                          {selectedCompanionCrop.avoid.map(
                            (item) => (
                              <span
                                key={item}
                                className="pill avoid"
                              >
                                {item}
                              </span>
                            )
                          )}

                        </div>

                      </div>

                      <div className="detail-section">

                        <h3>Why it works</h3>

                        <ul className="detail-list">

                          {selectedCompanionCrop.benefits.map(
                            (benefit) => (
                              <li key={benefit}>
                                {benefit}
                              </li>
                            )
                          )}

                        </ul>

                      </div>

                      <div className="detail-tip">

                        <strong>Field tip:</strong>{' '}
                        {selectedCompanionCrop.tip}

                      </div>

                    </>

                  ) : (

                    <>

                      <h2>Select a crop to get started</h2>

                      <p>
                        Choose a crop from the list to see its
                        companion planting recommendations.
                      </p>

                    </>

                  )}

                </div>

              </section>

            )}

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

              <img
                src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=your-upi-id@bank&pn=AgriMarket"
                alt="UPI QR"
                style={{
                  width: 200,
                  height: 200,
                }}
              />

              <div style={{ marginTop: 8 }}>
                <strong>UPI ID:</strong>{' '}
                your-upi-id@bank
              </div>

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