const videos = [...document.querySelectorAll('video')];
const reel = document.querySelector('#hero-video');
const reelToggle = document.querySelector('.reel-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let reelEnabled = !reducedMotion.matches && !navigator.connection?.saveData;

function playReel() {
  reel.play().catch(() => {});
}

reelToggle.hidden = false;
reelToggle.addEventListener('click', () => {
  reelEnabled = reel.paused;
  if (reelEnabled) playReel();
  else reel.pause();
});
for (const event of ['play', 'pause']) {
  reel.addEventListener(event, () => {
    reelToggle.textContent = reel.paused ? 'Play reel' : 'Pause reel';
  });
}
new IntersectionObserver(([entry]) => {
  if (entry.intersectionRatio >= 0.2 && reelEnabled) playReel();
  else reel.pause();
}, { threshold: 0.2 }).observe(reel);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    reelEnabled = false;
    reel.pause();
  }
});

document.addEventListener('play', event => {
  if (!(event.target instanceof HTMLVideoElement) || event.target === reel) return;
  for (const other of videos) {
    if (other !== event.target && !other.paused) other.pause();
  }
}, true);

const groupButtons = [...document.querySelectorAll('[data-group]')];
const simulationCards = [...document.querySelectorAll('[data-task-group]')];
for (const button of groupButtons) {
  button.addEventListener('click', () => {
    const group = button.dataset.group;
    for (const card of simulationCards) {
      card.hidden = group !== 'all' && card.dataset.taskGroup !== group;
      if (card.hidden) card.querySelector('video').pause();
    }
    for (const option of groupButtons) option.setAttribute('aria-pressed', String(option === button));
  });
}

const contactButtons = [...document.querySelectorAll('[data-contact-choice]')];
const contactPanels = [...document.querySelectorAll('[data-contact-task]')];
for (const button of contactButtons) {
  button.addEventListener('click', () => {
    for (const panel of contactPanels) {
      panel.hidden = panel.dataset.contactTask !== button.dataset.contactChoice;
      if (panel.hidden) panel.querySelector('video').pause();
    }
    for (const option of contactButtons) option.setAttribute('aria-pressed', String(option === button));
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
