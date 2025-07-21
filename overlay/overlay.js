const socket = io('http://localhost:5000');

const container = document.getElementById('donation-container');
const image = document.getElementById('donation-image');
const username = document.getElementById('donation-username');
const message = document.getElementById('donation-message');

socket.on('new-donation', (data) => {
  username.textContent = (data.username || 'Anonymous') + ' says';
  message.textContent = data.message || '';

  if (data.imageUrl) {
    image.src = data.imageUrl;
    image.style.display = 'block';
  } else {
    image.style.display = 'none';
  }

  setTimeout(() => {
    container.classList.remove('hidden');
    container.classList.add('visible');
  }, 500);

  setTimeout(() => {
    container.classList.remove('visible');
    container.classList.add('hidden');
  }, 7000);
});
