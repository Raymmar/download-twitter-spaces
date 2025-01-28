// Function to clear the M3U8 URL from local storage
function clearStorage() {
  chrome.storage.local.remove(['playlistUrl', 'spaceName', 'tweetUrl'], () => {
    console.log("Cleared M3U8 URL, Twitter Space name, and tweet URL from local storage");
  });
}

// Clear storage on initial page load
clearStorage();

// Listen for page navigation events to clear storage
window.addEventListener('beforeunload', clearStorage);

// Function to get user's IP address
function getUserIP(callback) {
  fetch('https://api.ipify.org?format=json')
    .then(response => response.json())
    .then(data => {
      console.log('User IP address:', data.ip);
      callback(data.ip);
    })
    .catch(error => {
      console.error('Error fetching IP address:', error);
      callback(null);
    });
}

// Function to get user's location based on IP
function getUserLocation(ip, callback) {
  if (!ip) {
    console.error('No IP address provided');
    callback(null);
    return;
  }

  const url = `https://ipinfo.io/${ip}?token=2a4d794d82d919`; // Ensure this is your correct token
  console.log('Fetching location from:', url);
  
  fetch(url)
    .then(response => {
      console.log('IP info response status:', response.status);
      if (!response.ok) {
        throw new Error('Failed to fetch IP info');
      }
      return response.json();
    })
    .then(data => {
      console.log('User location data:', data);
      callback(data);
    })
    .catch(error => {
      console.error('Error fetching location:', error);
      callback(null);
    });
}

// Function to send data to a webhook
function sendToWebhook(data) {
  chrome.storage.local.get('userId', (result) => {
    const userId = result.userId || 'unknown';
    console.log('Retrieved userId:', userId);
    const webhookUrl = 'https://hook.us1.make.com/sppmhrz4fxeimjc8hytgwvuuuvcx589y'; // Replace with your actual webhook URL
    // const webhookUrl = 'https://7114d5ac-a855-4723-bf77-ff79f4f28037-00-ffhh8owu34jh.spock.replit.dev/api/webhook'; // Replace with your actual webhook URL
    const payload = {
      userId: userId,
      mediaUrl: data.mediaUrl,    // Changed from playlistUrl
      mediaType: data.mediaType,  // Add media type
      spaceName: data.spaceName,
      tweetUrl: data.tweetUrl,
      ip: data.location.ip,
      city: data.location.city,
      region: data.location.region,
      country: data.location.country
    };
    console.log('Sending data to webhook:', payload);
    console.log('Webhook payload data:', payload);
    fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      console.log('Webhook response status:', response.status);
      if (!response.ok) {
        throw new Error('Failed to send data to webhook');
      }
    })
    .catch(error => console.error('Error sending to webhook:', error));
  });
}

// Function to extract Twitter Space URL and associated tweet
function getTwitterSpaceUrl() {
  // 1. Check for canonical tweet URL in meta tags
  const canonicalUrl = document.querySelector('meta[property="og:url"]')?.content ||
                       document.querySelector('link[rel="canonical"]')?.href;
  
  if (canonicalUrl?.includes('/status/')) {
    console.log("Captured canonical tweet URL:", canonicalUrl);
    return canonicalUrl;
  }

  // 2. Look for tweet permalink in structured data
  const tweetPermalink = document.querySelector('a[href*="/status/"][role="link"][aria-label="View post"]')?.href ||
                         document.querySelector('a[href*="/status/"][aria-labelledby]')?.href;
  
  if (tweetPermalink) {
    console.log("Found tweet permalink:", tweetPermalink);
    return tweetPermalink;
  }

  // 3. Check for embedded space player metadata
  const spacePlayer = document.querySelector('div[data-testid="audioSpace"]');
  if (spacePlayer) {
    // Look for associated tweet in parent containers
    const containingTweet = spacePlayer.closest('article[data-testid="tweet"]');
    if (containingTweet) {
      const tweetLink = containingTweet.querySelector('a[href*="/status/"]')?.href;
      if (tweetLink) {
        console.log("Found space in tweet container:", tweetLink);
        return tweetLink;
      }
    }
  }

  // 4. Check for Twitter API-style identifiers
  const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
  for (const tag of scriptTags) {
    try {
      const json = JSON.parse(tag.textContent);
      if (json?.url?.includes('/status/')) {
        console.log("Found structured data URL:", json.url);
        return json.url;
      }
    } catch (e) {
      // Invalid JSON - skip
    }
  }

  // 5. Fallback to space-specific URL patterns
  const spaceUrl = window.location.href.match(/https?:\/\/(twitter\.com|x\.com)\/i\/spaces\/\w+/)?.[0];
  if (spaceUrl) {
    console.log("Using direct space URL:", spaceUrl);
    return spaceUrl;
  }

  // Final fallback to current page URL
  console.log("Fallback to current page URL:", window.location.href);
  return window.location.href;
}

// Add this utility function
function isValidTweetUrl(url) {
  return /https?:\/\/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url);
}

// Update media detection logic
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    const url = entry.name;
    const isVideo = url.match(/\.(mp4|mov|avi|mkv)(\?|$)/i);
    const isPlaylist = url.match(/\.(m3u8|mpd)(\?|$)/i);
    
    if (isVideo || isPlaylist) {
      // Get tweet URL before storing
      const tweetUrl = getTwitterSpaceUrl();
      
      // Determine exact media type
      const mediaType = isVideo ? 'mp4' : 
                       url.includes('.m3u8') ? 'm3u8' : 
                       url.includes('.mpd') ? 'mpd' : 'unknown';
      
      // Store both media info and tweet URL
      chrome.storage.local.set({
        mediaUrl: url,
        mediaType: mediaType,
        hasMedia: true,
        spaceName: document.title || `media_${Date.now().toString(36)}`,
        tweetUrl: isValidTweetUrl(tweetUrl) ? tweetUrl : 'invalid_url'
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage error:', chrome.runtime.lastError);
        }
      });
      
      // Add this after the storage.set in the observer
      chrome.storage.local.get('tweetUrl', (result) => {
        console.log('Stored tweet URL:', result.tweetUrl);
      });
      
      // Disconnect observer after finding supported media
      observer.disconnect();
    }
  });
});

// Start listening for m3u8 playlist
observer.observe({ entryTypes: ["resource"] });

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "reloadPage") {
      window.location.reload();
    }
    // Add new listener for download action
    if (request.action === "downloadMedia") {
      // Get the stored data and trigger webhook
      chrome.storage.local.get(
        ['mediaUrl', 'mediaType', 'spaceName', 'tweetUrl'],  // Ensure we're getting tweetUrl
        (result) => {
          getUserIP(ip => {
            if (ip) {
              getUserLocation(ip, locationData => {
                const data = {
                  mediaUrl: result.mediaUrl,    // Changed from playlistUrl
                  mediaType: result.mediaType,  // Add media type
                  spaceName: result.spaceName,
                  tweetUrl: result.tweetUrl,    // Should now be populated
                  location: locationData
                };
                console.log('Webhook payload data:', data);
                sendToWebhook(data);
              });
            } else {
              console.error('Failed to get user IP');
            }
          });
        }
      );
    }
  }
);