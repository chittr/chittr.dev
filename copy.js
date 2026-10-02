for (const block of document.querySelectorAll('[data-copy]')) {
  const button = block.querySelector('.copy');
  const code = block.querySelector('code');
  if (!button || !code) continue;
  button.hidden = false;
  const status = block.querySelector('[role="status"]');
  let reset;
  button.addEventListener('click', async () => {
    clearTimeout(reset);
    try {
      await navigator.clipboard.writeText(code.textContent.trimEnd());
      button.textContent = 'Copied';
      button.classList.add('done');
      if (status) status.textContent = 'Example copied.';
    } catch {
      button.textContent = 'Select and copy';
      button.classList.remove('done');
      if (status) status.textContent = 'Clipboard unavailable. Select the example text and copy it.';
    }
    reset = setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('done'); }, 1600);
  });
}
