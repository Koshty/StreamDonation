const socket = io('http://localhost:5000');

const container = document.getElementById('donation-container');
const image = document.getElementById('donation-image');
const username = document.getElementById('donation-username');
const message = document.getElementById('donation-message');

// Resize any text based on character length
function autoResizeText(element, maxFontSize, minFontSize, baseLength = 30) {
  const length = element.textContent.length;
  const scale = Math.max(1 - (length - baseLength) / 100, 0.5);
  const fontSize = Math.max(maxFontSize * scale, minFontSize);
  element.style.fontSize = `${fontSize}px`;
}

socket.on('new-donation', (data) => {
  const displayUsername = (data.username || 'Anonymous') + ' says';
  const displayMessage = data.message || '';

  username.textContent = displayUsername;
  message.textContent = displayMessage;

  autoResizeText(username, 42, 28,18);
  autoResizeText(message, 40, 26);

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
  }, 70000);
});
