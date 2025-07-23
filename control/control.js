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
      donateLinkInput.value = `${baseUrl}/donate?id=${overlayToken}`;
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
