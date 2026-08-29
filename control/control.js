function getUsernameFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username;
  } catch (e) {
    return null;
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[m]);
}

const ICON_PATHS = {
  check: '<polyline points="20 6 9 17 4 12"></polyline>',
  x: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
  clock: '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>',
  trash: '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>',
  ban: '<circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>'
};

function icon(name, extraClass = '') {
  return `<svg class="icon${extraClass ? ' ' + extraClass : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const streamer = getUsernameFromToken(token);
if (!streamer) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

const socket = io({ query: { s: streamer } });

document.getElementById('streamer-display').textContent = `Streamer: ${streamer}`;

const toggleBtn = document.getElementById('togglePause');
const imageInput = document.getElementById('imageUrl');
const saveBtn = document.getElementById('saveImage');
const status = document.getElementById('status');
const allowGifsCheckbox = document.getElementById('allowGifsToggle');
const allowTTSCheckbox = document.getElementById('allowTTSToggle');
const imagePreview = document.getElementById('imagePreview');
const obsLinkInput = document.getElementById('obsLink');
const donateLinkInput = document.getElementById('donateLink');
const copyStatus = document.getElementById('copyStatus');
const filterSelect = document.getElementById('donationFilter');
const donationModeSelect = document.getElementById('donationModeSelect');
const instapayIdInput = document.getElementById('instapayId');
const pendingContainer = document.getElementById('instapay-pending');
const requireVerifiedDonorCheckbox = document.getElementById('requireVerifiedDonorToggle');
const authProviderSelect = document.getElementById('authProviderSelect');
const bannedContainer = document.getElementById('banned-donors');
const banByUsernameSection = document.getElementById('ban-by-username-section');
const banUsernameInput = document.getElementById('banUsernameInput');
const banUsernameBtn = document.getElementById('banUsernameBtn');
const instapaySmsUrlInput = document.getElementById('instapaySmsUrl');
const instapaySmsSecretField = document.getElementById('instapaySmsSecretField');
const regenerateSmsSecretBtn = document.getElementById('regenerateSmsSecretBtn');
let currentAuthProvider = 'google';

let isPaused = false;

fetch(`/api/streamer/${streamer}/config`, {
  headers: { 'Authorization': 'Bearer ' + token }
})
  .then(res => {
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  })
  .then(data => {
    isPaused = data.paused || false;
    imageInput.value = data.defaultImageUrl || '';
    imagePreview.src = data.defaultImageUrl || '';
    allowGifsCheckbox.checked = !!data.allowGifs;
    allowTTSCheckbox.checked = !!data.allowTTS;
    donationModeSelect.value = data.donationMode || 'free';
    instapayIdInput.value = data.instapayId || '';
    requireVerifiedDonorCheckbox.checked = !!data.requireVerifiedDonor;
    currentAuthProvider = data.authProvider === 'twitch' ? 'twitch' : 'google';
    authProviderSelect.value = currentAuthProvider;
    if (banByUsernameSection) banByUsernameSection.style.display = currentAuthProvider === 'twitch' ? 'block' : 'none';
    instapaySmsUrlInput.value = `${window.location.origin}/api/instapay/sms/${streamer}`;
    instapaySmsSecretField.value = data.instapaySmsSecret || '';
    instapaySmsSecretField.placeholder = data.instapaySmsSecret ? '' : 'Not generated yet';
    toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
  })
  .catch(() => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  });

fetch(`/api/streamer/${streamer}/token`, {
  headers: { 'Authorization': 'Bearer ' + token }
})
  .then(res => res.json())
  .then(data => {
    if (data.success && data.overlayToken) {
      const baseUrl = window.location.origin;
      obsLinkInput.value = `${baseUrl}/overlay?id=${data.overlayToken}`;
      donateLinkInput.value = `${baseUrl}/donate?s=${streamer}`;
    }
  });

function copyToClipboard(elementId, label) {
  const input = document.getElementById(elementId);
  if (!input) return;
  const defaultLabel = elementId === 'obsLink' ? 'OBS link' : elementId === 'donateLink' ? 'donation link' : 'text';
  navigator.clipboard.writeText(input.value)
    .then(() => {
      copyStatus.innerHTML = `${icon('check', 'status-icon success')}Copied ${label || defaultLabel}!`;
      setTimeout(() => copyStatus.textContent = '', 2000);
    })
    .catch(() => copyStatus.innerHTML = `${icon('x', 'status-icon error')}Failed to copy.`);
}

document.getElementById('copyObsBtn').addEventListener('click', () => copyToClipboard('obsLink'));
document.getElementById('copyDonateBtn').addEventListener('click', () => copyToClipboard('donateLink'));
document.getElementById('copySmsUrlBtn').addEventListener('click', () => copyToClipboard('instapaySmsUrl', 'webhook URL'));
document.getElementById('copySmsSecretBtn').addEventListener('click', () => copyToClipboard('instapaySmsSecretField', 'secret'));

regenerateSmsSecretBtn.addEventListener('click', async () => {
  if (instapaySmsSecretField.value && !confirm('Generate a new secret? Your SMS-forwarder app will need updating with it, or InstaPay confirmations will stop working.')) return;
  const res = await fetch(`/api/streamer/${streamer}/instapay-sms-secret/regenerate`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  if (data.success) {
    instapaySmsSecretField.value = data.instapaySmsSecret;
    copyStatus.innerHTML = `${icon('check', 'status-icon success')}New secret generated — update your SMS-forwarder app with it.`;
    setTimeout(() => copyStatus.textContent = '', 4000);
  } else {
    alert('Failed to generate a new secret.');
  }
});

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

toggleBtn.onclick = async () => {
  const newPaused = !isPaused;
  await fetch(`/api/streamer/${streamer}/pause`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ paused: newPaused })
  });
  isPaused = newPaused;
  toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
};

saveBtn.onclick = async () => {
  const imageUrl = imageInput.value.trim();
  const allowGifs = allowGifsCheckbox.checked;
  const allowTTS = allowTTSCheckbox.checked;
  const donationMode = donationModeSelect.value;
  const instapayId = instapayIdInput.value.trim();
  const requireVerifiedDonor = requireVerifiedDonorCheckbox.checked;
  const authProvider = authProviderSelect.value;
  const res = await fetch(`/api/streamer/${streamer}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ imageUrl, allowGifs, allowTTS, donationMode, instapayId, requireVerifiedDonor, authProvider })
  });

  const data = await res.json();
  status.innerHTML = data.success
    ? `${icon('check', 'status-icon success')}Settings saved!`
    : `${icon('x', 'status-icon error')}Failed to save.`;
  if (data.success) {
    imagePreview.src = imageUrl || '';
    currentAuthProvider = authProvider;
    if (banByUsernameSection) banByUsernameSection.style.display = currentAuthProvider === 'twitch' ? 'block' : 'none';
    setTimeout(() => status.textContent = '', 3000);
  }
};

