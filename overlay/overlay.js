const socket = io('http://localhost:5000');

const container = document.getElementById('donation-container');
const image = document.getElementById('donation-image');
const username = document.getElementById('donation-username');
const message = document.getElementById('donation-message');

// Auto-resize font size based on content length
function autoResizeText(element, maxFontSize = 48, minFontSize = 22) {
  const length = element.textContent.length;
  const scale = Math.max(1 - (length - 30) / 100, 0.5); // scale down if >30 chars
  const fontSize = Math.max(maxFontSize * scale, minFontSize);
  element.style.fontSize = `${fontSize}px`;

  const computedSize = window.getComputedStyle(element).fontSize;
  console.log(`${element.id} font size is:`, computedSize);
}

// Shrink entire container if too tall
function shrinkToFit(container, maxHeight) {
  container.style.transform = 'translate(-50%, -50%) scale(1)';
  container.style.transformOrigin = 'top center';

  let scale = 1;
  const step = 0.05;
  while (container.offsetHeight > maxHeight && scale > 0.5) {
    scale -= step;
    container.style.transform = `translate(-50%, -50%) scale(${scale})`;
  }
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
    shrinkToFit(container, window.innerHeight * 0.8);
  }, 300);

  setTimeout(() => {
    container.classList.remove('visible');
    container.classList.add('hidden');
    container.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 70000);
});
