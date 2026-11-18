import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeliveryConfirm from './DeliveryConfirm';

const shipment = (overrides = {}) => ({
  shipmentId: 'SHP-20261030-ABCDEFGH',
  quantityDispatchedKg: 100,
  permissions: { canConfirmDelivery: true },
  delivery: { codeActive: true, expiresAt: '2026-10-30T12:00:00Z' },
  ...overrides,
});

const fill = (code, qty) => {
  fireEvent.change(screen.getByLabelText('Delivery code'), { target: { value: code } });
  fireEvent.change(screen.getByLabelText(/Quantity received/), { target: { value: qty } });
};

test('nothing is shown to people who cannot confirm', () => {
  const { container } = render(<DeliveryConfirm shipment={shipment({ permissions: { canConfirmDelivery: false } })} onConfirmed={() => {}} api={{}} />);
  expect(container).toBeEmptyDOMElement();
});

test('in development mode the code is shown with a clear warning', async () => {
  const api = { requestDeliveryCode: jest.fn().mockResolvedValue({ message: 'Development mode', devCode: '482913' }) };
  render(<DeliveryConfirm shipment={shipment()} onConfirmed={() => {}} api={api} />);
  fireEvent.click(screen.getByRole('button', { name: 'Send me a delivery code' }));
  expect(await screen.findByText(/DEVELOPMENT MODE/)).toBeInTheDocument();
  expect(screen.getByText('482913')).toBeInTheDocument();
});

test('sends the code, the quantity and the condition, then reports success', async () => {
  const done = { message: 'Delivery confirmed. Thank you.', shipment: { status: 'delivered' } };
  const api = { confirmDelivery: jest.fn().mockResolvedValue(done) };
  const onConfirmed = jest.fn();
  render(<DeliveryConfirm shipment={shipment()} onConfirmed={onConfirmed} api={api} />);
  fill('123456', '98');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delivery' }));
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(done));
  expect(api.confirmDelivery).toHaveBeenCalledWith('SHP-20261030-ABCDEFGH', expect.objectContaining({ otp: '123456', receivedQuantityKg: 98, condition: 'ok' }));
});

test('a wrong code shows how many attempts are left and clears the field', async () => {
  const error = Object.assign(new Error('That code is not correct.'), { attemptsRemaining: 3 });
  const api = { confirmDelivery: jest.fn().mockRejectedValue(error) };
  render(<DeliveryConfirm shipment={shipment()} onConfirmed={() => {}} api={api} />);
  fill('000000', '100');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delivery' }));
  expect(await screen.findByText('That code is not correct. 3 attempt(s) left.')).toBeInTheDocument();
  expect(screen.getByLabelText('Delivery code')).toHaveValue('');
});

test('the quantity is required and a code must be six digits (nothing is sent)', () => {
  const api = { confirmDelivery: jest.fn() };
  render(<DeliveryConfirm shipment={shipment()} onConfirmed={() => {}} api={api} />);
  fill('12', '');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delivery' }));
  expect(screen.getByRole('alert')).toHaveTextContent('6-digit');
  expect(api.confirmDelivery).not.toHaveBeenCalled();
});

test('damage needs a description before anything is sent', () => {
  const api = { confirmDelivery: jest.fn() };
  render(<DeliveryConfirm shipment={shipment()} onConfirmed={() => {}} api={api} />);
  fill('123456', '90');
  fireEvent.change(screen.getByLabelText('Condition of the goods'), { target: { value: 'damaged' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delivery' }));
  expect(screen.getByRole('alert')).toHaveTextContent('describe the damage');
  expect(api.confirmDelivery).not.toHaveBeenCalled();
});