async function loadDonationHistory() {
  try {
    const tokenRes = await fetch(`/api/streamer/${streamer}/token`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const tokenData = await tokenRes.json();
    const overlayToken = tokenData.overlayToken;

    const filter = document.getElementById('donationFilter')?.value || 'all';
    const paidFilter = document.getElementById('paidFilter')?.value || 'all';

    // Build query string for paid
    const qs = new URLSearchParams();
    if (paidFilter === 'paid') qs.set('paid', 'true');
    if (paidFilter === 'free') qs.set('paid', 'false');

    const res = await fetch(`/api/donations/history/${overlayToken}` + (qs.toString() ? `?${qs}` : ''));
    const data = await res.json();

    const container = document.getElementById('donation-history');
    container.innerHTML = '';

    if (!data.success || !Array.isArray(data.donations)) {
      container.textContent = 'Failed to load donations or none found.';
      return;
    }

    let donations = data.donations;
    if (filter === 'waiting') donations = donations.filter(d => !d.shown);
    else if (filter === 'shown') donations = donations.filter(d => d.shown);

    if (donations.length === 0) {
      container.textContent = 'No donations match the selected filter.';
      return;
    }

    for (const d of donations) {
      const card = document.createElement('div');
      card.className = 'donation-card';
      if (d.isPaid) card.classList.add('paid'); // highlight paid

      const time = new Date(d.timestamp).toLocaleString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      const info = document.createElement('div');
      info.className = 'donation-info';

      const usernameDiv = document.createElement('div');
      usernameDiv.innerHTML = `<strong>Username:</strong> ${d.donorVerified ? icon('check', 'status-icon success') : ''}${escapeHTML(d.username)}`;
      info.appendChild(usernameDiv);

      const messageDiv = document.createElement('div');
      messageDiv.innerHTML = `<strong>Message:</strong> ${escapeHTML(d.message)}`;
      info.appendChild(messageDiv);

      if (d.imageUrl) {
        const imgDiv = document.createElement('div');
        const img = document.createElement('img');
        img.src = d.imageUrl;
        img.alt = 'Donation image';
        imgDiv.appendChild(img);
        info.appendChild(imgDiv);
      }

      const afterFields = [
        { label: 'Time', value: time },
        { label: 'Amount', value: `${d.amount} EGP` }
      ];
      for (const field of afterFields) {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${field.label}:</strong> ${escapeHTML(field.value)}`;
        info.appendChild(div);
      }

      const statusDiv = document.createElement('div');
      statusDiv.innerHTML = d.shown
        ? `<strong>Status:</strong> ${icon('check', 'status-icon success')}Shown`
        : `<strong>Status:</strong> ${icon('clock', 'status-icon')}Waiting`;
      info.appendChild(statusDiv);

      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (!d.shown) {
        const mark = document.createElement('button');
        mark.className = 'mark-shown-btn';
        mark.innerHTML = `${icon('check')} Mark as Shown`;
        mark.dataset.id = d._id;
        actions.appendChild(mark);
      }

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.innerHTML = `${icon('trash')} Delete`;
      del.dataset.id = d._id;
      actions.appendChild(del);

      if (d.donorVerified) {
        const ban = document.createElement('button');
        ban.className = 'ban-btn';
        ban.innerHTML = `${icon('ban')} Ban Donor`;
        ban.dataset.id = d._id;
        actions.appendChild(ban);
      }

      card.appendChild(actions);
      container.appendChild(card);
    }

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('Delete this donation?')) {
          const res = await fetch(`/api/donations/${id}`, { method: 'DELETE' });
          const result = await res.json();
          if (result.success) loadDonationHistory();
          else alert('Failed to delete donation.');
        }
      });
    });

    document.querySelectorAll('.mark-shown-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const res = await fetch(`/api/donations/mark-shown/${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          socket.emit('remove-donation', id);
          loadDonationHistory();
        } else {
          alert('Failed to mark as shown.');
        }
      });
    });

    document.querySelectorAll('.ban-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (!confirm('Ban this donor from donating again?')) return;
        const res = await fetch(`/api/donors/ban/${id}`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const result = await res.json();
        if (result.success) {
          loadBannedDonors();
          loadDonationHistory();
        } else {
          alert(result.error || 'Failed to ban donor.');
        }
      });
    });

  } catch (err) {
    console.error('[Control] Failed to load donation history:', err);
    const container = document.getElementById('donation-history');
    container.textContent = 'Error loading donation history. Please try again.';
  }
}

