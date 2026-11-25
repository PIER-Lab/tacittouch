const reel = document.querySelector('#hero-video');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const visibleFraction = 0.35;
const observedPlayers = new Map();

function autoplayAllowed() {
  return !reducedMotion.matches && !navigator.connection?.saveData;
}

function preloadVideo(video, preload) {
  video.preload = preload;
  if (video.readyState === HTMLMediaElement.HAVE_NOTHING &&
      video.networkState !== HTMLMediaElement.NETWORK_LOADING) {
    video.load();
  }
}

function updateViewportPlayback() {
  const foreground = !document.hidden && !document.querySelector('dialog[open]');
  const autoplay = autoplayAllowed();
  for (const [target, player] of observedPlayers) {
    if (foreground && autoplay && player.nearby) {
      for (const video of player.videos) {
        if (video.preload !== 'none') continue;
        preloadVideo(video, 'metadata');
        // Prepare the actual starting frame for a synchronized camera view.
        const offset = Number(video.dataset.offset ?? 0);
        if (offset > 0) video.currentTime = offset;
      }
      player.nearby = false;
      preloadObserver.unobserve(target);
    }
    player.update(foreground && player.visible, autoplay);
  }
}

const viewportObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    observedPlayers.get(entry.target).visible = entry.intersectionRatio >= visibleFraction;
  }
  updateViewportPlayback();
}, { threshold: visibleFraction });

// Buffer nearby previews without starting them before they enter the viewport.
const preloadObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    observedPlayers.get(entry.target).nearby = entry.isIntersecting;
  }
  updateViewportPlayback();
}, { rootMargin: '700px 0px' });

function observePlayback(target, update, videos = []) {
  observedPlayers.set(target, { visible: false, nearby: false, update, videos });
  viewportObserver.observe(target);
  if (videos.length) preloadObserver.observe(target);
}

observePlayback(reel, (visible, autoplay) => {
  if (visible && autoplay) {
    if (reel.paused) reel.play().catch(() => {});
  } else if (!reel.paused) {
    reel.pause();
  }
});
document.addEventListener('visibilitychange', updateViewportPlayback);
reducedMotion.addEventListener('change', updateViewportPlayback);
navigator.connection?.addEventListener('change', updateViewportPlayback);

function waitForVideo(video, readyState, signal) {
  const ready = () => video.readyState >= readyState && !video.seeking;
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ready()) return Promise.resolve();
  if (video.error) return Promise.reject(video.error);

  return new Promise((resolve, reject) => {
    const events = ['loadedmetadata', 'canplay', 'seeked'];
    const finish = error => {
      clearTimeout(timer);
      for (const event of events) video.removeEventListener(event, check);
      video.removeEventListener('error', fail, true);
      signal.removeEventListener('abort', cancel);
      if (error) reject(error);
      else resolve();
    };
    const check = () => { if (ready()) finish(); };
    const fail = () => finish(new Error('Video could not load'));
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(fail, 15000);

    for (const event of events) video.addEventListener(event, check);
    video.addEventListener('error', fail, true);
    signal.addEventListener('abort', cancel, { once: true });
    check();
  });
}

