const socket = io('http://localhost:5000');

const container = document.getElementById('donation-container');
const image = document.getElementById('donation-image');
const username = document.getElementById('donation-username');
const message = document.getElementById('donation-message');

// Auto-resize font size based on content length
function autoResizeText(element, maxFontSize = 48, minFontSize = 24) {
  const length = element.textContent.length;
  const scale = Math.max(1 - (length - 30) / 100, 0.5); // shrink if too long
  const fontSize = Math.max(maxFontSize * scale, minFontSize);
  element.style.fontSize = `${fontSize}px`;
}

socket.on('new-donation', (data) => {
  const displayUsername = (data.username || 'Anonymous') + ' says';
  const displayMessage = data.message || '';

  username.textContent = displayUsername;
  message.textContent = displayMessage;

  autoResizeText(username, 42, 24);
  autoResizeText(message, 40, 22);

  if (data.imageUrl) {
    image.src = data.imageUrl;
    image.style.display = 'block';
  } else {
    image.style.display = 'none';
  }

  setTimeout(() => {
    container.classList.remove('hidden');
    container.classList.add('visible');
  }, 300);

  setTimeout(() => {
    container.classList.remove('visible');
    container.classList.add('hidden');
  }, 7000);
});
