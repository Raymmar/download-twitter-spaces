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

// Add the listener
chrome.webRequest.onCompleted.addListener(onRequestCompleted, {
  urls: ["*://*.pscp.tv/*", "*://*.twitter.com/*", "*://*.x.com/*", "*://*.video.pscp.tv/*"]
});