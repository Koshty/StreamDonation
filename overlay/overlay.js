const socket = io('http://localhost:5000');

const container = document.getElementById('donation-container');
const image = document.getElementById('donation-image');
const username = document.getElementById('donation-username');
const message = document.getElementById('donation-message');

// Resize username to fit one line within max width
function fitTextToWidth(element, maxFontSize = 42, minFontSize = 22, maxWidth = 350) {
  let fontSize = maxFontSize;
  element.style.whiteSpace = 'nowrap';
  element.style.fontSize = `${fontSize}px`;

  // Temporarily show if hidden to measure
  element.style.visibility = 'hidden';
  element.style.display = 'inline-block';

  while (element.scrollWidth > maxWidth && fontSize > minFontSize) {
    fontSize -= 1;
    element.style.fontSize = `${fontSize}px`;
  }

  element.style.visibility = 'visible';
  element.style.display = '';
}

// Resize message based on character length
function autoResizeText(element, maxFontSize = 40, minFontSize = 22) {
  const length = element.textContent.length;
  const scale = Math.max(1 - (length - 30) / 100, 0.5);
  const fontSize = Math.max(maxFontSize * scale, minFontSize);
  element.style.fontSize = `${fontSize}px`;
}

socket.on('new-donation', (data) => {
  const displayUsername = (data.username || 'Anonymous') + ' says';
  const displayMessage = data.message || '';

  username.textContent = displayUsername;
  message.textContent = displayMessage;

  fitTextToWidth(username, 42, 32, 350);
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
