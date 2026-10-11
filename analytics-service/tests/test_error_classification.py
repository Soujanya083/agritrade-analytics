"""
HTTP status mapping for the services' {"error": ...} results.

Every message the services can currently produce is listed here on purpose:
if someone rewords one, this test fails instead of a status code silently
changing.
"""
import pytest

from app.errors import classify_error, is_error_result

CASES = [
    # (message exactly as a service produces it, expected HTTP status)
    ("No valid price history found for crop 'Wheat'.", 404),
    ("No price history found for crop 'Wheat'", 404),
    ("No demand history found for crop 'Wheat'", 404),
    ("No transaction history found for crop 'Wheat'", 404),
    ("No mandi price records found for commodity='Banana'", 404),
    ("Mandi records found, but no usable price field to compare.", 404),
    ("Mandi records found for 'wheat', but none had a usable price field.", 404),
    ("days_ahead must be at least 1.", 422),
    ("days_ahead cannot exceed 90 days.", 422),
    ("Not enough historical data to forecast 'Wheat'. At least 2 data points are required.", 422),
    ("Not enough historical data for backtesting 'Wheat'. Need more than 9 points", 422),
    ("Not enough bidding data for anomaly detection.", 422),
    ("Not enough distinct buyers with completed transactions to form 3 clusters.", 422),
    ("Not enough completed transaction history to backtest decisions.", 422),
    ("Not enough recent listings to hold out a test set.", 422),
    ("No bidding data available for anomaly detection.", 422),
    ("No transaction data available to segment buyers.", 422),
    ("No completed sales found to backtest against.", 422),
    ("Mandi API credentials not configured. Set DATAGOVIN_API_KEY and DATAGOVIN_RESOURCE_ID", 503),
    ("Clustering failed: boom", 500),
    ("Could not find a bid amount column.", 500),
    ("cropName column not found.", 500),
    ("Transaction records are missing the expected cropId field.", 500),
]


@pytest.mark.parametrize("message,expected", CASES)
def test_message_maps_to_expected_status(message, expected):
    assert classify_error(message) == expected


def test_unknown_message_defaults_to_422():
    assert classify_error("something unforeseen") == 422


def test_is_error_result():
    assert is_error_result({"error": "x"})
    assert not is_error_result({"error": ""})
    assert not is_error_result({"data": 1})
    assert not is_error_result([{"error": "x"}])
    assert not is_error_result(None)
