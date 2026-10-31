// useDashboardData.js - all the state, data loading and actions behind the dashboard.
// DashboardPage.js (the shell) and sections/* (the screens) only render what this returns.
import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareImageForUpload, todayIso } from '../../utils/imageTools';
import { API_BASE, authFetch, clearSession } from '../../api/session';
import { BUYER_PAGE_SIZE, FARMER_PAGE_SIZE, LISTING_CATEGORIES } from './dashboardConfig';

const useDashboardData = ({ user, onLogout }) => {
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

  const [listingPage, setListingPage] = useState(1);
  const [listingHasMore, setListingHasMore] = useState(false);
  const [listingTotal, setListingTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const filtersMounted = useRef(false);

  const userId = user?.id || user?._id || '';
  const isFarmer = user?.role === 'Farmer';

  const fetchJson = async (url, options = {}) => {
    // authFetch attaches the in-memory access token and, on a 401, renews it through the
    // httpOnly refresh cookie once before giving up.
    const response = await authFetch(url, options);

    if (response.status === 401) {
      // Token missing/expired AND the refresh cookie could not renew it - force back to
      // login rather than showing a confusing generic error.
      clearSession();
      if (onLogout) onLogout();
      throw new Error('Session expired. Please log in again.');
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Request failed');
    }

    return data;
  };

  const listingQuery = (page) => {
    const params = new URLSearchParams({
      status: 'open',
      page: String(page),
      limit: String(isFarmer ? FARMER_PAGE_SIZE : BUYER_PAGE_SIZE),
    });
    if (isFarmer) {
      params.set('farmerId', userId);
    } else {
      if (searchText.trim()) params.set('q', searchText.trim());
      if (selectedCategory !== 'All Categories') params.set('category', selectedCategory);
    }
    return params.toString();
  };

  // One page of listings. `append` adds to what is already shown ("Load more").
  const loadListings = async (page = 1, { append = false } = {}) => {
    const data = await fetchJson(`${API_BASE}/crops?${listingQuery(page)}`);
    const rows = data.crops || [];
    setCrops((prev) => (append
      ? [...prev, ...rows.filter((row) => !prev.some((old) => old._id === row._id))]
      : rows));
    setListingPage(page);
    setListingHasMore(Boolean(data.hasMore));
    setListingTotal(data.total ?? rows.length);
  };

  const loadMoreListings = async () => {
    if (isLoadingMore || !listingHasMore) return;
    setIsLoadingMore(true);
    try {
      await loadListings(listingPage + 1, { append: true });
    } catch (error) {
      setLoadError(error.message || 'Could not load more listings.');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const loadData = async () => {
    if (!userId) return;

    setIsLoading(true);
    setLoadError(null);

    try {
      const [, notifData] = await Promise.all([
        loadListings(1),
        fetchJson(`${API_BASE}/notifications/${userId}`),
      ]);

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

  // Buyers: ask the server again when the search text or category changes (debounced).
  // The first run is skipped because loadData() above already fetched page 1.
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return undefined;
    }
    if (!userId || isFarmer) return undefined;
    const timer = setTimeout(() => {
      loadListings(1).catch((error) => setLoadError(error.message || 'Could not load listings.'));
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, selectedCategory]);

  const categoryOptions = LISTING_CATEGORIES;

  // The server already applies the search / category / open-status filters.
  const visibleListings = useMemo(
    () => crops.filter((item) => item.status === 'open'),
    [crops]
  );

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
      value: listingTotal || myListings.length || 0,
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
      value: listingTotal,
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

  const deleteListing = async (item) => {
    const ok = window.confirm(`Delete your ${item.cropName} listing? Any bids on it will be removed and the buyers will be told.`);
    if (!ok) return;
    try {
      await fetchJson(`${API_BASE}/crops/${item._id}`, { method: 'DELETE' });
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


  return {
    activeTab,
    setActiveTab,
    crops,
    setCrops,
    myBids,
    setMyBids,
    farmerBids,
    setFarmerBids,
    transactions,
    setTransactions,
    notifications,
    setNotifications,
    unreadCount,
    setUnreadCount,
    searchText,
    setSearchText,
    selectedCategory,
    setSelectedCategory,
    showUploadForm,
    setShowUploadForm,
    otpModal,
    setOtpModal,
    upiModal,
    setUpiModal,
    uploadData,
    setUploadData,
    isLoading,
    setIsLoading,
    loadError,
    setLoadError,
    listingPage,
    setListingPage,
    listingHasMore,
    setListingHasMore,
    listingTotal,
    setListingTotal,
    isLoadingMore,
    setIsLoadingMore,
    filtersMounted,
    userId,
    isFarmer,
    fetchJson,
    listingQuery,
    loadListings,
    loadMoreListings,
    loadData,
    categoryOptions,
    visibleListings,
    myListings,
    wonBids,
    totalRevenue,
    farmerStats,
    buyerStats,
    handleUploadChange,
    addListing,
    placeBid,
    acceptBid,
    deleteListing,
    startUpiPayment,
    confirmUpiPayment,
    startRazorpayPayment,
    markDispatch,
    openOtpModal,
    submitOtp,
    markNotificationRead,
    markAllRead,
  };
};

export default useDashboardData;
