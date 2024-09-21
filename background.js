chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
});

/**
 * Handles completed network requests and captures M3U8 URLs.
 * @param {Object} details - Details of the completed request.
 */
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

// Add the listener for specific URLs
chrome.webRequest.onCompleted.addListener(onRequestCompleted, {
  urls: [
    "*://*.pscp.tv/*",
    "*://*.twitter.com/*",
    "*://*.x.com/*",
    "*://*.video.pscp.tv/*"
  ]
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

/**
 * Initiates the download process.
 * @param {string} playlistUrl - The URL of the M3U8 playlist.
 * @param {string} spaceName - The name of the Twitter Space.
 */
async function startDownload(playlistUrl, spaceName) {
  try {
    chrome.storage.local.set({ isDownloading: true, downloadProgress: 0 });
    chrome.runtime.sendMessage({ action: 'updateDownloadState', isDownloading: true, progress: 0 });

    const chunkUrls = await fetchAndParsePlaylist(playlistUrl);
    const mediaBlob = await downloadAndMergeChunks(chunkUrls);
    const filename = sanitizeFilename(spaceName);
    await initiateDownload(mediaBlob, filename);

    chrome.storage.local.set({ isDownloading: false, downloadProgress: 100 });
    chrome.runtime.sendMessage({ action: 'downloadComplete' });
  } catch (error) {
    console.error('Download failed:', error);
    chrome.runtime.sendMessage({ action: 'downloadError', error: error.message });
    chrome.storage.local.set({ isDownloading: false, downloadProgress: 0 });
  }
}

/**
 * Fetches and parses the M3U8 playlist to extract chunk URLs.
 * Handles both audio (.aac) and video (.ts, .mp4) chunks.
 * @param {string} playlistUrl - The URL of the M3U8 playlist.
 * @returns {Promise<string[]>} - An array of chunk URLs.
 */
async function fetchAndParsePlaylist(playlistUrl) {
  const response = await fetch(playlistUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
  }

  const playlistText = await response.text();
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

  // Log the playlist content for debugging
  console.log("Fetched playlist content:", playlistText);

  // Extract all media segment URIs (lines that do not start with '#')
  const segmentLines = playlistText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  // Match audio and video chunks based on their file extensions
  const audioChunks = segmentLines.filter(line => line.endsWith('.aac'));
  const videoChunks = segmentLines.filter(line => line.endsWith('.ts') || line.endsWith('.mp4'));

  // Combine audio and video chunks
  const chunkPaths = [...audioChunks, ...videoChunks];

  if (chunkPaths.length === 0) {
    console.error("Playlist does not contain any recognizable audio or video chunks.");
    throw new Error('No audio or video chunks found in the playlist.');
  }

  // Construct full URLs for the chunks
  return chunkPaths.map(chunkPath => {
    if (/^https?:\/\//i.test(chunkPath)) {
      return chunkPath;
    }
    return baseUrl + chunkPath;
  });
}

/**
 * Downloads and merges audio/video chunks.
 * @param {string[]} chunkUrls - Array of chunk URLs to download.
 * @returns {Promise<Blob>} - The merged Blob of all chunks.
 */
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

  // Determine the MIME type based on the presence of video chunks
  const hasVideo = chunkUrls.some(url => url.endsWith('.ts') || url.endsWith('.mp4'));
  const mimeType = hasVideo ? 'video/mp4' : 'audio/mpeg';

  return new Blob(allChunks.filter(Boolean), { type: mimeType });
}

/**
 * Fetches a URL with retry logic.
 * @param {string} url - The URL to fetch.
 * @param {number} retries - Number of retry attempts.
 * @returns {Promise<Response>} - The fetch response.
 */
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

/**
 * Sanitizes the filename to ensure it's valid.
 * @param {string} filename - The original filename.
 * @returns {string} - The sanitized filename.
 */
function sanitizeFilename(filename) {
  let sanitized = filename.replace(/[^a-z0-9\s-_]/gi, '')
    .replace(/\s+/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 20);

  if (sanitized.length === 0) {
    sanitized = 'twitter_space_media';
  }

  // Determine the correct file extension based on content
  const extension = sanitized.endsWith('.mp4') ? '.mp4' : '.mp3';

  return sanitized + extension;
}

/**
 * Initiates the download of the merged Blob.
 * @param {Blob} blob - The Blob to download.
 * @param {string} filename - The name of the file to save.
 */
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
    chrome.runtime.sendMessage({ action: 'downloadError', error: 'Failed to process media data' });
    chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
  };
  reader.readAsDataURL(blob);
}