function setUpRollout(element) {
  const views = [...element.querySelectorAll('video')];
  const offsets = views.map(video => Number(video.dataset.offset));
  const [leader] = views;
  const controls = element.querySelector('.rollout-controls');
  const button = controls.querySelector('button');
  const timeline = controls.querySelector('input');
  const elapsed = controls.querySelector('.rollout-time');
  const error = element.querySelector('.rollout-error');
  const playbackRate = Number(element.dataset.playbackRate ?? 1);
  let request;
  let duration = 0;
  let scrubbing = false;
  let mayAutoplay = true;
  let playingAutomatically = false;

  function showTime(seconds) {
    const whole = Math.floor(seconds);
    const label = Math.floor(whole / 60) + ':' + String(whole % 60).padStart(2, '0');
    elapsed.textContent = label;
    timeline.setAttribute('aria-valuetext', label);
  }

  function seekTo(seconds) {
    timeline.value = seconds;
    showTime(seconds);
    views.forEach((video, i) => {
      const time = Math.min(video.duration, seconds + offsets[i]);
      if (Math.abs(video.currentTime - time) > 0.01) video.currentTime = time;
    });
  }

  function pause() {
    request?.abort();
    request = undefined;
    for (const video of views) video.pause();
    button.textContent = 'Play all views';
    playingAutomatically = false;
  }

  function finish() {
    mayAutoplay = false;
    pause();
    seekTo(duration);
  }

  async function play(seconds, automatic = false) {
    if (request) pause();
    playingAutomatically = automatic;
    const pending = new AbortController();
    request = pending;
    button.textContent = 'Cancel loading';
    error.hidden = true;

    try {
      for (const video of views) preloadVideo(video, 'auto');
      await Promise.all(views.map(video => waitForVideo(video, 1, pending.signal)));
      if (request !== pending) return;
      duration = Math.min(...views.map((video, i) => video.duration - offsets[i]));
      timeline.max = duration;
      timeline.disabled = false;
      seekTo(seconds >= duration - 0.05 ? 0 : seconds);
      await Promise.all(views.map(video => waitForVideo(video, 3, pending.signal)));
      if (request !== pending) return;
      for (const video of views) video.playbackRate = playbackRate;
      await Promise.all(views.map(video => video.play()));
      if (request === pending) button.textContent = 'Pause all views';
    } catch {
      if (request !== pending) return;
      mayAutoplay = false;
      pause();
      error.textContent = 'Could not load all views. Try playing again.';
      error.hidden = false;
    }
  }

  function toggle() {
    mayAutoplay = false;
    if (request) pause();
    else play(Number(timeline.value));
  }

  button.addEventListener('click', toggle);
  for (const video of views) {
    video.controls = false;
    video.muted = true;
    video.defaultPlaybackRate = playbackRate;
    video.addEventListener('click', toggle);
    video.addEventListener('ended', () => {
      if (request && duration > 0) finish();
    });
  }
  controls.hidden = false;

  timeline.addEventListener('input', () => {
    scrubbing = true;
    showTime(Number(timeline.value));
  });
  timeline.addEventListener('change', () => {
    mayAutoplay = false;
    scrubbing = false;
    const time = Number(timeline.value);
    if (request && time < duration - 0.05) play(time);
    else {
      pause();
      seekTo(time);
    }
  });

  leader.addEventListener('timeupdate', () => {
    if (!request || leader.paused || leader.seeking || scrubbing) return;
    const time = Math.max(0, leader.currentTime - offsets[0]);
    if (time >= duration - 0.03) {
      finish();
      return;
    }
    timeline.value = time;
    showTime(time);
    views.slice(1).forEach((video, i) => {
      const target = time + offsets[i + 1];
      if (!video.seeking && Math.abs(video.currentTime - target) > 0.2) video.currentTime = target;
    });
  });

  observePlayback(element.querySelector('.rollout-views'), (visible, autoplay) => {
    if (request && (!visible || (!autoplay && playingAutomatically))) pause();
    else if (visible && autoplay && mayAutoplay && !request) play(Number(timeline.value), true);
  }, views);
  return pause;
}

const pauseRollout = new Map();
for (const element of document.querySelectorAll('.rollout-player')) {
  pauseRollout.set(element, setUpRollout(element));
}

for (const video of document.querySelectorAll('.sim-pair video, .contact-stage video')) {
  let mayAutoplay = true;
  let playingAutomatically = false;
  let pausedByViewport = false;
  video.addEventListener('pause', () => {
    if (!pausedByViewport) mayAutoplay = false;
    pausedByViewport = false;
    playingAutomatically = false;
  });
  observePlayback(video, (visible, autoplay) => {
    if (!video.paused && (!visible || (!autoplay && playingAutomatically))) {
      pausedByViewport = true;
      video.pause();
    } else if (visible && autoplay && mayAutoplay && video.paused && !video.ended) {
      playingAutomatically = true;
      video.muted = true;
      video.play().catch(error => {
        if (error.name !== 'AbortError') mayAutoplay = false;
      });
    }
  }, [video]);
}

const rolloutButtons = document.querySelectorAll('[data-rollout-choice]');
for (const choice of rolloutButtons) {
  choice.addEventListener('click', () => {
    for (const button of rolloutButtons) {
      const selected = button === choice;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      button.setAttribute('aria-pressed', String(selected));
      panel.hidden = !selected;
      if (panel.hidden) {
        for (const player of panel.querySelectorAll('.rollout-player')) pauseRollout.get(player)();
      }
    }
  });
}

