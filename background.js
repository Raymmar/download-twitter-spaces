// Function to generate a UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Set up the extension on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ 
    isDownloading: false, 
    downloadComplete: false,
    hasMedia: false,
    mediaUrl: null,
    mediaType: null
  });
  
  chrome.storage.local.get('userId', (result) => {
    if (!result.userId || result.userId === 'unknown') {
      const newUserId = generateUUID();
      // Store in both storage and cookie
      chrome.storage.local.set({ userId: newUserId }, () => {
        console.log('Generated and stored new userId:', newUserId);
        chrome.cookies.set({
          url: 'https://raymmar.com', // Your actual domain
          name: 'userId',
          value: newUserId,
          expirationDate: (new Date().getTime()/1000) + (10*365*24*60*60), // 10 years
          domain: '.raymmar.com',
          path: '/',
          secure: true,
          sameSite: 'no_restriction'
        }, (cookie) => {
          if (chrome.runtime.lastError) {
            console.error('Cookie set error:', chrome.runtime.lastError);
          } else {
            console.log('Persistent cookie set:', cookie);
          }
        });
      });
    } else {
      console.log('Existing valid user ID:', result.userId);
    }
  });
});

/**
 * Handles completed network requests and captures media URLs.
 * @param {Object} details - Details of the completed request.
 */
function onRequestCompleted(details) {
  const mediaPatterns = {
    m3u8: /\.m3u8/,
    mp4: /\.mp4(\?|$)/,
    ts: /\.ts(\?|$)/,
    m4s: /\.m4s(\?|$)/,
    mpd: /\.mpd(\?|$)/ // For DASH manifests
  };

  // Check for any media pattern match
  const detectedType = Object.entries(mediaPatterns).find(([_, regex]) => 
    details.url.match(regex)
  )?.[0];

  if (detectedType) {
    console.log(`Background: Detected ${detectedType.toUpperCase()} URL:`, details.url);
    
    chrome.storage.local.set({ 
      mediaUrl: details.url,
      mediaType: detectedType,
      hasMedia: true
    }, () => {
      // Notify any open popups about the detected media
      chrome.runtime.sendMessage({
        action: 'mediaDetected',
        mediaUrl: details.url,
        mediaType: detectedType
      });
    });
  }
}

// Add the listener for specific URLs
chrome.webRequest.onCompleted.addListener(onRequestCompleted, {
  urls: [
    "*://*.pscp.tv/*",
    "*://*.twitter.com/*",
    "*://*.x.com/*",
    "*://*.video.pscp.tv/*",
    "*://*.twimg.com/*" // Add Twitter's image/media domain
  ]
}, ["responseHeaders"]);

// Update the tab listener to only reset on relevant domains
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const validDomains = ['twitter.com', 'x.com', 'pscp.tv'];
  
  if (changeInfo.status === 'complete' && tab.url && validDomains.some(d => tab.url.includes(d))) {
    // Preserve userId when resetting state
    chrome.storage.local.get('userId', (result) => {
      const userId = result.userId;
      
      chrome.storage.local.clear(() => {
        console.log('Resetting state for domain:', tab.url);
        chrome.storage.local.set({ 
          isDownloading: false,
          downloadComplete: false,
          mediaUrl: null,
          mediaType: null,
          hasMedia: false,
          userId: userId // Restore userId
        });
      });
    });
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message);
  
  if (message.action === 'resetState') {
    chrome.storage.local.get('userId', (result) => {
      const userId = result.userId;
      
      chrome.storage.local.clear(() => {
        console.log('Background: Storage cleared except userId');
        chrome.storage.local.set({ 
          userId: userId,
          isDownloading: false,
          downloadComplete: false,
          mediaUrl: null,
          mediaType: null,
          hasMedia: false
        });
      });
    });
  }
  
  if (message.action === 'startDownload') {
    startDownload(message.mediaUrl, message.mediaType, message.mediaName);
  }
  
  // Forward media detection to any open popups
  if (message.action === 'mediaDetected') {
    chrome.runtime.sendMessage(message);
  }
  
  // Check media status request from popup
  if (message.action === 'checkMediaStatus') {
    chrome.storage.local.get(['mediaUrl', 'mediaType', 'hasMedia'], (result) => {
      sendResponse({
        hasMedia: !!result.hasMedia,
        mediaUrl: result.mediaUrl,
        mediaType: result.mediaType
      });
    });
    return true; // Keep the message channel open for async response
  }

  if (message.action === 'triggerWebhook') {
    // Forward the webhook trigger to the active tab's content script
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "downloadMedia",
          mediaUrl: message.mediaUrl,
          mediaType: message.mediaType,
          mediaName: message.mediaName
        });
        console.log("Forwarded webhook trigger to content script");
      } else {
        console.error("No active tab found to trigger webhook");
      }
    });
  }
});

