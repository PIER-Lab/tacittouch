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

document.addEventListener('play', event => {
  if (!(event.target instanceof HTMLVideoElement) || event.target === reel) return;
  for (const other of videos) {
    if (other !== event.target && !other.paused) other.pause();
  }
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
    for (const video of videos) if (!video.paused) video.pause();
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
