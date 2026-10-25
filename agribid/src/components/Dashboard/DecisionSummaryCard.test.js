import React from 'react';
import { render, screen } from '@testing-library/react';
import DecisionSummaryCard from './DecisionSummaryCard';

const summary = {
  cropName: 'Onion', predictedPrice: 24, predictedPriceModel: 'Prophet', demandLevel: 'High', opportunityScore: 2,
  bestMarket: 'Lasalgaon', bestMarketDistrict: 'Nashik', bestMarketState: 'Maharashtra', bestMarketModalPricePerQuintal: 2400,
  expectedRevenue: 12000, expectedCost: 550, expectedNetProfit: 11450, expectedNetProfitPerQuintal: 2290,
  platformForecast: { expectedRevenue: 12000, platformFeePercent: 5, expectedPayout: 11400 },
  actionText: 'SELL AT LASALGAON', timing: { recommendation: 'Wait', reason: 'Forecast expects a rise.', horizonDays: 7 },
  confidence: { level: 'Medium', reasons: ['40 days of price history.'] },
  limitations: ['Transport and storage costs are disclosed flat-rate assumptions.'], warnings: [], mandiDataSource: 'cached_snapshot',
};

test('shows every headline number from the summary', () => {
  render(<DecisionSummaryCard summary={summary} crop="Onion" quantityKg={500} />);
  expect(screen.getByText(/SELL AT LASALGAON/)).toBeInTheDocument();
  expect(screen.getByText('₹24/kg')).toBeInTheDocument();
  expect(screen.getByText('High')).toBeInTheDocument();
  expect(screen.getByText('Lasalgaon')).toBeInTheDocument();
  expect(screen.getByText('₹12,000')).toBeInTheDocument();
  expect(screen.getByText('₹550')).toBeInTheDocument();
  expect(screen.getByText('₹11,450')).toBeInTheDocument();
  expect(screen.getByText(/Medium confidence/)).toBeInTheDocument();
});

test('always exposes confidence reasons, limitations and the data-source caveat', () => {
  render(<DecisionSummaryCard summary={summary} crop="Onion" quantityKg={500} />);
  expect(screen.getByText('40 days of price history.')).toBeInTheDocument();
  expect(screen.getByText(/flat-rate assumptions/)).toBeInTheDocument();
  expect(screen.getByText(/saved snapshot/)).toBeInTheDocument();
});

test('a missing value is shown as "-", never invented', () => {
  render(<DecisionSummaryCard summary={{ ...summary, predictedPrice: null, predictedPriceModel: null }} crop="Onion" quantityKg={500} />);
  expect(screen.getByText('No price history yet')).toBeInTheDocument();
});

test('without a quantity it shows per-quintal profit instead of totals', () => {
  const { expectedRevenue, expectedCost, expectedNetProfit, platformForecast, ...rest } = summary;
  render(<DecisionSummaryCard summary={rest} crop="Onion" quantityKg={null} />);
  expect(screen.queryByText('Expected revenue')).not.toBeInTheDocument();
  expect(screen.getByText('Net profit per quintal')).toBeInTheDocument();
});

test('shows a friendly message on error and while loading', () => {
  const { rerender } = render(<DecisionSummaryCard summary={null} loading crop="Onion" />);
  expect(screen.getByText(/Working out/)).toBeInTheDocument();
  rerender(<DecisionSummaryCard summary={null} error="No data found" crop="Onion" />);
  expect(screen.getByText(/No data found/)).toBeInTheDocument();
});

test('shows the 90% range and a "Real mandi data" marker when the forecast comes from AGMARKNET', () => {
  render(<DecisionSummaryCard crop="Onion" quantityKg={500}
    summary={{ ...summary, predictedPriceSource: 'agmarknet_real', predictedPriceRange: { lower: 21, upper: 28, level: 0.9 } }} />);
  expect(screen.getByText(/90% range ₹21–₹28/)).toBeInTheDocument();
  expect(screen.getByText(/Real mandi data/)).toBeInTheDocument();
});

test('warns about synthetic marketplace data when the forecast is not from real mandi data', () => {
  render(<DecisionSummaryCard crop="Onion" quantityKg={500}
    summary={{ ...summary, dataProvenance: { syntheticPercent: 92, message: 'Most marketplace records are synthetic demo data.' } }} />);
  expect(screen.getByText(/Most marketplace records are synthetic demo data/)).toBeInTheDocument();
});

test("shows today's live mandi price, and says the forecast is withheld when its history is too old", () => {
  render(<DecisionSummaryCard crop="Onion" quantityKg={500}
    summary={{ ...summary, predictedPrice: null, predictedPriceModel: null,
      forecastUnavailableReason: 'The real mandi price history ends on 2025-06-11 (500 days ago).',
      todayMandiPrice: { pricePerKg: 41.5, asOf: '2026-10-24', source: 'live', marketsCompared: 30 } }} />);
  expect(screen.getByText('₹41.5/kg')).toBeInTheDocument();
  expect(screen.getByText(/as of 2026-10-24/)).toBeInTheDocument();
  expect(screen.getByText(/Forecast withheld/)).toBeInTheDocument();
  expect(screen.getByText(/ends on 2025-06-11/)).toBeInTheDocument();
});
