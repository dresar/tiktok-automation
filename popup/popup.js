/**
 * Popup Script for TikTok Studio Auto Uploader Pro
 */

document.addEventListener('DOMContentLoaded', () => {
  const btnOpenStudio = document.getElementById('btnOpenStudio');
  const btnOpenDashboard = document.getElementById('btnOpenDashboard');

  if (btnOpenStudio) {
    btnOpenStudio.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: "OPEN_TIKTOK_STUDIO" }, () => {
        window.close();
      });
    });
  }

  if (btnOpenDashboard) {
    btnOpenDashboard.addEventListener('click', () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
      }
      window.close();
    });
  }
});
