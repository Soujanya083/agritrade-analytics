"""
test_decision_backtesting.py - tests the historical case construction
and summary aggregation in decision_backtesting.py, using mocked crop/
bid/transaction data and a mocked price series (so no database or
real forecasting is needed).

Run with: pytest tests/test_decision_backtesting.py -v
"""
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import patch

from app.services import decision_backtesting as db


def _build_mocked_scenario():
    listing_date = datetime(2026, 1, 1)

    crops = pd.DataFrame([{
        "_id": "crop1",
        "cropName": "Wheat",
        "createdAt": listing_date,
        "quantityKg": 100,
        "basePrice": 20,
        "status": "completed",
    }])

    bids = pd.DataFrame([
        {"cropId": "crop1", "amount": 22, "createdAt": listing_date + timedelta(hours=1)},
        {"cropId": "crop1", "amount": 25, "createdAt": listing_date + timedelta(hours=5)},
    ])

    transactions = pd.DataFrame([{
        "cropId": "crop1",
        "totalAmount": 2500,  # 25/kg * 100kg
    }])

    # Flat market price series so the linear-trend forecast is
    # unambiguous (no growth expected -> should recommend Sell Now).
    price_series = pd.DataFrame({
        "ds": [listing_date - timedelta(days=d) for d in range(10, 0, -1)]
              + [listing_date + timedelta(days=d) for d in range(0, 10)],
        "y": [22.0] * 20,
    })

    return crops, bids, transactions, price_series


def test_backtest_produces_one_case_for_one_completed_sale():
    crops, bids, transactions, price_series = _build_mocked_scenario()

    with patch.object(db, "load_crops", return_value=crops), \
         patch.object(db, "load_bids", return_value=bids), \
         patch.object(db, "load_transactions", return_value=transactions), \
         patch.object(db, "_prepare_series", return_value=price_series):
        result = db.backtest_decisions(horizon_days=5)

    assert "summary" in result
    assert result["summary"]["casesEvaluated"] == 1
    case = result["cases"][0]
    assert case["cropName"] == "Wheat"
    assert case["sellImmediatelyOutcome"] == 22.0  # first bid
    assert case["actualHistoricalOutcome"] == 25.0  # 2500 / 100


def test_backtest_reports_error_when_no_completed_sales():
    crops = pd.DataFrame([{
        "_id": "crop1", "cropName": "Wheat", "createdAt": datetime(2026, 1, 1),
        "quantityKg": 100, "basePrice": 20, "status": "open",
    }])
    transactions = pd.DataFrame([{"cropId": "crop1", "totalAmount": 2500}])

    with patch.object(db, "load_crops", return_value=crops), \
         patch.object(db, "load_bids", return_value=pd.DataFrame()), \
         patch.object(db, "load_transactions", return_value=transactions):
        result = db.backtest_decisions()

    assert "error" in result


def test_backtest_skips_cases_with_no_matching_transaction():
    crops = pd.DataFrame([{
        "_id": "crop1", "cropName": "Wheat", "createdAt": datetime(2026, 1, 1),
        "quantityKg": 100, "basePrice": 20, "status": "completed",
    }])
    # Transaction references a different crop entirely.
    transactions = pd.DataFrame([{"cropId": "someOtherCrop", "totalAmount": 2500}])

    with patch.object(db, "load_crops", return_value=crops), \
         patch.object(db, "load_bids", return_value=pd.DataFrame(columns=["cropId", "amount", "createdAt"])), \
         patch.object(db, "load_transactions", return_value=transactions):
        result = db.backtest_decisions()

    assert "error" in result
    assert result["skippedInsufficientData"] == 1