# StreamDonation

A donation/message overlay for streamers, with an OBS browser-source overlay, a public donation form, and a control panel. Donations can be free-form messages (with optional TTS read-aloud) or paid via InstaPay (manual bank transfer + SMS confirmation).

## Requirements

- Node.js
- A MongoDB connection string (e.g. a free MongoDB Atlas cluster)

## Setup

1. Install dependencies:

   ```bash
   cd backend
   npm install
   ```

2. Create `backend/.env` with:

   ```
   PORT=5000
   GIPHY_API_KEY=<your Giphy API key>
   MONGO_URI=<your MongoDB connection string>
   JWT_SECRET=<any random string>
   INSTAPAY_SMS_SECRET=<any random string, used to authenticate the SMS-forwarder webhook>
   INSTAPAY_RESERVATION_WINDOW_MINUTES=25
   TTS_ARABIC_VOICE=ar-EG-SalmaNeural
   TTS_ENGLISH_VOICE=en-US-AriaNeural
   ```

## Running it

Everything (backend, control panel, overlay, donation form) is served by a single Node process — no separate frontend build/server.

```bash
cd backend
node server.js
```

Once it logs `🚀 Server running on port 5000` and `✅ Connected to MongoDB`, the app is live at:

| URL | Purpose |
|---|---|
| `http://localhost:5000/register` | Create a streamer account (first time only) |
| `http://localhost:5000/login` | Log in |
| `http://localhost:5000/control` | Control panel — settings, pause, donation history, InstaPay ID, pending InstaPay donations |
| `http://localhost:5000/donate?s=<your-username>` | Public donation form — the link to give viewers |
| `http://localhost:5000/overlay?id=<overlayToken>` | OBS browser-source link — copy it from the control panel, don't type it by hand |

To stream this to viewers (rather than just testing on `localhost`), tunnel port 5000 with something like `ngrok http 5000` and use the tunnel URL in place of `localhost:5000` for the donation link.

## InstaPay donations

There's no hosted payment gateway — a donor sends an InstaPay transfer manually from their own banking app for a specific reduced amount the form gives them (e.g. 49.97 instead of 50), which the app uses to auto-match the transfer once your phone receives the confirmation SMS. That requires an SMS-forwarding app on the phone that receives the payment notifications, configured to POST each SMS's text to:

```
POST /api/instapay/sms
Authorization: Bearer <INSTAPAY_SMS_SECRET>
Content-Type: application/json

{ "text": "<the SMS text>" }
```

Until that's set up, pending InstaPay donations can be confirmed manually from the control panel's "Pending InstaPay Donations" section.

## TTS

Donation messages can be read aloud via free Microsoft Edge neural voices (Arabic and English auto-detected per message) — no API key, no local model server required, just an internet connection. Toggle it per streamer from the control panel ("Enable TTS").
