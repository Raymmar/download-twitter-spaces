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
    document.getElementById('progressContainer').style.display = 'block';

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
            console.log("Audio blob created:", audioBlob);

            // Create a URL for the combined MP3 file
            const url = URL.createObjectURL(audioBlob);
            console.log("Blob URL created:", url);

            // Use the sanitized Twitter Space name as the filename
            let filename = `${sanitizeFilename(spaceName)}.mp3`;
            console.log("Sanitized filename:", filename);

            // Ensure the filename has an extension
            if (!filename.toLowerCase().endsWith('.mp3')) {
              filename += '.mp3';
            }
            console.log("Final filename:", filename);

            // Log the blob details
            console.log("Blob size:", audioBlob.size);
            console.log("Blob type:", audioBlob.type);

            // Trigger download of the MP3 file
            chrome.downloads.download({
              url: url,
              filename: filename,
              saveAs: true
            }, function(downloadId) {
              if (chrome.runtime.lastError) {
                console.error("Download failed:", chrome.runtime.lastError);
                alert("Failed to start download. Error: " + chrome.runtime.lastError.message + 
                      "\nFilename: " + filename + 
                      "\nBlob size: " + audioBlob.size + 
                      "\nBlob type: " + audioBlob.type);
              } else {
                console.log("Download started with ID:", downloadId);
                // Hide the progress bar and spinner
                document.getElementById('progressContainer').style.display = 'none';
                hideSpinner();
                // Close the extension popup immediately after triggering the download
                window.close();
              }
            });
          } else {
            alert("No audio chunks found in the playlist.");
            console.error("No audio chunk paths found.");
            hideSpinner();
            document.getElementById('progressContainer').style.display = 'none';
          }
        } catch (error) {
          console.error("Error in download process:", error);
          alert("Failed to process the audio. Error: " + error.message);
          hideSpinner();
          document.getElementById('progressContainer').style.display = 'none';
        }
      } else {
        alert("No M3U8 URL found in storage.");
        console.error("No M3U8 URL found in storage.");
        hideSpinner();
        document.getElementById('progressContainer').style.display = 'none';
      }
    });
  });
});

// Function to sanitize the filename by removing invalid characters and specific patterns
function sanitizeFilename(filename) {
  // Replace all non-alphanumeric characters with underscores
  let sanitized = filename.replace(/[^a-z0-9]/gi, '_');
  // Remove consecutive underscores
  sanitized = sanitized.replace(/_+/g, '_');
  // Trim underscores from start and end
  sanitized = sanitized.replace(/^_+|_+$/g, '');
  // Ensure the filename is not empty
  sanitized = sanitized || 'twitter_space';
  // Limit to 50 characters (adjust as needed)
  sanitized = sanitized.slice(0, 50);
  return sanitized;
}

// Function to download and merge audio chunks into a single MP3 blob
async function downloadAndMergeChunks(chunkUrls) {
  const batchSize = 10; // Number of chunks to fetch in each batch
  const audioBlobs = [];
  const totalChunks = chunkUrls.length;
  let processedChunks = 0;

  for (let i = 0; i < chunkUrls.length; i += batchSize) {
    const batchUrls = chunkUrls.slice(i, i + batchSize);
    console.log(`Fetching batch: ${i / batchSize + 1} of ${Math.ceil(chunkUrls.length / batchSize)}`);

    const batchBlobs = await Promise.all(batchUrls.map(async (url) => {
      console.log(`Fetching chunk: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch chunk: ${url}`);
      }
      processedChunks++;
      updateProgress(processedChunks, totalChunks);
      return response.blob();
    }));

    audioBlobs.push(...batchBlobs);
  }

  // Combine all audio blobs into a single blob
  const combinedBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
  return combinedBlob;
}

function updateProgress(processed, total) {
  const percentage = Math.round((processed / total) * 100);
  const progressText = `${percentage}% (${processed}/${total})`;
  document.getElementById('progressText').textContent = progressText;
  document.getElementById('progressBar').style.width = `${percentage}%`;
}
