const variants = [...document.querySelectorAll('[data-view]')];
const controls = [...document.querySelectorAll('[data-choose]')];
for (const control of controls) {
  control.addEventListener('click', () => {
    const current = control.dataset.choose;
    for (const panel of variants) {
      panel.hidden = panel.dataset.view !== current;
      if (panel.hidden) panel.querySelector('video')?.pause();
    }
    for (const option of controls) option.setAttribute('aria-pressed', String(option === control));
  });
}
document.addEventListener('play', event => {
  if (event.target instanceof HTMLVideoElement) {
    for (const other of document.querySelectorAll('video')) {
      if (other !== event.target && !other.paused) other.pause();
    }
  }
}, true);

const dialog = document.querySelector('#figure-dialog');
const enlarged = dialog.querySelector('img');
for (const anchor of document.querySelectorAll('[data-figure]')) {
  anchor.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || !dialog.showModal) return;
    event.preventDefault();
    enlarged.src = anchor.href;
    enlarged.alt = anchor.querySelector('img').alt;
    dialog.showModal();
  });
}
dialog.querySelector('button').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
const copyStatus = document.querySelector('#copy-status');
document.querySelector('#copy-citation').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#bibtex').textContent);
    copyStatus.textContent = 'Copied';
  } catch {
    copyStatus.textContent = 'Select the BibTeX text to copy it.';
  }
});
