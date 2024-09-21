document.addEventListener('DOMContentLoaded', function () {
  const downloadButton = document.getElementById('downloadBtn');
  const progressBar = document.getElementById('progressBar');
  const statusElement = document.getElementById('status');
  const mainContent = document.getElementById('mainContent');
  const successScreen = document.getElementById('successScreen');
  const startOverBtn = document.getElementById('startOverBtn');

  function showSuccessScreen() {
    mainContent.classList.add('hidden');
    successScreen.classList.remove('hidden');
    startOverBtn.classList.remove('hidden'); // Show the start over button
  }

  function showMainContent() {
    mainContent.classList.remove('hidden');
    successScreen.classList.add('hidden');
    startOverBtn.classList.add('hidden'); // Hide the start over button
  }

  function resetState() {
    chrome.storage.local.clear(function() {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error('Error clearing storage:', error);
      } else {
        console.log('Storage cleared successfully');
        chrome.runtime.sendMessage({ action: 'resetState' });
        showMainContent(); // This will hide the start over button
        resetButtonState();
        hideProgressBar();
        updateStatus('');
        checkUrl(); // Re-check the URL to update button state
      
        // Prompt user before reloading the page
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {action: "confirmReload"}, function(response) {
            if (response && response.confirmed) {
              chrome.tabs.sendMessage(tabs[0].id, {action: "reloadPage"});
            }
          });
        });
      }
    });
  }

  startOverBtn.addEventListener('click', resetState);

  // Check the download state when popup opens
  chrome.storage.local.get(['isDownloading', 'downloadProgress', 'downloadComplete'], function(data) {
    if (data.downloadComplete) {
      showSuccessScreen();
    } else if (data.isDownloading) {
      updateUIState(true, data.downloadProgress || 0);
    } else {
      showMainContent();
    }
  });

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

  // Modify the updateUIState function
  function updateUIState(isDownloading, progress) {
    if (isDownloading || progress === 100) {
      showProgressBar();
      updateProgressBar(progress);
      downloadButton.style.display = 'none';
      startOverBtn.classList.add('hidden'); // Hide the start over button during download
      if (progress === 100) {
        updateStatus('Download complete! Preparing File...');
      } else {
        updateStatus(`Downloading: ${progress}%`);
      }
    } else {
      hideProgressBar();
      downloadButton.style.display = 'block';
      updateStatus('');
      // Don't show the start over button here
    }
  }

  // Add this function after the existing functions
  function resetUIState() {
    hideProgressBar();
    activateButton();
    updateStatus('');
  }

  // Update the chrome.runtime.onMessage listener
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Popup received message:', message);
    if (message.action === 'updateDownloadState') {
      updateUIState(message.isDownloading, message.progress);
    } else if (message.action === 'downloadComplete') {
      updateStatus('Download complete!');
      updateUIState(false, 100);
    } else if (message.action === 'downloadError') {
      console.error('Download error:', message.error);
      let errorMessage = 'An error occurred during download. ';
      if (message.error.includes('403')) {
        errorMessage += 'Access denied. The Twitter Space might be private or no longer available.';
      } else if (message.error.includes('404')) {
        errorMessage += 'The audio file was not found. The Twitter Space might have been deleted.';
      } else {
        errorMessage += message.error;
      }
      updateStatus(errorMessage);
      updateUIState(false, 0);
    }
  });

  // Modify the downloadButton click event listener
  downloadButton.addEventListener('click', async () => {
    console.log('Download button clicked');
    updateUIState(true, 0);

    if (!(await checkPermissions())) {
      console.log('Permissions check failed');
      updateUIState(false, 0);
      return;
    }

    try {
      const { playlistUrl, spaceName = 'twitter_space' } = await chrome.storage.local.get(['playlistUrl', 'spaceName']);
      console.log('Retrieved from storage:', { playlistUrl, spaceName });

      if (!playlistUrl) {
        throw new Error('No M3U8 URL found in storage.');
      }

      console.log('Sending startDownload message to background script');
      chrome.runtime.sendMessage({ 
        action: 'startDownload', 
        playlistUrl, 
        spaceName: String(spaceName).trim() || 'twitter_space'
      });
    } catch (error) {
      console.error('Process failed:', error);
      updateStatus(`Error: ${error.message}`);
      updateUIState(false, 0);
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
      const reader = new FileReader();
      reader.onload = function() {
        const dataUrl = reader.result;
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: true
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError);
            chrome.runtime.sendMessage({ action: 'downloadError', error: chrome.runtime.lastError.message });
            chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            console.log('Download initiated with ID:', downloadId);
            chrome.runtime.sendMessage({ action: 'downloadComplete' });
            chrome.storage.local.set({ isDownloading: false, downloadComplete: true });
            resolve(downloadId);
          }
        });
      };
      reader.onerror = function(error) {
        console.error('FileReader error:', error);
        chrome.runtime.sendMessage({ action: 'downloadError', error: 'Failed to process audio data' });
        chrome.storage.local.set({ isDownloading: false, downloadComplete: false });
        reject(error);
      };
      reader.readAsDataURL(blob);
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
