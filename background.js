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
    console.log("Chunk URLs:", chunkUrls);
    const mediaBlob = await downloadAndMergeChunks(chunkUrls);
    if (mediaBlob.size === 0) {
      throw new Error('The merged Blob is empty.');
    }
    console.log(`Media Blob created. Size: ${mediaBlob.size} bytes, Type: ${mediaBlob.type}`);
    const hasVideo = chunkUrls.some(url => url.endsWith('.ts') || url.endsWith('.mp4') || url.endsWith('.m4s'));
    const filename = sanitizeFilename(spaceName, hasVideo);
    if (!filename || filename.trim() === '') {
      throw new Error('Sanitized filename is invalid.');
    }
    console.log("Sanitized Filename:", filename);
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
 * Initiates the download by creating a data URL from the Blob
 * and using chrome.downloads.download to save the file.
 * @param {Blob} blob - The media Blob to download.
 * @param {string} filename - The desired filename for the download.
 */
function initiateDownload(blob, filename) {
  try {
    if (!(blob instanceof Blob)) {
      throw new Error('Provided data is not a Blob.');
    }

    if (!filename || typeof filename !== 'string') {
      throw new Error('Invalid filename provided.');
    }

    const reader = new FileReader();
    reader.onload = function() {
      const dataUrl = reader.result;
      console.log("Initiating download with dataUrl:", dataUrl);
      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: true,
        conflictAction: 'uniquify'
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError.message);
          chrome.runtime.sendMessage({ action: 'downloadError', error: chrome.runtime.lastError.message });
        } else {
          console.log(`Download started with ID: ${downloadId}`);
          chrome.runtime.sendMessage({ action: 'downloadComplete' });
        }
      });
    };
    reader.onerror = function(error) {
      console.error('FileReader error:', error);
      chrome.runtime.sendMessage({ action: 'downloadError', error: 'Failed to process audio data' });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error('InitiateDownload Error:', error);
    chrome.runtime.sendMessage({ action: 'downloadError', error: error.message });
  }
}

/**
 * Sanitizes the filename to ensure it's valid.
 * @param {string} filename - The original filename.
 * @param {boolean} hasVideo - Whether the media contains video.
 * @returns {string} - The sanitized filename.
 */
function sanitizeFilename(filename, hasVideo) {
  let sanitized = filename.replace(/[^a-z0-9\s-_@]/gi, '') // Allow @ for usernames
    .replace(/\s+/g, '_')
    .replace(/^[-_@]+|[-_@]+$/g, '')
    .slice(0, 50); // Increased length for longer names

  if (sanitized.length === 0) {
    sanitized = 'twitter_space_media';
  }

  // Determine the correct file extension based on content type
  const extension = hasVideo ? '.mp4' : '.mp3';

  return sanitized + extension;
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

  console.log(`Starting download of ${totalChunks} chunks.`);

  for (let i = 0; i < totalChunks; i += concurrentDownloads) {
    const chunkPromises = chunkUrls.slice(i, i + concurrentDownloads).map(async (url, index) => {
      try {
        console.log(`Downloading chunk ${i + index + 1}: ${url}`);
        const response = await fetchWithRetry(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
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
      progress: Math.min(progress, 100),
      status: `Downloading chunk ${i + 1} to ${Math.min(i + concurrentDownloads, totalChunks)} of ${totalChunks}`
    });
    console.log(`Download progress: ${progress}%`);
  }

  // Filter out any null or undefined chunks
  const filteredChunks = allChunks.filter(chunk => chunk !== undefined && chunk !== null);

  if (filteredChunks.length === 0) {
    throw new Error('No chunks were successfully downloaded.');
  }

  // Determine the MIME type based on the presence of video chunks
  const hasVideo = chunkUrls.some(url => url.endsWith('.ts') || url.endsWith('.mp4') || url.endsWith('.m4s'));
  const mimeType = hasVideo ? 'video/mp4' : 'audio/mpeg';
  
  console.log(`Creating Blob with MIME type: ${mimeType}`);
  return new Blob(filteredChunks, { type: mimeType });
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
 * Fetches and parses the M3U8 playlist to extract chunk URLs.
 * Handles both master and variant playlists.
 * @param {string} playlistUrl - The URL of the M3U8 playlist.
 * @returns {Promise<string[]>} - An array of chunk URLs.
 */
async function fetchAndParsePlaylist(playlistUrl) {
  const response = await fetch(playlistUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.status} ${response.statusText}`);
  }

  const playlistText = await response.text();
  console.log("Fetched playlist content:\n", playlistText);
  const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);

  // Check if it's a master playlist by looking for #EXT-X-STREAM-INF
  if (playlistText.includes("#EXT-X-STREAM-INF")) {
    console.log("Detected master playlist. Selecting variant playlist.");
    // Parse variant playlists
    const variantPlaylists = [];
    const lines = playlistText.split('\n').map(line => line.trim());
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("#EXT-X-STREAM-INF")) {
        const variantUrl = lines[i + 1];
        if (variantUrl) {
          // Properly resolve the variant URL
          try {
            const resolvedVariantUrl = new URL(variantUrl, playlistUrl).toString();
            variantPlaylists.push(resolvedVariantUrl);
            console.log("Resolved Variant URL:", resolvedVariantUrl);
          } catch (error) {
            console.error(`Error resolving variant URL (${variantUrl}):`, error);
          }
        }
      }
    }

    if (variantPlaylists.length === 0) {
      console.error("No variant playlists found in master playlist.");
      throw new Error('No variant playlists found in the master playlist.');
    }

    // Select the variant with the highest bandwidth
    let selectedVariantUrl = variantPlaylists[0];
    let highestBandwidth = 0;

    for (const variant of variantPlaylists) {
      try {
        const variantResponse = await fetch(variant, { method: 'HEAD' });
        const bandwidth = parseInt(variantResponse.headers.get('Content-Bandwidth') || '0', 10);
        if (bandwidth > highestBandwidth) {
          highestBandwidth = bandwidth;
          selectedVariantUrl = variant;
        }
      } catch (error) {
        console.error(`Error fetching variant ${variant}:`, error);
      }
    }

    console.log("Selected variant playlist URL:", selectedVariantUrl);
    return await fetchAndParsePlaylist(selectedVariantUrl);
  } else {
    // It's a variant playlist; proceed to extract media chunks
    // Extract all media segment URIs (lines that do not start with '#')
    const segmentLines = playlistText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    // Define possible extensions
    const audioExtensions = ['.aac', '.m4a'];
    const videoExtensions = ['.ts', '.mp4', '.m4s'];

    // Extract full URLs
    const chunkUrls = segmentLines.map(chunkPath => {
      try {
        return new URL(chunkPath, playlistUrl).toString();
      } catch (error) {
        console.error(`Failed to resolve chunk URL: ${chunkPath}`, error);
        return null;
      }
    }).filter(url => url !== null);

    if (chunkUrls.length === 0) {
      console.error("Playlist does not contain any recognizable audio or video chunks.");
      throw new Error('No audio or video chunks found in the playlist.');
    }

    console.log("Extracted chunk URLs:", chunkUrls);
    return chunkUrls;
  }
}