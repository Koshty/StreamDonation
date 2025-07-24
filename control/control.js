function getUsernameFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.username;
  } catch (e) {
    return null;
  }
}

const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

const streamer = getUsernameFromToken(token);
if (!streamer) {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

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

// Load current config
fetch(`/api/streamer/${streamer}/config`, {
  headers: {
    'Authorization': 'Bearer ' + token
  }
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
  .catch(err => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  });

// Load overlay token to build OBS and donate links
fetch(`/api/streamer/${streamer}/token`, {
  headers: { 'Authorization': 'Bearer ' + token }
})
  .then(res => res.json())
  .then(data => {
    if (data.success && data.overlayToken) {
      const overlayToken = data.overlayToken;
      const baseUrl = window.location.origin;
      obsLinkInput.value = `${baseUrl}/overlay?id=${overlayToken}`;
      donateLinkInput.value = `${baseUrl}/donate?s=${streamer}`;
    }
  });

// ✅ Modern clipboard copy function
function copyToClipboard(elementId) {
  const input = document.getElementById(elementId);
  if (!input) return;

  navigator.clipboard.writeText(input.value).then(() => {
    copyStatus.textContent = `✅ Copied ${elementId === 'obsLink' ? 'OBS' : 'donation'} link!`;
    setTimeout(() => {
      copyStatus.textContent = '';
    }, 2000);
  }).catch(err => {
    console.error('Clipboard copy failed', err);
    copyStatus.textContent = '❌ Failed to copy.';
  });
}

document.getElementById('copyObsBtn').addEventListener('click', () => copyToClipboard('obsLink'));
document.getElementById('copyDonateBtn').addEventListener('click', () => copyToClipboard('donateLink'));

// Logout function
function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login';
}

// Pause/resume toggle
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

// Save button: image + GIF toggle
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
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
  }
};

// ✅ Load donation history with filter, delete, and mark-as-shown support
async function loadDonationHistory() {
  try {
    console.log('[Control] Fetching donation history for:', streamer);

    // First resolve overlayToken
    const tokenRes = await fetch(`/api/streamer/${streamer}/token`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const tokenData = await tokenRes.json();
    const overlayToken = tokenData.overlayToken;

    const res = await fetch(`/api/donations/history/${overlayToken}`);
    const data = await res.json();

    console.log('[Control] API response:', data);

    const container = document.getElementById('donation-history');
    const filter = filterSelect?.value || 'all';
    container.innerHTML = '';

    if (!data.success || !Array.isArray(data.donations)) {
      container.textContent = 'Failed to load donations or none found.';
      return;
    }

    let donations = data.donations;

    if (filter === 'waiting') {
      donations = donations.filter(d => !d.shown);
    } else if (filter === 'shown') {
      donations = donations.filter(d => d.shown);
    }

    if (donations.length === 0) {
      container.textContent = 'No donations match the selected filter.';
      return;
    }

    donations.forEach(d => {
      const item = document.createElement('div');
      item.style.marginBottom = '10px';

      const time = new Date(d.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });

      item.innerHTML = `
        <div>👤 <strong>Username:</strong> ${d.username}</div>
        <div>💬 <strong>Message:</strong> ${d.message}</div>
        <div>🕒 <strong>Time:</strong> ${time}</div>
        <div>💰 <strong>Amount:</strong> ${d.amount} EGP</div>
        <div>Status: ${d.shown ? '✅ Shown' : '⏸️ Waiting'}</div>
        ${d.imageUrl ? `<div><img src="${d.imageUrl}" style="max-width: 150px; border-radius: 6px; margin-top: 6px;" /></div>` : ''}
        <div style="margin-top: 6px;">
          ${!d.shown ? `<button data-id="${d._id}" class="mark-shown-btn">✅ Mark as Shown</button>` : ''}
          <button data-id="${d._id}" class="delete-btn">🗑️ Delete</button>
        </div>
        <hr />
      `;

      container.appendChild(item);
    });

    // Attach delete button handlers
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('Delete this donation?')) {
          const res = await fetch(`/api/donations/${id}`, { method: 'DELETE' });
          const result = await res.json();
          if (result.success) {
            loadDonationHistory();
          } else {
            alert('❌ Failed to delete donation.');
          }
        }
      });
    });

    // Attach mark-as-shown handlers
    document.querySelectorAll('.mark-shown-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const res = await fetch(`/api/donations/mark-shown/${id}`, { method: 'POST' });
        const result = await res.json();
        if (result.success) {
          loadDonationHistory();
        } else {
          alert('❌ Failed to mark donation as shown.');
        }
      });
    });

  } catch (err) {
    console.error('[Control] Failed to load donation history:', err);
    const container = document.getElementById('donation-history');
    container.textContent = 'Error loading donation history.';
  }
}



// ✅ Load on page ready
window.addEventListener('DOMContentLoaded', () => {
  loadDonationHistory();
  setInterval(loadDonationHistory, 5000); // auto-refresh every 10s

  if (filterSelect) {
    filterSelect.addEventListener('change', loadDonationHistory);
  }
});
