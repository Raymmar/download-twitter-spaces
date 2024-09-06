chrome.webRequest.onCompleted.addListener(
    (details) => {
      // Log every network request to analyze the traffic
      console.log("Network request completed:", details.url);
  
      // Check if the request URL contains ".m3u8" (even with query parameters like ?type=replay)
      if (details.url.includes(".m3u8")) {
        console.log("Captured M3U8 URL:", details.url);
  
        // Store the captured M3U8 URL in chrome.storage.local
        chrome.storage.local.set({ playlistUrl: details.url }, () => {
          console.log("Successfully stored the captured M3U8 URL:", details.url);
        });
      }
    },
    { urls: ["*://*.pscp.tv/*", "*://*.twitter.com/*", "*://*.x.com/*", "*://*.video.pscp.tv/*"] } // Match URLs from relevant domains
  );