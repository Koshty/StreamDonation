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

const token = localStorage.getItem('token');
if (!token) window.location.href = '/login';

const streamer = getUsernameFromToken(token);
if (!streamer) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

const socket = io({ query: { s: streamer } }); // ✅ moved AFTER streamer is declared

document.getElementById('streamer-display').textContent = `Streamer: ${streamer}`;

const toggleBtn = document.getElementById('togglePause');
const imageInput = document.getElementById('imageUrl');
const saveBtn = document.getElementById('saveImage');
const status = document.getElementById('status');
const allowGifsCheckbox = document.getElementById('allowGifsToggle');
const imagePreview = document.getElementById('imagePreview');
const obsLinkInput = document.getElementById('obsLink');
const donateLinkInput = document.getElementById('donateLink');
const copyStatus = document.getElementById('copyStatus');
const filterSelect = document.getElementById('donationFilter');

let isPaused = false;

// Load streamer config
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
    toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
  })
  .catch(() => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  });

// OBS + donation link setup
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

function copyToClipboard(elementId) {
  const input = document.getElementById(elementId);
  if (!input) return;
  navigator.clipboard.writeText(input.value)
    .then(() => {
      copyStatus.textContent = `✅ Copied ${elementId === 'obsLink' ? 'OBS' : 'donation'} link!`;
      setTimeout(() => copyStatus.textContent = '', 2000);
    })
    .catch(() => copyStatus.textContent = '❌ Failed to copy.');
}

document.getElementById('copyObsBtn').addEventListener('click', () => copyToClipboard('obsLink'));
document.getElementById('copyDonateBtn').addEventListener('click', () => copyToClipboard('donateLink'));

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

  const res = await fetch(`/api/streamer/${streamer}/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ imageUrl, allowGifs })
  });

  const data = await res.json();
  status.textContent = data.success ? '✅ Settings saved!' : '❌ Failed to save.';
  if (data.success) {
    imagePreview.src = imageUrl || '';
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

    const res = await fetch(`/api/donations/history/${overlayToken}`);
    const data = await res.json();

    const container = document.getElementById('donation-history');
    const filter = filterSelect?.value || 'all';
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

      const time = new Date(d.timestamp).toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit', hour12: true
      });

      const info = document.createElement('div');
      info.className = 'donation-info';

      const fields = [
        { label: '👤 Username', value: d.username },
        { label: '💬 Message', value: d.message }
      ];

      for (const field of fields) {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${field.label}:</strong> ${escapeHTML(field.value)}`;
        info.appendChild(div);
      }

      if (d.imageUrl) {
        const imgDiv = document.createElement('div');
        const img = document.createElement('img');
        img.src = d.imageUrl;
        img.alt = 'Donation image';
        imgDiv.appendChild(img);
        info.appendChild(imgDiv);
      }

      const afterFields = [
        { label: '🕒 Time', value: time },
        { label: '💰 Amount', value: `${d.amount} EGP` },
        { label: 'Status', value: d.shown ? '✅ Shown' : '⏸️ Waiting' }
      ];
      for (const field of afterFields) {
        const div = document.createElement('div');
        div.innerHTML = `<strong>${field.label}:</strong> ${escapeHTML(field.value)}`;
        info.appendChild(div);
      }

      card.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'actions';

      if (!d.shown) {
        const mark = document.createElement('button');
        mark.className = 'mark-shown-btn';
        mark.textContent = '✅ Mark as Shown';
        mark.dataset.id = d._id;
        actions.appendChild(mark);
      }

      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.textContent = '🗑️ Delete';
      del.dataset.id = d._id;
      actions.appendChild(del);

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
          else alert('❌ Failed to delete donation.');
        }
      });
    });

    document.querySelectorAll('.mark-shown-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const res = await fetch(`/api/donations/mark-shown/${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          socket.emit('remove-donation', id); // ✅ tell overlay to remove it
          loadDonationHistory();
        } else {
          alert('❌ Failed to mark as shown.');
        }
      });
    });

  } catch (err) {
    console.error('[Control] Failed to load donation history:', err);
    const container = document.getElementById('donation-history');
    container.textContent = 'Error loading donation history. Please try again.';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadDonationHistory();
  setInterval(loadDonationHistory, 5000);
  filterSelect?.addEventListener('change', loadDonationHistory);
});
