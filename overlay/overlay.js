(async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('id');

  if (!token) {
    console.error('[Overlay] ❌ Missing token in URL');
    return;
  }

  console.log('[Overlay] 🔍 Resolving token:', token);

  try {
    const res = await fetch(`/api/overlay/resolve?id=${token}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (!data.username) throw new Error('Streamer not found from token');
    const streamer = data.username;

    startOverlay(streamer);
  } catch (err) {
    console.error('[Overlay] ❌ Failed to resolve token:', err);
  }

  function startOverlay(streamer) {
    console.log('[Overlay] 🚀 Starting overlay for streamer:', streamer);

    const socket = io({ query: { s: streamer } });
    console.log('[Overlay] 🌐 Socket.IO initialized with streamer:', streamer);

    const container = document.getElementById('donation-container');
    const image = document.getElementById('donation-image');
    const username = document.getElementById('donation-username');
    const message = document.getElementById('donation-message');

    if (!container || !image || !username || !message) {
      console.error('[Overlay] ❌ Missing DOM elements. Aborting overlay.');
      return;
    }

    console.log('[Overlay] ✅ DOM elements found. Ready to display donations.');

    let isPaused = false;
    let isDisplaying = false;
    const queue = [];
    const shownTimestamps = new Set();

    function autoResizeText(element, maxFontSize, minFontSize, baseLength = 30) {
      const length = element.textContent.length;
      const scale = Math.max(1 - (length - baseLength) / 100, 0.5);
      const fontSize = Math.max(maxFontSize * scale, minFontSize);
      element.style.fontSize = `${fontSize}px`;
      console.log(`[Overlay] 🔠 Resized text for ${element.id} to ${fontSize}px`);
    }

    function preloadAndShowImage(url) {
      console.log('[Overlay] 🖼️ Preloading image:', url);
      const tempImg = new Image();
      tempImg.onload = () => {
        console.log('[Overlay] ✅ Image loaded:', url);
        image.src = url;
        image.style.display = 'block';
      };
      tempImg.onerror = () => {
        console.error('[Overlay] ❌ Failed to load image:', url);
        image.style.display = 'none';
      };
      tempImg.src = url;
    }

    function showNextDonation() {
      console.log('[Overlay] 🔁 Checking donation queue...');

      while (queue.length > 0) {
        const data = queue[0];

        if (shownTimestamps.has(data.timestamp)) {
          console.log('[Overlay] ⏩ Skipping duplicate timestamp:', data.timestamp);
          queue.shift();
          continue;
        }

        if (data.delayed && isPaused) {
          console.log('[Overlay] ⏸️ Skipping paused donation:', data);
          isDisplaying = false;
          return;
        }

        queue.shift();
        isDisplaying = true;
        shownTimestamps.add(data.timestamp);

        console.log('[Overlay] ✅ Displaying donation:', data);

        username.textContent = (data.username || 'Anonymous') + ' says';
        message.textContent = data.message || '';

        autoResizeText(username, 42, 28, 18);
        autoResizeText(message, 40, 26);

        if (data.imageUrl) {
          preloadAndShowImage(data.imageUrl);
        } else {
          console.log('[Overlay] 🧼 No image provided. Hiding image.');
          image.style.display = 'none';
        }

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

      console.log('[Overlay] 📭 Donation queue empty.');
      isDisplaying = false;
    }

    setInterval(() => {
      fetch(`/config/${streamer}`)
        .then(res => res.json())
        .then(config => {
          console.log('[Overlay] 🔄 Fetched config:', config);
          const wasPaused = isPaused;
          isPaused = config.paused || false;
          if (wasPaused && !isPaused && !isDisplaying && queue.length > 0) {
            console.log('[Overlay] ▶️ Unpaused. Resuming queue...');
            showNextDonation();
          }
        })
        .catch(err => console.error('[Overlay] ❌ Error fetching config:', err));
    }, 3000);

    fetch(`/api/donations/replay/${streamer}`)
      .then(res => res.json())
      .then(data => {
        console.log('[Overlay] 🕘 Replay queue loaded:', data);
        if (data.success && Array.isArray(data.queue)) {
          queue.push(...data.queue);
          console.log(`[Overlay] 📦 Pushed ${data.queue.length} donations into queue`);
          if (!isPaused && !isDisplaying && queue.length > 0) {
            setTimeout(() => {
              console.log('[Overlay] ▶️ Showing replayed donations...');
              showNextDonation();
            }, 1000);
          }
        } else {
          console.warn('[Overlay] ⚠️ Replay response invalid or empty');
        }
      })
      .catch(err => console.error('[Overlay] ❌ Error loading replay donations:', err));

    socket.on('connect', () => {
      console.log('[Overlay] 🔌 Socket connected:', socket.id);
    });

    socket.on('new-donation', (data) => {
      console.log('[Overlay] 🎉 New donation received:', data);
      queue.push(data);
      if (!isPaused && !isDisplaying) {
        setTimeout(() => {
          showNextDonation();
        }, 300);
      }
    });

    socket.on('connect_error', err => {
      console.error('[Overlay] ❌ Socket connection error:', err);
    });
  }
})();