for (const disclosure of document.querySelectorAll('details')) {
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.open) for (const video of disclosure.querySelectorAll('video')) video.pause();
  });
}

// Use the results table for both the accessible values and the chart.
for (const card of document.querySelectorAll('.scorecard')) {
  const table = card.querySelector('table');
  const chart = card.querySelector('.score-chart');
  const caption = document.createElement('figcaption');
  caption.textContent = table.caption.textContent;

  const legend = document.createElement('ul');
  legend.className = 'score-legend';
  const methods = [...table.tHead.rows[0].cells].slice(1);
  for (const header of methods) {
    const entry = document.createElement('li');
    entry.append(...[...header.childNodes].map(node => node.cloneNode(true)));
    const category = document.createElement('small');
    category.className = 'score-category';
    category.textContent = header.dataset.category;
    entry.append(category);
    legend.append(entry);
  }

  const plot = document.createElement('div');
  plot.className = 'score-plot';
  const axis = document.createElement('div');
  axis.className = 'score-axis';
  for (const rate of [100, 75, 50, 25, 0]) {
    const tick = document.createElement('span');
    tick.textContent = rate;
    axis.append(tick);
  }

  const groups = document.createElement('div');
  groups.className = 'score-groups';
  for (const row of table.tBodies[0].rows) {
    const [task, ...scores] = row.cells;
    const group = document.createElement('div');
    group.className = 'score-group';
    const bars = document.createElement('div');
    bars.className = 'score-bars';
    scores.forEach((score, index) => {
      const rate = score.textContent.trim();
      const bar = document.createElement('div');
      bar.className = 'score-bar';
      bar.style.setProperty('--rate', rate + '%');
      bar.title = task.textContent + ' · ' + methods[index].textContent + ' · ' + rate + '%';
      const value = document.createElement('span');
      value.textContent = rate;
      bar.append(value);
      bars.append(bar);
    });
    const label = document.createElement('div');
    label.className = 'score-task';
    label.textContent = task.textContent;
    group.append(bars, label);
    groups.append(group);
  }

  plot.append(axis, groups);
  chart.append(caption, legend, plot);
  chart.hidden = false;
  card.querySelector('.score-details').open = false;
}

const figures = document.querySelector('#figure-dialog');
const enlarged = figures.querySelector('img');
for (const anchor of document.querySelectorAll('[data-figure]')) {
  anchor.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || typeof figures.showModal !== 'function') return;
    event.preventDefault();
    enlarged.src = anchor.href;
    enlarged.alt = anchor.querySelector('img').alt;
    figures.showModal();
    updateViewportPlayback();
  });
}

const sensors = document.querySelector('#sensor-dialog');
const sensorVideo = sensors.querySelector('video');
const sensorTitle = sensors.querySelector('h3');
const sensorDescription = sensors.querySelector('#sensor-description');
for (const button of document.querySelectorAll('[data-sensors]')) {
  button.addEventListener('click', () => {
    const task = button.closest('.sim-task');
    const title = task.querySelector('h4').textContent;
    const inputNotes = task.querySelector('.sim-inputs').children;
    const file = 'sim-' + button.dataset.sensors + '-sensors';
    sensorTitle.textContent = title + ' — sensor views';
    sensorDescription.replaceChildren(...[...inputNotes].map(note => note.cloneNode(true)));
    sensorVideo.poster = file + '.webp?v=source-ratios';
    sensorVideo.src = file + '.mp4?v=source-ratios';
    sensors.showModal();
    updateViewportPlayback();
    if (autoplayAllowed()) {
      sensorVideo.muted = true;
      sensorVideo.play().catch(() => {});
    }
  });
}
sensors.addEventListener('close', () => {
  sensorVideo.pause();
  sensorVideo.removeAttribute('src');
  sensorVideo.load();
});
for (const dialog of [figures, sensors]) {
  dialog.addEventListener('close', updateViewportPlayback);
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
}

const copyStatus = document.querySelector('#copy-status');
document.querySelector('#copy-citation').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#bibtex').textContent);
    copyStatus.textContent = 'Copied';
  } catch {
    copyStatus.textContent = 'Select the BibTeX text to copy it.';
  }
});
