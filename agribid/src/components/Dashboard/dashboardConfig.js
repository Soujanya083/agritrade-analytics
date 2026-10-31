// dashboardConfig.js - constants used by the dashboard and its sections.

// Listings are loaded a page at a time (server-side search/category filters).
export const BUYER_PAGE_SIZE = 24;
export const FARMER_PAGE_SIZE = 60;
export const LISTING_CATEGORIES = ['All Categories', 'Grains', 'Vegetables', 'Fruits', 'Leafy'];

// Receiving UPI account for the manual-UPI flow. Configure it with
// REACT_APP_UPI_ID (and REACT_APP_UPI_NAME) at build time. There is
// deliberately no default: the old code showed a fake "your-upi-id@bank".
export const UPI_ID = process.env.REACT_APP_UPI_ID || '';
export const UPI_NAME = process.env.REACT_APP_UPI_NAME || 'AgriTrade';
export const upiLink = (transaction) => {
  const amount = Number(transaction?.totalAmount || 0).toFixed(2);
  return `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${amount}&cu=INR`;
};
