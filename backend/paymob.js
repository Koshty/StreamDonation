const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://accept.paymob.com/api';

// === Classic API helpers (existing flow) ===
async function getAuthToken() {
  const res = await axios.post(`${BASE_URL}/auth/tokens`, {
    api_key: process.env.PAYMOB_API_KEY,
  });
  return res.data.token;
}

// ✅ Accepts metadata and stores in shipping_data.extra_description
async function createOrder(token, amountCents, metadata = {}) {
  const res = await axios.post(`${BASE_URL}/ecommerce/orders`, {
    auth_token: token,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: 'EGP',
    items: [],
    shipping_data: {
      apartment: '1',
      email: 'placeholder@example.com',
      floor: '1',
      first_name: 'Anonymous',
      street: 'Placeholder Street',
      building: '1',
      phone_number: '01000000000',
      postal_code: '12345',
      city: 'Cairo',
      country: 'EG',
      last_name: 'Donator',
      state: 'NA',
      extra_description: JSON.stringify(metadata)  // ✅ Paymob returns this in webhook
    }
  });
  return res.data.id;
}

async function generatePaymentKey(token, orderId, amountCents, donorName, billingData) {
  const res = await axios.post(`${BASE_URL}/acceptance/payment_keys`, {
    auth_token: token,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: orderId,
    currency: 'EGP',
    integration_id: process.env.PAYMOB_INTEGRATION_ID,
    billing_data: {
      first_name: donorName || 'Anonymous',
      last_name: billingData?.last_name || '.',
      email: billingData?.email || 'donor@example.com',
      phone_number: billingData?.phone_number || '+201000000000',
      apartment: billingData?.apartment || 'NA',
      floor: billingData?.floor || 'NA',
      street: billingData?.street || 'NA',
      building: billingData?.building || 'NA',
      city: billingData?.city || 'Cairo',
      country: billingData?.country || 'EG',
      state: billingData?.state || 'NA',
      // ✅ NOTE: Paymob does NOT return this extra field in the webhook
      extra: billingData?.extra || {}
    }
  });

  return res.data.token;
}

// === Intention API helper (Unified Checkout) ===
// paymentMethods: array of integration IDs (e.g., [CARD_ID, WALLET_ID])
async function createIntention({
  amount_cents,
  currency = 'EGP',
  payment_methods,
  billing_data = {},
  items = [{ name: 'Donation', amount: amount_cents, quantity: 1 }],
  customer = {},
  extras = {}
}) {
  // Intention API lives under /v1, but we can still use BASE_URL for consistency
  const url = `${BASE_URL.replace('/api', '')}/v1/intention/`; 
  const res = await axios.post(url, {
    amount: amount_cents,
    currency,
    payment_methods,
    items,
    billing_data,
    customer,
    extras
  }, {
    headers: { Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}` }
  });

  return res.data; // { id, status, client_secret, payment_methods, ... }
}

module.exports = {
  getAuthToken,
  createOrder,
  generatePaymentKey,
  createIntention
};