/**
 * Processes the audio data to ensure proper format and compatibility.
 * @param {Blob} audioBlob - The original audio blob.
 * @returns {Promise<Blob>} - The processed audio blob.
 */
async function processAudioData(audioBlob) {
  try {
    // Convert blob to ArrayBuffer for processing
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new AudioContext();
    
    // Decode the audio data
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Create a new audio buffer with the same sample rate and channels
    const newAudioBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    // Copy the audio data
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      newAudioBuffer.copyToChannel(channelData, channel);
    }
    
    // Convert back to blob
    const processedBlob = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const processedBlob = new Blob([reader.result], { type: 'audio/mpeg' });
        resolve(processedBlob);
      };
      reader.readAsArrayBuffer(newAudioBuffer);
    });
    
    return processedBlob;
  } catch (error) {
    console.error('Error processing audio data:', error);
    // If processing fails, return the original blob
    return audioBlob;
  }
}

/**
 * Initiates the download process.
 * @param {string} mediaUrl - The URL of the media.
 * @param {string} mediaType - The type of the media.
 * @param {string} mediaName - The name of the media.
 */
async function startDownload(mediaUrl, mediaType, mediaName) {
  try {
    chrome.storage.local.set({ isDownloading: true, downloadProgress: 0 });
    
    console.log(`Starting ${mediaType} download from:`, mediaUrl);
    
    // Fire webhook exactly once at the start of download
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        // Send single webhook trigger
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "downloadMedia",
          mediaUrl: mediaUrl,
          mediaType: mediaType
        }, () => console.log("Webhook trigger sent once for download initiation"));
      }
    });
    
    // Process the download based on media type
    if (mediaType === 'm3u8') {
      const { urls, totalDuration } = await fetchAndParsePlaylist(mediaUrl);
      const mediaBlob = await downloadAndMergeChunks(urls);
      
      // Process the audio data for better compatibility
      const processedBlob = await processAudioData(mediaBlob);
      await initiateDownload(processedBlob, sanitizeFilename(mediaName, mediaType));
    } else if (mediaType === 'mp4') {
      await fetchAndDownloadDirect(mediaUrl, mediaName);
    } else if (mediaType === 'mpd') {
      await processDashManifest(mediaUrl, mediaName);
    }
    
  } catch (error) {
    handleDownloadError(error);
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
      filename = sanitizeFilename(`twitter_${mediaType}_${Date.now()}`, mediaType);
    }

    // Ensure proper file extension based on content type
    const extension = blob.type.includes('audio/mpeg') ? '.mp3' : '.mp4';
    if (!filename.toLowerCase().endsWith(extension)) {
      filename = filename.replace(/\.[^/.]+$/, '') + extension;
    }

    // Create a new Blob with proper metadata
    const metadata = {
      title: filename.replace(extension, ''),
      artist: 'Twitter Space',
      album: 'Twitter Spaces',
      year: new Date().getFullYear().toString()
    };

    // For MP3 files, we'll use a more compatible format
    if (extension === '.mp3') {
      // Convert to a more compatible format if needed
      const reader = new FileReader();
      reader.onload = function() {
        const dataUrl = reader.result;
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
            chrome.runtime.sendMessage({ action: 'preparingDownload' });
          }
        });
      };
      reader.onerror = function(error) {
        console.error('FileReader error:', error);
        chrome.runtime.sendMessage({ action: 'downloadError', error: 'Failed to process audio data' });
      };
      reader.readAsDataURL(blob);
    } else {
      // For MP4 files, download directly
      const url = URL.createObjectURL(blob);
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true,
        conflictAction: 'uniquify'
      }, function(downloadId) {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError.message);
          chrome.runtime.sendMessage({ action: 'downloadError', error: chrome.runtime.lastError.message });
        } else {
          console.log(`Download started with ID: ${downloadId}`);
          chrome.runtime.sendMessage({ action: 'preparingDownload' });
        }
        // Clean up the object URL
        URL.revokeObjectURL(url);
      });
    }
  } catch (error) {
    console.error('InitiateDownload Error:', error);
    chrome.runtime.sendMessage({ action: 'downloadError', error: error.message });
  }
}

/**
 * Handles download errors and updates UI accordingly.
 * @param {Error} error - The error that occurred.
 */
