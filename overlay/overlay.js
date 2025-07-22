document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const streamer = urlParams.get('s') || 'default';

  const socket = io({
    query: { s: streamer }
  });

  const container = document.getElementById('donation-container');
  const image = document.getElementById('donation-image');
  const username = document.getElementById('donation-username');
  const message = document.getElementById('donation-message');

  let isPaused = false;
  let isDisplaying = false;
  const queue = [];

  // Resize text based on length
  function autoResizeText(element, maxFontSize, minFontSize, baseLength = 30) {
    const length = element.textContent.length;
    const scale = Math.max(1 - (length - baseLength) / 100, 0.5);
    const fontSize = Math.max(maxFontSize * scale, minFontSize);
    element.style.fontSize = `${fontSize}px`;
  }

  // Preload image before displaying
  function preloadAndShowImage(url) {
    const tempImg = new Image();
    tempImg.onload = () => {
      image.src = url;
      image.style.display = 'block';
    };
    tempImg.src = url;
  }

  function showNextDonation() {
    while (queue.length > 0) {
      const data = queue[0];

      if (data.delayed && isPaused) {
        isDisplaying = false;
        return;
      }

      queue.shift();
      isDisplaying = true;

      const displayUsername = (data.username || 'Anonymous') + ' says';
      const displayMessage = data.message || '';

      username.textContent = displayUsername;
      message.textContent = displayMessage;

      autoResizeText(username, 42, 28, 18);
      autoResizeText(message, 40, 26);

      if (data.imageUrl) {
        preloadAndShowImage(data.imageUrl);
      } else {
        image.style.display = 'none';
      }

      container.classList.add('delay-visible');

      setTimeout(() => {
        container.classList.remove('delay-visible');
        container.classList.add('visible');
      }, 1000);

      setTimeout(() => {
        container.classList.remove('visible');
        container.classList.add('hidden');

        setTimeout(() => {
          container.classList.remove('hidden');
          showNextDonation();
        }, 1000);
      }, 8000);

      return;
    }

    isDisplaying = false;
  }

  // Poll for updated pause setting
  setInterval(() => {
    fetch(`/config/${streamer}`)
      .then(res => res.json())
      .then(config => {
        const wasPaused = isPaused;
        isPaused = config.paused || false;

        if (wasPaused && !isPaused && !isDisplaying && queue.length > 0) {
          showNextDonation();
        }
      });
  }, 3000);

  // Load recent buffered donations on initial load
  fetch(`/api/donations/replay/${streamer}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.queue)) {
        queue.push(...data.queue);
        if (!isPaused && !isDisplaying && queue.length > 0) {
          showNextDonation();
        }
      }
    });

  // On new donation received
  socket.on('new-donation', (data) => {
    queue.push(data);
    if (!isPaused && !isDisplaying) {
      showNextDonation();
    }
  });
});
