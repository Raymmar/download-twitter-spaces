document.addEventListener('DOMContentLoaded', function () {
  const downloadButton = document.getElementById('downloadBtn');
  const spinner = document.getElementById('spinner');

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

  // Function to show the spinner and hide the button
  function showSpinner() {
    spinner.style.display = 'block';
    downloadButton.style.display = 'none';
  }

  // Function to hide the spinner and show the button
  function hideSpinner() {
    spinner.style.display = 'none';
    downloadButton.style.display = 'block';
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

  downloadButton.addEventListener('click', async () => {
    // Show the spinner and hide the button
    showSpinner();

    // Retrieve the stored playlist URL and Twitter Space name from chrome.storage.local
    chrome.storage.local.get(['playlistUrl', 'spaceName'], async (data) => {
      const playlistUrl = data.playlistUrl;
      let spaceName = data.spaceName || 'twitter-space';

      if (playlistUrl) {
        console.log(`Found playlist URL: ${playlistUrl}`);
        console.log(`Found Twitter Space name: ${spaceName}`);

        // Sanitize the Twitter Space name to create a valid filename
        spaceName = sanitizeFilename(spaceName);
        console.log(`Sanitized Twitter Space name: ${spaceName}`);

        try {
          // Fetch the M3U8 playlist file
          console.log(`Attempting to fetch the playlist from URL: ${playlistUrl}`);
          const response = await fetch(playlistUrl);
          if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.statusText}`);
          }
          const playlistText = await response.text();
          console.log("Fetched playlist content:", playlistText);

          // Extract the base URL from the playlist URL
          const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf('/') + 1);
          console.log(`Base URL: ${baseUrl}`);

          // Extract the relative chunk paths from the M3U8 playlist
          const chunkPaths = playlistText.match(/chunk_[^\s]+\.aac/g);
          console.log(`Extracted chunk paths: ${chunkPaths}`);

          if (chunkPaths && chunkPaths.length > 0) {
            console.log("Found audio chunk paths:", chunkPaths);

            // Prepend the base URL to each chunk path
            const chunkUrls = chunkPaths.map(chunkPath => {
              const fullUrl = baseUrl + chunkPath;
              console.log(`Full chunk URL: ${fullUrl}`);
              return fullUrl;
            });
            console.log("Full chunk URLs:", chunkUrls);

            // Fetch and merge audio chunks into a single MP3 blob
            const audioBlob = await downloadAndMergeChunks(chunkUrls);

            // Create a URL for the combined MP3 file
            const url = URL.createObjectURL(audioBlob);

            // Use the sanitized Twitter Space name as the filename
            const filename = `${spaceName}.mp3`;

            // Trigger download of the MP3 file with the Twitter Space name as the filename
            chrome.downloads.download({
              url: url,
              filename: filename,
              saveAs: true
            }, function(downloadId) {
              // Close the extension popup immediately after triggering the download
              window.close();
            });
          } else {
            alert("No audio chunks found in the playlist.");
            console.error("No audio chunk paths found.");
          }
        } catch (error) {
          alert("Failed to fetch or process the M3U8 playlist.");
          console.error("Error fetching or processing playlist:", error);
        }
      } else {
        alert("No M3U8 URL found in storage.");
        console.error("No M3U8 URL found in storage.");
      }
    });
  });
});

// Function to sanitize the filename by removing invalid characters and specific patterns
function sanitizeFilename(filename) {
  // Remove invalid characters
  let sanitized = filename.replace(/[\\/:*?"<>|]/g, '');
  // Remove 'https' and trailing 'X'
  sanitized = sanitized.replace(/https/g, '').replace(/ X$/, '');
  // Trim any extra spaces
  return sanitized.trim();
}

// Function to download and merge audio chunks into a single MP3 blob
async function downloadAndMergeChunks(chunkUrls) {
  const batchSize = 10; // Number of chunks to fetch in each batch
  const audioBlobs = [];

  for (let i = 0; i < chunkUrls.length; i += batchSize) {
    const batchUrls = chunkUrls.slice(i, i + batchSize);
    console.log(`Fetching batch: ${batchUrls}`);

    const batchBlobs = await Promise.all(batchUrls.map(async (url) => {
      console.log(`Fetching chunk: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch chunk: ${url}`);
      }
      return response.blob();
    }));

    audioBlobs.push(...batchBlobs);
  }

  // Combine all audio blobs into a single blob
  const combinedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
  return combinedBlob;
}
