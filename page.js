const videos = [...document.querySelectorAll('video')];
const reel = document.querySelector('#hero-video');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reelVisible = false;

function updateReelPlayback() {
  if (reelVisible && !reducedMotion.matches && !navigator.connection?.saveData) {
    reel.play().catch(() => {});
  } else {
    reel.pause();
  }
}

new IntersectionObserver(([entry]) => {
  reelVisible = entry.intersectionRatio >= 0.2;
  updateReelPlayback();
}, { threshold: 0.2 }).observe(reel);
reducedMotion.addEventListener('change', updateReelPlayback);

let activeRollout;

function pauseOtherVideos(keep = []) {
  for (const video of videos) {
    if (!keep.includes(video) && !video.paused) video.pause();
  }
}

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
  const player = { element, views, pause };
  let request;
  let duration = 0;
  let scrubbing = false;

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
    if (activeRollout === player) activeRollout = undefined;
  }

  async function play(seconds) {
    activeRollout?.pause();
    pauseOtherVideos(views);
    activeRollout = player;
    const pending = new AbortController();
    request = pending;
    button.textContent = 'Cancel loading';
    error.hidden = true;

    try {
      for (const video of views) {
        video.preload = 'auto';
        if (video.readyState === 0 && video.networkState !== 2) video.load();
      }
      await Promise.all(views.map(video => waitForVideo(video, 1, pending.signal)));
      if (request !== pending) return;
      duration = Math.min(...views.map((video, i) => video.duration - offsets[i]));
      timeline.max = duration;
      timeline.disabled = false;
      seekTo(seconds >= duration - 0.05 ? 0 : seconds);
      await Promise.all(views.map(video => waitForVideo(video, 3, pending.signal)));
      if (request !== pending) return;
      await Promise.all(views.map(video => video.play()));
      if (request === pending) button.textContent = 'Pause all views';
    } catch {
      if (request !== pending) return;
      pause();
      error.textContent = 'Could not load all views. Try playing again.';
      error.hidden = false;
    }
  }

  const toggle = () => request ? pause() : play(Number(timeline.value));
  button.addEventListener('click', toggle);
  for (const video of views) {
    video.controls = false;
    video.muted = true;
    video.addEventListener('click', toggle);
    video.addEventListener('ended', () => {
      if (request && duration > 0) {
        pause();
        seekTo(duration);
      }
    });
  }
  controls.hidden = false;

  timeline.addEventListener('input', () => {
    scrubbing = true;
    showTime(Number(timeline.value));
  });
  timeline.addEventListener('change', () => {
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
      pause();
      seekTo(duration);
      return;
    }
    timeline.value = time;
    showTime(time);
    views.slice(1).forEach((video, i) => {
      const target = time + offsets[i + 1];
      if (!video.seeking && Math.abs(video.currentTime - target) > 0.2) video.currentTime = target;
    });
  });
}

for (const element of document.querySelectorAll('.rollout-player')) setUpRollout(element);

document.addEventListener('play', event => {
  const video = event.target;
  if (!(video instanceof HTMLVideoElement) || video === reel || video.paused) return;
  if (activeRollout?.views.includes(video)) return;
  activeRollout?.pause();
  pauseOtherVideos([video]);
}, true);

const rolloutButtons = document.querySelectorAll('[data-rollout-choice]');
for (const choice of rolloutButtons) {
  choice.addEventListener('click', () => {
    for (const button of rolloutButtons) {
      const selected = button === choice;
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      button.setAttribute('aria-pressed', String(selected));
      panel.hidden = !selected;
      if (panel.hidden) {
        if (activeRollout && panel.contains(activeRollout.element)) activeRollout.pause();
        for (const video of panel.querySelectorAll('video')) video.pause();
      }
    }
  });
}

for (const disclosure of document.querySelectorAll('details')) {
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.open) for (const video of disclosure.querySelectorAll('video')) video.pause();
  });
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
  });
}

const sensors = document.querySelector('#sensor-dialog');
const sensorVideo = sensors.querySelector('video');
const sensorTitle = sensors.querySelector('h3');
for (const button of document.querySelectorAll('[data-sensors]')) {
  button.addEventListener('click', () => {
    const file = 'sim-' + button.dataset.sensors + '-sensors';
    sensorTitle.textContent = button.dataset.task + ' — sensor views';
    sensorVideo.poster = file + '.webp';
    sensorVideo.src = file + '.mp4';
    activeRollout?.pause();
    pauseOtherVideos();
    sensors.showModal();
  });
}
sensors.addEventListener('close', () => {
  sensorVideo.pause();
  sensorVideo.removeAttribute('src');
  sensorVideo.load();
});
for (const dialog of [figures, sensors]) {
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
