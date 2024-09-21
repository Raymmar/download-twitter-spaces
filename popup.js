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
    startOverBtn.classList.remove('hidden');
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
        showMainContent();
        resetButtonState();
        hideProgressBar();
        updateStatus('');
        checkUrl();
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.reload(tabs[0].id);
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
      updateUIState(true, data.downloadProgress || 0, 'Preparing download...');
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
    downloadButton.textContent = 'Download Media';
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

  // Function to update the status message
  function updateStatus(message) {
    statusElement.textContent = message;
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
        resetButtonState();
        updateStatus('Not available on this URL');
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

  // Modify the updateUIState function
  function updateUIState(isDownloading, progress, status) {
    if (isDownloading) {
      showProgressBar();
      updateProgressBar(progress);
      downloadButton.style.display = 'none';
      startOverBtn.classList.add('hidden');
      updateStatus(status || `Downloading: ${progress}%`);
    } else if (status === 'Preparing file...') {
      showProgressBar();
      updateProgressBar(0);
      downloadButton.style.display = 'none';
      startOverBtn.classList.add('hidden');
      updateStatus(status);
    } else if (progress === 100) {
      showSuccessScreen();
      updateProgressBar(progress);
      updateStatus('Your download is complete');
      chrome.storage.local.set({ downloadComplete: true });
    } else {
      hideProgressBar();
      downloadButton.style.display = 'block';
      updateStatus(status || '');
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
      updateUIState(message.isDownloading, message.progress, message.status);
    } else if (message.action === 'preparingDownload') {
      updateUIState(false, 100, 'Preparing file...');
      showSuccessScreen();
      chrome.storage.local.set({ downloadComplete: true, downloadStatus: 'Preparing file...' });
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
      updateUIState(false, 0, errorMessage);
    }
  });

  // Add this function to check the download status when the popup opens
  function checkDownloadStatus() {
    chrome.storage.local.get(['downloadComplete', 'downloadStatus'], function(data) {
      if (data.downloadComplete) {
        updateUIState(false, 100, data.downloadStatus === 'Preparing file...' ? 'Your download is complete' : data.downloadStatus);
        showSuccessScreen();
      }
    });
  }

  // Call this function when the popup opens
  checkDownloadStatus();

  // Modify the downloadButton click event listener
  downloadButton.addEventListener('click', async () => {
    console.log('Download button clicked');
    updateUIState(true, 0, 'Preparing download...');

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
  
  // Function to check permissions
  async function checkPermissions() {
    const status = await chrome.permissions.contains({
      permissions: ['downloads']
    });
    return status;
  }

  // Check URL when popup opens
  checkUrl();

  // Listen for tab updates
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
      checkUrl();
    }
  });
});