async function loadBannedDonors() {
  if (!bannedContainer) return;
  try {
    const res = await fetch(`/api/donors/banned/${streamer}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    bannedContainer.innerHTML = '';

    if (!data.success || !Array.isArray(data.banned) || data.banned.length === 0) {
      bannedContainer.textContent = 'No banned donors.';
      return;
    }

    for (const b of data.banned) {
      const card = document.createElement('div');
      card.className = 'donation-card banned-donor';

      const info = document.createElement('div');
      info.className = 'donation-info';
      info.innerHTML = `<div><strong>Name:</strong> ${escapeHTML(b.nameAtBan || 'Unknown')}</div>
        <div><strong>Banned:</strong> ${new Date(b.bannedAt).toLocaleString()}</div>`;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const unban = document.createElement('button');
      unban.className = 'unban-btn';
      unban.innerHTML = `${icon('check')} Unban`;
      unban.dataset.id = b._id;
      actions.appendChild(unban);
      card.appendChild(actions);

      bannedContainer.appendChild(card);
    }

    bannedContainer.querySelectorAll('.unban-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const res = await fetch(`/api/donors/banned/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const result = await res.json();
        if (result.success) {
          loadBannedDonors();
        } else {
          alert(result.error || 'Failed to unban donor.');
        }
      });
    });
  } catch (err) {
    console.error('[Control] Failed to load banned donors:', err);
    bannedContainer.textContent = 'Error loading banned donors.';
  }
}

