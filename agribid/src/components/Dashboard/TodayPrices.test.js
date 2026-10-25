import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodayPricesView } from './TodayPrices';

const data = {
  commodity: 'Onion', source: 'live', asOf: '2026-10-23', ageDays: 0, isCurrent: true,
  summary: { marketsReported: 3, medianPerKg: 20, lowPerKg: 18, highPerKg: 22 }, unusualMarkets: 1,
  rows: [
    { market: 'Hubli', district: 'Dharwad', state: 'Karnataka', variety: 'Local', modalPricePerKg: 22, minPricePerKg: 21, maxPricePerKg: 23, unusual: false },
    { market: 'Retail Sandhai', district: 'X', state: 'Tamil Nadu', variety: 'Big', modalPricePerKg: 90, minPricePerKg: 80, maxPricePerKg: 95, unusual: true },
  ],
  note: 'Wholesale (mandi) modal prices.',
};

test('shows the date, source, summary and every market row', () => {
  render(<TodayPricesView data={data} />);
  expect(screen.getByText(/Prices reported 2026-10-23/)).toBeInTheDocument();
  expect(screen.getByText(/AGMARKNET \(data.gov.in\), live/)).toBeInTheDocument();
  expect(screen.getByText('₹20/kg')).toBeInTheDocument();
  expect(screen.getByText(/Hubli/)).toBeInTheDocument();
});

test('marks unusual markets instead of hiding them', () => {
  render(<TodayPricesView data={data} />);
  expect(screen.getAllByText(/unusual/).length).toBeGreaterThan(1);   // the row marker and the note
  expect(screen.getByText(/left out of the summary/)).toBeInTheDocument();
});

test('old data is never presented as today', () => {
  render(<TodayPricesView data={{ ...data, isCurrent: false, ageDays: 61, asOf: '2026-08-23', source: 'cached_snapshot' }} />);
  expect(screen.getByText(/Not today's prices/)).toBeInTheDocument();
  expect(screen.getByText(/61 days old/)).toBeInTheDocument();
  expect(screen.getByText(/saved snapshot/)).toBeInTheDocument();
});

test('says so when it shows all-India prices because the farmer\'s state has no records today', () => {
  render(<TodayPricesView data={{ ...data, stateFallback: true, requestedState: 'Karnataka' }} />);
  expect(screen.getByText(/No records for Karnataka today, so this shows all-India prices/)).toBeInTheDocument();
});

test('offers the varieties and reports the one picked, instead of mixing different products', () => {
  const varied = { ...data, variety: 'Onion Big', varietyNote: 'Showing the most common variety (Onion Big).',
    varieties: [{ variety: 'onion big', label: 'Onion Big', markets: 6, medianPerKg: 41 }, { variety: 'onion green', label: 'Onion Green', markets: 2, medianPerKg: 98 }] };
  const picked = jest.fn();
  render(<TodayPricesView data={varied} onPickVariety={picked} />);
  expect(screen.getByText(/Showing the most common variety/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Onion Green · 2/));
  expect(picked).toHaveBeenCalledWith('Onion Green');
  fireEvent.click(screen.getByText('All'));
  expect(picked).toHaveBeenCalledWith(null);
});

test("labels farmers' direct-sale markets", () => {
  const retail = { ...data, rows: [{ ...data.rows[0], market: 'Katpadi(Uzhavar Sandhai )', retailStyle: true, unusual: false }] };
  render(<TodayPricesView data={retail} />);
  expect(screen.getByText(/farmers' direct-sale market/)).toBeInTheDocument();
});

test('says so when the farmer\'s district has no records today', () => {
  render(<TodayPricesView data={{ ...data, districtFallback: true, requestedDistrict: 'Udupi' }} />);
  expect(screen.getByText(/No records for Udupi district today/)).toBeInTheDocument();
});
