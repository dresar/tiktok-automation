// Background Service Worker (Manifest V3)
// TikTok Studio Auto Uploader Pro v3.7

async function checkAndTriggerOverdueSchedule() {
  try {
    const stored = await chrome.storage.local.get(['tt_delay_state', 'tt_batch_state']);
    const delayState = stored.tt_delay_state;

    if (delayState && delayState.isActive && delayState.targetTimestamp) {
      const now = Date.now();
      console.log(`[Background] Memeriksa jadwal: Target = ${new Date(delayState.targetTimestamp).toLocaleTimeString()}, Now = ${new Date(now).toLocaleTimeString()}`);

      if (now >= delayState.targetTimestamp) {
        console.log("[Background] ⏰ JADWAL LAMPAU TERDETEKSI (Chrome baru dibuka / waktu terlewat). Memulai upload otomatis sekarang!");
        
        if (chrome.notifications) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: "TikTok Studio Auto Uploader",
            message: "⏰ Jadwal upload tiba (Overdue Catch-up)! Membuka TikTok Studio & memproses video...",
            priority: 2
          });
        }

        const res = await navigateToTikTokStudio();
        await new Promise(r => setTimeout(r, 4500));

        const tabs = await chrome.tabs.query({});
        const targetTab = tabs.find(t => t.url && t.url.includes("tiktokstudio/upload"));
        if (targetTab) {
          chrome.tabs.sendMessage(targetTab.id, { type: "TRIGGER_BATCH_START" }).catch(() => {});
        }
      } else {
        chrome.alarms.create("START_SCHEDULED_UPLOAD", { when: delayState.targetTimestamp });
        console.log(`[Background] Alarm diperbarui untuk ${new Date(delayState.targetTimestamp).toLocaleTimeString()}`);
      }
    }
  } catch (err) {
    console.warn("[Background] Check overdue error:", err);
  }
}

// Saat browser Chrome pertama kali dibuka
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Background] Chrome browser startup detected.");
  await new Promise(r => setTimeout(r, 2000));
  await checkAndTriggerOverdueSchedule();
});

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['settings', 'queue']);
  
  if (!existing.settings) {
    const defaultSettings = {
      defaultVisibility: "Public",
      allowComment: true,
      allowDuet: true,
      allowStitch: true,
      autoCopyrightCheck: true,
      minDelaySeconds: 45,
      maxDelaySeconds: 90,
      typingSpeedMin: 25,
      typingSpeedMax: 60,
      captionMode: "filename_only",
      defaultCaption: "#fyp #viral #trending #indonesia",
      soundNotification: true,
      panelVisible: true
    };
    await chrome.storage.local.set({ settings: defaultSettings });
  }

  if (!existing.queue) {
    await chrome.storage.local.set({ queue: [] });
  }

  console.log("TikTok Studio Auto Uploader Pro v3.7 Background ready.");
  await checkAndTriggerOverdueSchedule();
});

// Update Extension Badge
async function updateBadge(statusText, bgColor = "#FE2C55") {
  try {
    await chrome.action.setBadgeText({ text: statusText });
    await chrome.action.setBadgeBackgroundColor({ color: bgColor });
  } catch (e) {}
}

// Navigation Helper
async function navigateToTikTokStudio() {
  const targetUrl = "https://www.tiktok.com/tiktokstudio/upload?from=creator_center&tab=video";
  const tabs = await chrome.tabs.query({});
  
  let tiktokTab = tabs.find(t => t.url && t.url.includes("tiktok.com"));

  if (tiktokTab) {
    if (!tiktokTab.url.includes("tiktokstudio/upload")) {
      await chrome.tabs.update(tiktokTab.id, { active: true, url: targetUrl });
    } else {
      await chrome.tabs.update(tiktokTab.id, { active: true });
    }
    if (tiktokTab.windowId) {
      await chrome.windows.update(tiktokTab.windowId, { focused: true });
    }
    return { success: true, tabId: tiktokTab.id, switched: true };
  } else {
    const newTab = await chrome.tabs.create({ url: targetUrl });
    return { success: true, tabId: newTab.id, created: true };
  }
}

// Alarm Listener for Scheduled Starts
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "START_SCHEDULED_UPLOAD") {
    console.log("[Background] Alarm START_SCHEDULED_UPLOAD fired!");

    if (chrome.notifications) {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon-128.png",
        title: "TikTok Studio Auto Uploader",
        message: "⏰ Waktu penjadwalan upload tiba! Memulai upload otomatis...",
        priority: 2
      });
    }

    const res = await navigateToTikTokStudio();
    await new Promise(r => setTimeout(r, 4500));

    const tabs = await chrome.tabs.query({});
    const targetTab = tabs.find(t => t.url && t.url.includes("tiktokstudio/upload"));
    if (targetTab) {
      chrome.tabs.sendMessage(targetTab.id, { type: "TRIGGER_BATCH_START" }).catch(() => {});
    }
  }
});

// Messages listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === "UPDATE_BADGE") {
        await updateBadge(message.text || "", message.color || "#FE2C55");
        sendResponse({ success: true });
      } else if (message.type === "OPEN_TIKTOK_STUDIO") {
        const res = await navigateToTikTokStudio();
        sendResponse(res);
      } else if (message.type === "OPEN_OPTIONS_PAGE") {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        } else {
          chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
        }
        sendResponse({ success: true });
      } else if (message.type === "SET_START_ALARM") {
        if (message.delayMinutes && message.delayMinutes > 0) {
          const targetTime = Date.now() + (message.delayMinutes * 60 * 1000);
          chrome.alarms.create("START_SCHEDULED_UPLOAD", { when: targetTime });
          console.log(`[Background] Alarm dijadwalkan dalam ${message.delayMinutes} menit (${new Date(targetTime).toLocaleTimeString()}).`);
        } else if (message.targetTimestamp) {
          chrome.alarms.create("START_SCHEDULED_UPLOAD", { when: message.targetTimestamp });
          console.log(`[Background] Alarm dijadwalkan pada timestamp ${new Date(message.targetTimestamp).toLocaleTimeString()}.`);
        }
        sendResponse({ success: true });
      } else if (message.type === "CLEAR_START_ALARM") {
        await chrome.alarms.clear("START_SCHEDULED_UPLOAD");
        console.log("[Background] Alarm START_SCHEDULED_UPLOAD dibatalkan.");
        sendResponse({ success: true });
      } else if (message.type === "CHECK_OVERDUE") {
        await checkAndTriggerOverdueSchedule();
        sendResponse({ success: true });
      } else if (message.type === "SEND_NOTIFICATION") {
        if (chrome.notifications) {
          chrome.notifications.create({
            type: "basic",
            iconUrl: "icons/icon-128.png",
            title: message.title || "TikTok Studio Auto Uploader",
            message: message.message || "Pemberitahuan",
            priority: 2
          });
        }
        sendResponse({ success: true });
      } else {
        sendResponse({ success: true });
      }
    } catch (err) {
      console.error("Background error:", err);
      sendResponse({ success: false, error: err.message });
    }
  })();
  return true;
});
