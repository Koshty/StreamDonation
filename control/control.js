const params = new URLSearchParams(window.location.search);
const streamer = params.get('s') || 'default';

document.getElementById('streamer-display').textContent = `Streamer: ${streamer}`;

const toggleBtn = document.getElementById('togglePause');
const imageInput = document.getElementById('imageUrl');
const saveBtn = document.getElementById('saveImage');
const status = document.getElementById('status');
const allowGifsCheckbox = document.getElementById('allowGifsToggle');
const imagePreview = document.getElementById('imagePreview');

let isPaused = false;

// Load current config
fetch(`/api/streamer/${streamer}/config`)
  .then(res => res.json())
  .then(data => {
    isPaused = data.paused || false;
    imageInput.value = data.defaultImageUrl || '';
    imagePreview.src = data.defaultImageUrl || '';
    allowGifsCheckbox.checked = !!data.allowGifs;
    toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
  });

// Pause/resume toggle (does NOT require Save)
toggleBtn.onclick = async () => {
  const newPaused = !isPaused;
  await fetch(`/api/streamer/${streamer}/pause`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paused: newPaused })
  });
  isPaused = newPaused;
  toggleBtn.textContent = isPaused ? 'Resume' : 'Pause';
};

// Save button: saves image URL and allowGifs
saveBtn.onclick = async () => {
  const imageUrl = imageInput.value.trim();
  const allowGifs = allowGifsCheckbox.checked;

  const res = await fetch(`/api/streamer/${streamer}/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