function handleDownloadError(error) {
  console.error('Download error:', error);
  chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
  chrome.runtime.sendMessage({ 
    action: 'downloadError', 
    error: error.message || 'Unknown download error'
  });
}

/**
 * Sanitizes the filename to ensure it's valid.
 * @param {string} filename - The original filename.
 * @param {string} mediaType - The type of the media.
 * @returns {string} - The sanitized filename.
 */
function sanitizeFilename(filename, mediaType) {
  // Handle undefined/null cases and non-string inputs
  let baseName = typeof filename === 'string' ? filename : 'twitter_media';
  
  // More conservative sanitization
  baseName = baseName
    .replace(/[^a-z0-9\s-_@()]/gi, '') // Allow common special characters
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 75); // Increased limit for longer names

  if (!baseName) {
    baseName = `twitter_${mediaType}_${new Date().toISOString().slice(0,10)}`;
  }

  // Determine extension based on mediaType
  const extensions = {
    m3u8: '.mp3', // HLS streams typically contain video
    mp4: '.mp4',
    mpd: '.mp4', // DASH manifests
    default: '.mp4'
  };

  const extension = extensions[mediaType] || extensions.default;
  
  return `${baseName}${extension}`;
}

/**
 * Downloads and merges audio/video chunks with improved reliability.
 * @param {string[]} chunkUrls - Array of chunk URLs to download.
 * @returns {Promise<Blob>} - The merged Blob of all chunks.
 */
async function downloadAndMergeChunks(chunkUrls) {
  const allChunks = [];
  const totalChunks = chunkUrls.length;
  const concurrentDownloads = 5; // Adjust based on testing
  let lastValidChunkIndex = -1;
  let lastValidChunkSize = 0;

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
        
        // Validate chunk data
        if (arrayBuffer.byteLength > 0) {
          // Check if this chunk is significantly different from the last valid chunk
          if (lastValidChunkSize > 0) {
            const sizeDiff = Math.abs(arrayBuffer.byteLength - lastValidChunkSize);
            const sizeDiffPercentage = (sizeDiff / lastValidChunkSize) * 100;
            
            // If the size difference is more than 50%, this might be an invalid chunk
            if (sizeDiffPercentage > 50) {
              console.warn(`Suspicious chunk size difference detected at index ${i + index}`);
              return null;
            }
          }
          
          lastValidChunkIndex = i + index;
          lastValidChunkSize = arrayBuffer.byteLength;
          return { index: i + index, arrayBuffer };
        } else {
          console.warn(`Empty chunk received at index ${i + index}`);
          return null;
        }
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

  // Filter out any null or undefined chunks and trim after last valid chunk
  const filteredChunks = allChunks
    .slice(0, lastValidChunkIndex + 1)
    .filter(chunk => chunk !== undefined && chunk !== null);

  if (filteredChunks.length === 0) {
    throw new Error('No valid chunks were successfully downloaded.');
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
 * Fetches and parses the M3U8 playlist to extract chunk URLs and durations.
 * Handles both master and variant playlists.
 * @param {string} playlistUrl - The URL of the M3U8 playlist.
 * @returns {Promise<{urls: string[], totalDuration: number}>} - An array of chunk URLs and total duration.
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
    // It's a variant playlist; proceed to extract media chunks and durations
    const lines = playlistText.split('\n').map(line => line.trim());
    const chunkUrls = [];
    let totalDuration = 0;
    let currentDuration = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Extract duration from #EXTINF tag
      if (line.startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          currentDuration = parseFloat(durationMatch[1]);
          totalDuration += currentDuration;
        }
      }
      // Extract segment URL
      else if (line && !line.startsWith('#')) {
        try {
          const chunkUrl = new URL(line, playlistUrl).toString();
          chunkUrls.push(chunkUrl);
        } catch (error) {
          console.error(`Failed to resolve chunk URL: ${line}`, error);
        }
      }
      // Check for end of playlist
      else if (line === '#EXT-X-ENDLIST') {
        console.log('End of playlist marker found');
        break;
      }
    }

    if (chunkUrls.length === 0) {
      throw new Error('No audio or video chunks found in the playlist.');
    }

    console.log(`Extracted ${chunkUrls.length} chunks with total duration: ${totalDuration} seconds`);
    return { urls: chunkUrls, totalDuration };
  }
}

// New direct download handler
async function fetchAndDownloadDirect(url, filename) {
  const response = await fetchWithRetry(url);
  const blob = await response.blob();
  await initiateDownload(blob, sanitizeFilename(filename, 'mp4'));
}