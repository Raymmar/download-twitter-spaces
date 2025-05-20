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
    chrome.storage.local.get('mediaType', ({ mediaType }) => {
      const buttonLabels = {
        m3u8: 'Download Space Recording',
        mp4: 'Download Video',
        mpd: 'Download Stream',
        default: 'Download Media'
      };
      
      downloadButton.disabled = false;
      downloadButton.textContent = buttonLabels[mediaType] || buttonLabels.default;
      downloadButton.style.backgroundColor = '#9c64fb';
      downloadButton.style.cursor = 'pointer';
    });
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
      const validDomains = ['twitter.com', 'x.com', 'pscp.tv'];

      if (validDomains.some(domain => url.includes(domain))) {
        chrome.storage.local.get(['mediaUrl', 'hasMedia'], function (data) {
          if (data.hasMedia) {
            activateButton();
          } else {
            resetButtonState();
            updateStatus('Play media to enable download');
          }
        });
      } else {
        resetButtonState();
        updateStatus('Not available on this website');
      }
    });
  }

  // Listen for tab updates to reset the state
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
      // Clear the stored M3U8 URL and reset the button state
      chrome.storage.local.remove(
        ['mediaUrl', 'playlistUrl', 'hasMedia'], 
        function() {
          console.log('Cleared media URLs due to URL change');
          resetButtonState();
        }
      );
    }
  });

  // Listen for changes in local storage to update the button state
  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName === 'local') {
      if (changes.mediaType || changes.hasMedia) {
        checkUrl(); // Re-check when media status changes
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
      updateProgressBar(100);
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

    // Send message to content script to trigger webhook
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: "downloadMedia"});
    });

    if (!(await checkPermissions())) {
      console.log('Permissions check failed');
      updateUIState(false, 0);
      return;
    }

    try {
      const { mediaUrl, mediaType, spaceName = 'twitter_media' } = 
        await chrome.storage.local.get(['mediaUrl', 'mediaType', 'spaceName']);

      console.log('Retrieved from storage:', { mediaUrl, mediaType, spaceName });

      if (!mediaUrl) {
        throw new Error('No media URL found in storage.');
      }

      console.log('Sending startDownload message with mediaType:', mediaType);
      chrome.runtime.sendMessage({ 
        action: 'startDownload', 
        mediaUrl,
        mediaType,
        mediaName: String(spaceName).trim() || 'twitter_media'
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

  // Function to send data to a webhook
  function sendToWebhook(data) {
    const webhookUrl = 'https://hook.us1.make.com/9281mbmz387evtgbo4b1b6lh56uqjefa'; 
    console.log('Sending data to webhook:', data);
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => console.log('Webhook response status:', response.status))
    .catch(error => console.error('Error sending to webhook:', error));
  }

  // Check URL when popup opens
  checkUrl();

  // Listen for tab updates
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (changeInfo.url) {
      checkUrl();
    }
  });

  // Update button text based on media type
  function updateButtonState(mediaType) {
    const buttonText = {
      m3u8: 'Download Space Recording',
      mp4: 'Download Video',
      mpd: 'Download Stream',
      default: 'Download Media'
    };
    
    downloadButton.textContent = buttonText[mediaType] || buttonText.default;
  }

  // Modify storage listener
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.mediaType) {
      updateButtonState(changes.mediaType.newValue);
    }
  });
});
