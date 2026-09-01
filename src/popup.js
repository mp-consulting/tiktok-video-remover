const STUDIO = 'https://www.tiktok.com/tiktokstudio/content';

document.getElementById('studio').addEventListener('click', async () => {
  await chrome.tabs.create({ url: STUDIO });
  window.close();
});

document.getElementById('toggle').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/www\.tiktok\.com\//.test(tab.url || '')) {
    document.getElementById('toggle').textContent = 'Not a tiktok.com tab';
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ttr:toggle' });
    window.close();
  } catch (_) {
    document.getElementById('toggle').textContent = 'Reload the page, then retry';
  }
});
