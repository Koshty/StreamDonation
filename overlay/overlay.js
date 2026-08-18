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

      if (isPaused) {
        console.log('[Overlay] ⏸️ Overlay is paused. Not displaying any donations.');
        isDisplaying = false;
        return;
      }

      while (queue.length > 0) {
        const data = queue[0];

        if (shownTimestamps.has(data.timestamp)) {
          console.log('[Overlay] ⏩ Skipping duplicate timestamp:', data.timestamp);
          queue.shift();
          continue;
        }

        queue.shift();
        isDisplaying = true;
        shownTimestamps.add(data.timestamp);

        console.log('[Overlay] ✅ Displaying donation:', data);

        // ✨ GOLD FRAME TOGGLE FOR PAID DONATIONS
        container.classList.toggle('paid', !!data.isPaid);

        // ✨ HEADLINE TEXT: "user donated [amount]" IF PAID, ELSE "user says"
        if (data.isPaid) {
          const amt = (typeof data.amount === 'number' && !Number.isNaN(data.amount))
            ? data.amount
            : 0;
          username.textContent = `${data.username || 'Anonymous'} donated ${amt} EGP`;
        } else {
          username.textContent = `${data.username || 'Anonymous'} says`;
        }

        // message stays as-is
        message.textContent = data.message || '';

        autoResizeText(username, 42, 28, 18);

        // 👇 Dynamic font sizing for long messages
        const len = message.textContent.length;
        if (len > 400) {
          message.style.fontSize = '1.6rem';
        } else if (len > 300) {
          message.style.fontSize = '1.8rem';
        } else if (len > 200) {
          message.style.fontSize = '2rem';
        } else {
          message.style.fontSize = '2.4rem';
        }

        if (data.imageUrl) {
          preloadAndShowImage(data.imageUrl);
        } else {
          image.style.display = 'none';
        }

        container.classList.remove('visible', 'hidden', 'delay-visible');
        void container.offsetWidth;
        container.classList.add('delay-visible');

        const audio = document.getElementById('donation-audio');
        if (data.audioUrl && audio) {
          audio.muted = false;           // ✅ Unmute explicitly
          audio.volume = 1.0;            // ✅ Max volume
          audio.src = data.audioUrl;

          audio.play()
            .then(() => {
              console.log('[Overlay] ✅ Audio playback started');
            })
            .catch(err => {
              console.warn('[Overlay] ⚠️ Audio play blocked or failed:', err);
            });
        }

        setTimeout(() => {
          container.classList.remove('delay-visible');
          container.classList.add('visible');
        }, 1000);

        setTimeout(() => {
          container.classList.remove('visible');
          container.classList.add('hidden');
          setTimeout(() => {
            container.classList.remove('hidden');
            isDisplaying = false;

            // ✅ Mark as shown in DB
            if (data._id) {
              fetch(`/api/donations/mark-shown/${data._id}`, {
                method: 'POST'
              }).then(res => res.json())
                .then(result => {
                  console.log('[Overlay] ✅ Marked donation as shown:', result);
                }).catch(err => {
                  console.error('[Overlay] ❌ Failed to mark donation as shown:', err);
                });
            }

            if (!isPaused && queue.length > 0) {
              showNextDonation();
            } else {
              console.log('[Overlay] ⏸️ Stopping after current donation due to pause.');
            }
          }, 1000);
        }, 8000);
        return;
      }

      console.log('[Overlay] 📭 Donation queue empty.');
      isDisplaying = false;
    }

    // ✅ Load initial pause state
    fetch(`/config/${streamer}`)
      .then(res => res.json())
      .then(config => {
        isPaused = config.paused || false;
        console.log('[Overlay] ⏯️ Initial pause state:', isPaused);
      })
      .catch(err => console.error('[Overlay] ❌ Failed to fetch initial config:', err));

    // ✅ Load donation queue on reconnect
    fetch(`/api/donations/replay/${streamer}`)
      .then(res => res.json())
      .then(data => {
        console.log('[Overlay] 🕘 Replay queue loaded:', data);
        if (data.success && Array.isArray(data.queue)) {
          const unseen = data.queue.filter(d => !d.shown);
          queue.push(...unseen);
          console.log(`[Overlay] 📦 Pushed ${unseen.length} unseen donations into queue`);
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

    // ✅ WebSocket: new donation
    socket.on('new-donation', (data) => {
      console.log('[Overlay] 🎉 New donation received:', data);
      if (!data.shown) {
        queue.push(data);
        if (!isPaused && !isDisplaying) {
          setTimeout(() => {
            showNextDonation();
          }, 300);
        }
      } else {
        console.log('[Overlay] 🚫 Skipping already shown donation');
      }
    });

    // ✅ WebSocket: pause state change
    socket.on('pause-state-changed', (data) => {
      const wasPaused = isPaused;
      isPaused = data.paused;
      console.log('[Overlay] 🔄 Pause state updated via socket:', isPaused);
      if (wasPaused && !isPaused && !isDisplaying && queue.length > 0) {
        console.log('[Overlay] ▶️ Resuming from pause...');
        showNextDonation();
      }
    });

    // ✅ WebSocket: remove donation from queue (manual control panel action)
    socket.on('remove-donation', (idToRemove) => {
      const before = queue.length;
      const filtered = queue.filter(d => d._id !== idToRemove);
      queue.length = 0;
      queue.push(...filtered);
      const after = queue.length;
      console.log(`[Overlay] 🧹 Removed ${before - after} donation(s) with ID ${idToRemove}`);
    });

    socket.on('connect', () => {
      console.log('[Overlay] 🔌 Socket connected:', socket.id);
    });

    socket.on('connect_error', err => {
      console.error('[Overlay] ❌ Socket connection error:', err);
    });
  }
})();
