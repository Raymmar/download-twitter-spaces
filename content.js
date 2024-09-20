// Function to clear the M3U8 URL from local storage
function clearStorage() {
  chrome.storage.local.remove(['playlistUrl', 'spaceName'], () => {
    console.log("Cleared M3U8 URL and Twitter Space name from local storage");
  });
}

// Clear storage on initial page load
clearStorage();

// Listen for page navigation events to clear storage
window.addEventListener('beforeunload', clearStorage);

// Monitor for network requests within the page and capture M3U8 URLs
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    if (entry.name.includes(".m3u8")) {
      console.log("Captured M3U8 URL from content script:", entry.name);

      // Capture the name of the Twitter Space
      let spaceName = 'twitter-space';

      // Try to capture the Twitter Space name from meta tags
      const metaTitle = document.querySelector('meta[property="og:title"]');
      if (metaTitle) {
        spaceName = metaTitle.content;
        console.log("Captured Twitter Space name from meta tag:", spaceName);
      } else {
        // Fallback: Try to capture the Twitter Space name from the document title
        const titleElement = document.querySelector('title');
        if (titleElement) {
          spaceName = titleElement.textContent;
          console.log("Captured Twitter Space name from document title:", spaceName);
        } else {
          console.log("Failed to capture Twitter Space name, using default:", spaceName);
        }
      }

      // Store the URL and name in chrome.storage.local
      chrome.storage.local.set({ playlistUrl: entry.name, spaceName: spaceName }, () => {
        console.log("Successfully stored the M3U8 URL and Twitter Space name from content script:", entry.name, spaceName);
        // Disconnect the observer after capturing the URL
        observer.disconnect();
      });
    }
  });
});

// Start observing performance entries
observer.observe({ entryTypes: ["resource"] });

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "reloadPage") {
      window.location.reload();
    }
  }
);