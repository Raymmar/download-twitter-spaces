chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
});

function onRequestCompleted(details) {
  // Log every network request to analyze the traffic
  console.log("Network request completed:", details.url);

  // Check if the request URL contains ".m3u8" (even with query parameters like ?type=replay)
  if (details.url.includes(".m3u8")) {
    console.log("Captured M3U8 URL:", details.url);

    // Store the captured M3U8 URL in chrome.storage.local
    chrome.storage.local.set({ playlistUrl: details.url }, () => {
      console.log("Successfully stored the captured M3U8 URL:", details.url);
      // Remove the listener after capturing the URL
      chrome.webRequest.onCompleted.removeListener(onRequestCompleted);
    });
  }
}

// Add the listener
chrome.webRequest.onCompleted.addListener(onRequestCompleted, {
  urls: ["*://*.pscp.tv/*", "*://*.twitter.com/*", "*://*.x.com/*", "*://*.video.pscp.tv/*"]
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startDownload') {
    startDownload(message.playlistUrl, message.spaceName);
  }
  if (message.action === 'resetState') {
    chrome.storage.local.clear(() => {
      console.log('Background: Storage cleared');
      // Reset any other background state variables if necessary
    });
  }
});

async function startDownload(playlistUrl, spaceName) {
  try {
    chrome.storage.local.set({ isDownloading: true, downloadProgress: 0 });
    chrome.runtime.sendMessage({ action: 'updateDownloadState', isDownloading: true, progress: 0 });

    const chunkUrls = await fetchAndParsePlaylist(playlistUrl);
    const audioBlob = await downloadAndMergeChunks(chunkUrls);
    const filename = sanitizeFilename(spaceName);
    await initiateDownload(audioBlob, filename);

    chrome.storage.local.set({ isDownloading: false, downloadProgress: 100 });
    chrome.runtime.sendMessage({ action: 'downloadComplete' });
  } catch (error) {
    console.error('Download failed:', error);
    chrome.runtime.sendMessage({ action: 'downloadError', error: error.message });
    chrome.storage.local.set({ isDownloading: false, downloadProgress: 0 });
  }
}

async function fetchAndParsePlaylist(playlistUrl) {
  const response = await fetch(playlistUrl);
  const playlistText = await response.text();
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
  const chunkPaths = playlistText.match(/chunk_[^\s]+\.aac/g);
  return chunkPaths.map(chunkPath => baseUrl + chunkPath);
}

async function downloadAndMergeChunks(chunkUrls) {
  const allChunks = [];
  const totalChunks = chunkUrls.length;
  const concurrentDownloads = 5; // Adjust based on testing

  for (let i = 0; i < totalChunks; i += concurrentDownloads) {
    const chunkPromises = chunkUrls.slice(i, i + concurrentDownloads).map(async (url, index) => {
      try {
        const response = await fetchWithRetry(url);
        const arrayBuffer = await response.arrayBuffer();
        return { index: i + index, arrayBuffer };
      } catch (error) {
        console.error(`Failed to download chunk ${i + index + 1}:`, error);
        return null;
      }
    });

    const results = await Promise.all(chunkPromises);
    results.forEach(result => {
      if (result) {
        allChunks[result.index] = result.arrayBuffer;
      }
    });

    const progress = Math.round(((i + concurrentDownloads) / totalChunks) * 100);
    chrome.storage.local.set({ downloadProgress: progress });
    chrome.runtime.sendMessage({ 
      action: 'updateDownloadState', 
      isDownloading: true,
      progress: Math.min(progress, 100)
    });
  }

  return new Blob(allChunks.filter(Boolean), { type: 'audio/mpeg' });
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
}

function sanitizeFilename(filename) {
  let sanitized = filename.replace(/[^a-z0-9\s-_]/gi, '')
    .replace(/\s+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 20);

  if (sanitized.length === 0) {
    sanitized = 'twitter_space_audio';
  }

  return sanitized + '.mp3';
}

async function initiateDownload(blob, filename) {
  const reader = new FileReader();
  reader.onload = function() {
    const dataUrl = reader.result;
    chrome.runtime.sendMessage({ action: 'updateDownloadState', isDownloading: true, progress: 100, status: 'Preparing download...' });
    chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download failed:', chrome.runtime.lastError);
        chrome.runtime.sendMessage({ action: 'downloadError', error: chrome.runtime.lastError.message });
        chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
      } else {
        console.log('Download initiated with ID:', downloadId);
        chrome.runtime.sendMessage({ action: 'downloadComplete' });
        chrome.storage.local.set({ isDownloading: false, downloadComplete: true });
      }
    });
  };
  reader.onerror = function(error) {
    console.error('FileReader error:', error);
    chrome.runtime.sendMessage({ action: 'downloadError', error: 'Failed to process audio data' });
    chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
  };
  reader.readAsDataURL(blob);
}