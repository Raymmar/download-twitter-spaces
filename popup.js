document.addEventListener('DOMContentLoaded', function () {
  const downloadButton = document.getElementById('downloadBtn');
  const progressBar = document.getElementById('progressBar');
  const statusElement = document.getElementById('status');

  // Function to reset the button state
  function resetButtonState() {
    downloadButton.disabled = true;
    downloadButton.textContent = 'Play recording to download';
    downloadButton.style.backgroundColor = '#4b4b4c'; // Dark grey for disabled state
    downloadButton.style.cursor = 'not-allowed';
    console.log('Button state reset');
  }

  // Function to activate the button
  function activateButton() {
    downloadButton.disabled = false;
    downloadButton.textContent = 'Download MP3';
    downloadButton.style.backgroundColor = '#9c64fb'; // Twitter Spaces purple
    downloadButton.style.cursor = 'pointer';
    console.log('Button activated');
  }

  // Function to show the progress bar and hide the button
  function showProgressBar() {
    progressBar.style.display = 'block';
    downloadButton.style.display = 'none';
  }

  // Function to hide the progress bar and show the button
  function hideProgressBar() {
    progressBar.style.display = 'none';
    downloadButton.style.display = 'block';
  }

  // Function to update the progress bar
  function updateProgressBar(percentage) {
    progressBar.value = percentage;
    progressBar.style.backgroundColor = percentage < 100 ? '#4b4b4c' : '#9c64fb'; // Dark grey for in-progress, purple for complete
  }

  // Function to check if the current tab's URL is from Twitter or X.com
  function checkUrl() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const currentTab = tabs[0];
      const url = currentTab.url;

      if (url.includes('twitter.com') || url.includes('x.com')) {
        // Check if an M3U8 URL has been identified
        chrome.storage.local.get('playlistUrl', function (data) {
          const playlistUrl = data.playlistUrl;
          console.log('Checking URL:', url, 'Playlist URL:', playlistUrl);

          if (playlistUrl) {
            // Enable the button if the URL is from Twitter or X.com and an M3U8 URL is identified
            activateButton();
          } else {
            // Disable the button if no M3U8 URL is identified
            resetButtonState();
          }
        });
      } else {
        // Disable the button if the URL is not from Twitter or X.com
        downloadButton.disabled = true;
        downloadButton.textContent = 'Not available on this URL';
        downloadButton.style.backgroundColor = '#4b4b4c'; // Dark grey for disabled state
        downloadButton.style.cursor = 'not-allowed';
        console.log('Button disabled for non-Twitter URL');
      }
    });
  }

  // Listen for tab updates to reset the state
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
      // Clear the stored M3U8 URL and reset the button state
      chrome.storage.local.remove('playlistUrl', function () {
        console.log('Cleared stored M3U8 URL due to URL change');
        resetButtonState();
      });
    }
  });

  // Listen for changes in local storage to update the button state
  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local' && changes.playlistUrl) {
      if (changes.playlistUrl.newValue) {
        console.log('Playlist URL changed, activating button');
        activateButton();
      } else {
        console.log('Playlist URL removed, resetting button');
        resetButtonState();
      }
    }
  });

  // Check the URL and M3U8 URL when the popup is loaded
  checkUrl();

  async function checkPermissions() {
    return new Promise((resolve) => {
      chrome.permissions.contains({
        permissions: ['downloads']
      }, (result) => {
        if (result) {
          console.log('Downloads permission is granted');
          resolve(true);
        } else {
          console.error('Downloads permission is not granted');
          updateStatus('Error: Downloads permission is not granted');
          resolve(false);
        }
      });
    });
  }

  // Add this function to update UI based on download state
  function updateUIState(isDownloading, progress) {
    if (isDownloading) {
      showProgressBar();
      updateProgressBar(progress);
      updateStatus(`Downloading: ${progress}%`);
      downloadButton.style.display = 'none';
    } else if (progress === 100) {
      hideProgressBar();
      updateStatus('Download complete!');
      // Don't show the button here
    } else {
      hideProgressBar();
      activateButton();
    }
  }

  // Add this function after the existing functions
  function resetUIState() {
    hideProgressBar();
    activateButton();
    updateStatus('');
  }

  // Modify the DOMContentLoaded event listener
  document.addEventListener('DOMContentLoaded', function () {
    // ... (rest of the code)

    // Add this to check the download state when popup opens
    chrome.storage.local.get(['isDownloading', 'downloadProgress'], function(data) {
      if (data.isDownloading) {
        updateUIState(data.isDownloading, data.downloadProgress || 0);
      } else {
        resetUIState();
      }
    });

    // ... (rest of the code)
  });

  // Update the chrome.runtime.onMessage listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateProgress') {
      updateProgressBar(message.progress);
      updateStatus(`Downloading: ${message.progress}%`);
    } else if (message.action === 'downloadError') {
      updateStatus(`Error: ${message.error}`);
      hideProgressBar();
      activateButton();
    } else if (message.action === 'downloadComplete') {
      updateUIState(false, 100);
      updateStatus('Download complete!');
    } else if (message.action === 'updateDownloadState') {
      updateUIState(message.isDownloading, message.progress);
    }
  });

  // Update the downloadButton click event listener
  downloadButton.addEventListener('click', async () => {
    showProgressBar();
    updateStatus('Starting download process...');
    downloadButton.style.display = 'none';

    if (!(await checkPermissions())) {
      hideProgressBar();
      return;
    }

    try {
      const data = await new Promise((resolve) => chrome.storage.local.get(['playlistUrl', 'spaceName'], resolve));
      let { playlistUrl, spaceName = 'twitter_space' } = data;

      if (!playlistUrl) {
        throw new Error('No M3U8 URL found in storage.');
      }

      // Ensure spaceName is a string and trim it
      spaceName = String(spaceName).trim();

      // If spaceName is empty after trimming, use a default name
      if (spaceName.length === 0) {
        spaceName = 'twitter_space';
      }

      chrome.runtime.sendMessage({ 
        action: 'startDownload', 
        playlistUrl: playlistUrl, 
        spaceName: spaceName 
      });
    } catch (error) {
      console.error('Process failed:', error);
      updateStatus(`Error: ${error.message}`);
      hideProgressBar();
    }
  });

  async function downloadAndMergeChunks(chunkUrls) {
    const allChunks = [];
    const totalChunks = chunkUrls.length;

    for (let i = 0; i < totalChunks; i++) {
      updateStatus(`Downloading chunk ${i + 1} of ${totalChunks}...`);
      try {
        const response = await fetchWithRetry(chunkUrls[i]);
        const arrayBuffer = await response.arrayBuffer();
        allChunks.push(arrayBuffer);
        updateProgressBar(Math.round(((i + 1) / totalChunks) * 100));
      } catch (error) {
        console.error(`Failed to download chunk ${i + 1}:`, error);
        // Continue with the next chunk
      }
    }

    if (allChunks.length === 0) {
      throw new Error('Failed to download any audio chunks.');
    }

    updateStatus('Merging audio chunks...');
    return new Blob(allChunks, { type: 'audio/mpeg' });
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

  async function initiateDownload(blob, filename) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      console.log('Initiating download with URL:', url);
      chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          updateStatus(`Error: ${chrome.runtime.lastError.message}`);
          URL.revokeObjectURL(url);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          console.log('Download initiated with ID:', downloadId);
          URL.revokeObjectURL(url);
          resolve(downloadId);
        }
      });
    });
  }

  function updateStatus(message) {
    if (statusElement) {
      statusElement.textContent = message;
    }
    console.log(message);
  }

  function sanitizeFilename(filename) {
    // Remove any non-alphanumeric characters except spaces, dashes, and underscores
    let sanitized = filename.replace(/[^a-z0-9\s-_]/gi, '')
      // Replace spaces with underscores
      .replace(/\s+/g, '_')
      // Remove any leading or trailing underscores or dashes
      .replace(/^[-_]+|[-_]+$/g, '')
      // Limit to 20 characters
      .slice(0, 20);
  
    // If the sanitized string is empty, use a default name
    if (sanitized.length === 0) {
      sanitized = 'twitter_space_audio';
    }
  
    // Append .mp3 extension
    return sanitized + '.mp3';
  }
});
