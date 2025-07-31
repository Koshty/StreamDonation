const axios = require('axios');
require('dotenv').config();

const BASE_URL = 'https://accept.paymob.com/api';

async function getAuthToken() {
  const res = await axios.post(`${BASE_URL}/auth/tokens`, {
    api_key: process.env.PAYMOB_API_KEY,
  });
  return res.data.token;
}

async function createOrder(token, amountCents) {
  const res = await axios.post(`${BASE_URL}/ecommerce/orders`, {
    auth_token: token,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: 'EGP',
    items: [],
  });
  return res.data.id;
}

async function generatePaymentKey(token, orderId, amountCents, donorName) {
  const res = await axios.post(`${BASE_URL}/acceptance/payment_keys`, {
    auth_token: token,
    amount_cents: amountCents,
    expiration: 3600,
    order_id: orderId,
    currency: 'EGP',
    integration_id: process.env.PAYMOB_INTEGRATION_ID,
    billing_data: {
      first_name: donorName || 'Anonymous',
      last_name: '.',
      email: 'donor@example.com',
      phone_number: '+201000000000',
      apartment: 'NA',
      floor: 'NA',
      street: 'NA',
      building: 'NA',
      city: 'Cairo',
      country: 'EG',
      state: 'NA',
    }
  });
  return res.data.token;
}

module.exports = {
  getAuthToken,
  createOrder,
  generatePaymentKey
};
