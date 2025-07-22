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
  const shownTimestamps = new Set();

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

      if (shownTimestamps.has(data.timestamp)) {
        console.log('[Donation] Skipping duplicate:', data.timestamp);
        queue.shift();
        continue;
      }

      if (data.delayed && isPaused) {
        console.log('[Donation] Skipped due to pause:', data);
        isDisplaying = false;
        return;
      }

      queue.shift();
      isDisplaying = true;
      shownTimestamps.add(data.timestamp);

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

      console.log('[Donation] Displaying:', data);

      // Reset classes first and force reflow to restart animation
      container.classList.remove('visible', 'hidden', 'delay-visible');
      void container.offsetWidth;
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
          console.log('[Donation] Resume detected, displaying next in queue');
          showNextDonation();
        }
      });
  }, 3000);

  // Load recent buffered donations on initial load (with delay)
  fetch(`/api/donations/replay/${streamer}`)
    .then(res => res.json())
    .then(data => {
      if (data.success && Array.isArray(data.queue)) {
        queue.push(...data.queue);
        if (!isPaused && !isDisplaying && queue.length > 0) {
          setTimeout(() => {
            console.log('[Donation] Showing from replay queue after load delay');
            showNextDonation();
          }, 1000); // 1 second delay helps OBS render in time
        }
      }
    });

  // On new donation received
  socket.on('new-donation', (data) => {
    queue.push(data);
    if (!isPaused && !isDisplaying) {
      setTimeout(() => {
        console.log('[Donation] Showing from socket event');
        showNextDonation();
      }, 300); // slight delay to ensure smooth rendering in OBS
    }
  });
});