banUsernameBtn?.addEventListener('click', async () => {
  const username = banUsernameInput.value.trim();
  if (!username) return;
  banUsernameBtn.disabled = true;
  try {
    const res = await fetch(`/api/donors/ban-by-username/${streamer}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ username })
    });
    const result = await res.json();
    if (result.success) {
      banUsernameInput.value = '';
      loadBannedDonors();
    } else {
      alert(result.error || 'Failed to ban that username.');
    }
  } catch (err) {
    console.error('[Control] Ban by username failed:', err);
    alert('Error banning that username.');
  } finally {
    banUsernameBtn.disabled = false;
  }
});

function timeUntil(dateStr) {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return 'expiring...';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s left`;
}

async function loadPendingInstapay() {
  if (!pendingContainer) return;
  try {
    const res = await fetch(`/api/instapay/pending/${streamer}`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();

    pendingContainer.innerHTML = '';

    if (!data.success || !Array.isArray(data.donations) || data.donations.length === 0) {
      pendingContainer.textContent = 'No pending InstaPay donations.';
      return;
    }

    for (const d of data.donations) {
      const card = document.createElement('div');
      card.className = 'donation-card pending-instapay';

      const info = document.createElement('div');
      info.className = 'donation-info';
      info.innerHTML = `
        <div><strong>Username:</strong> ${escapeHTML(d.username || 'Anonymous')}</div>
        <div><strong>Message:</strong> ${escapeHTML(d.message || '')}</div>
        <div><strong>Send exactly:</strong> ${d.reservedAmount} EGP</div>
        <div><strong>Expires:</strong> ${timeUntil(d.expiresAt)}</div>
      `;
      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'confirm-instapay-btn';
      confirmBtn.innerHTML = `${icon('check')} Mark as Paid`;
      confirmBtn.dataset.id = d._id;
      actions.appendChild(confirmBtn);
      card.appendChild(actions);

      pendingContainer.appendChild(card);
    }

    pendingContainer.querySelectorAll('.confirm-instapay-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const res = await fetch(`/api/instapay/confirm/${id}`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const result = await res.json();
        if (result.success) {
          loadPendingInstapay();
          loadDonationHistory();
        } else {
          alert(result.error || 'Failed to confirm donation.');
        }
      });
    });
  } catch (err) {
    console.error('[Control] Failed to load pending InstaPay donations:', err);
    pendingContainer.textContent = 'Error loading pending InstaPay donations.';
  }
}

document.getElementById('clearShownBtn')?.addEventListener('click', async () => {
  if (!confirm('Are you sure you want to delete all shown donations?')) return;

  try {
    const tokenRes = await fetch(`/api/streamer/${streamer}/token`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const tokenData = await tokenRes.json();
    const overlayToken = tokenData.overlayToken;

    const res = await fetch(`/api/donations/clear-shown/${overlayToken}`, {
      method: 'DELETE'
    });
    const result = await res.json();

    if (result.success) {
      alert(`Deleted ${result.deletedCount} shown donations.`);
      loadDonationHistory();
    } else {
      alert('Failed to clear shown donations.');
    }
  } catch (err) {
    console.error('[Control] Clear shown error:', err);
    alert('Error clearing shown donations.');
  }
});

window.addEventListener('DOMContentLoaded', () => {
  loadDonationHistory();
  loadPendingInstapay();
  loadBannedDonors();
  setInterval(loadDonationHistory, 5000);
  setInterval(loadPendingInstapay, 5000);
  filterSelect?.addEventListener('change', loadDonationHistory);
});
