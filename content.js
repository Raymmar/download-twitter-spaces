// Function to clear the M3U8 URL from local storage
function clearStorage() {
  chrome.storage.local.remove(['mediaUrl', 'mediaType', 'spaceName', 'tweetUrl', 'hasMedia'], () => {
    console.log("Cleared media data from local storage");
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

// Function to send data to multiple webhooks
function sendToWebhook(data) {
  // Add validation to ensure we have all required data
  if (!data.mediaUrl || !data.mediaType) {
    console.error('Missing required data for webhook:', data);
    return;
  }

  chrome.storage.local.get('userId', (result) => {
    const userId = result.userId || 'unknown';
    console.log('Retrieved userId for webhook:', userId);
    
    // Define webhook URLs
    const webhookUrls = [
      'https://download-spaces.replit.app/api/webhook',
      'https://7114d5ac-a855-4723-bf77-ff79f4f28037-00-ffhh8owu34jh.spock.replit.dev/api/webhook',
      'https://hook.us1.make.com/c8i1bebcmmiakvgqdn8d5hgsyieug4jn'
    ];
    
    // Prepare payload with all required fields
    const payload = {
      userId: userId,
      mediaUrl: data.mediaUrl,
      mediaType: data.mediaType,
      spaceName: data.spaceName || document.title || 'Unknown Space',
      tweetUrl: data.tweetUrl || 'unknown_url',
      ip: data.location?.ip || 'unknown',
      city: data.location?.city || 'unknown',
      region: data.location?.region || 'unknown',
      country: data.location?.country || 'unknown'
    };
    
    console.log('Sending data to multiple webhooks:', payload);
    
    // Send to all webhook URLs
    webhookUrls.forEach(webhookUrl => {
      console.log(`Sending to webhook: ${webhookUrl}`);
      
      // Add timeout and retry logic for webhook
      const sendWithRetry = (retries = 2) => {
        fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        })
        .then(response => {
          console.log(`Webhook response from ${webhookUrl}: ${response.status}`);
          if (!response.ok) {
            throw new Error(`Failed to send data to webhook: ${response.status}`);
          }
          console.log(`Webhook successfully triggered: ${webhookUrl}`);
        })
        .catch(error => {
          console.error(`Error sending to webhook ${webhookUrl}:`, error);
          if (retries > 0) {
            console.log(`Retrying webhook ${webhookUrl} (${retries} attempts left)...`);
            setTimeout(() => sendWithRetry(retries - 1), 1000);
          }
        });
      };
      
      // Start the webhook request with retry capability
      sendWithRetry();
    });
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

// Improved media detection with network request monitoring
function setupMediaDetection() {
  console.log("Setting up media detection...");
  
  // Use PerformanceObserver to detect media resources
  const observer = new PerformanceObserver((list) => {
    list.getEntries().forEach((entry) => {
      const url = entry.name;
      
      // Check for media patterns
      const isVideo = url.match(/\.(mp4|mov|avi|mkv)(\?|$)/i);
      const isPlaylist = url.match(/\.(m3u8|mpd)(\?|$)/i);
      
      if (isVideo || isPlaylist) {
        // Get tweet URL before storing
        const tweetUrl = getTwitterSpaceUrl();
        
        // Determine exact media type
        const mediaType = isVideo ? 'mp4' : 
                         url.includes('.m3u8') ? 'm3u8' : 
                         url.includes('.mpd') ? 'mpd' : 'unknown';
        
        console.log(`Detected ${mediaType} media:`, url);
        
        // Store media info and notify popup
        chrome.storage.local.set({
          mediaUrl: url,
          mediaType: mediaType,
          hasMedia: true,
          spaceName: document.title || `media_${Date.now().toString(36)}`,
          tweetUrl: isValidTweetUrl(tweetUrl) ? tweetUrl : 'invalid_url'
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Storage error:', chrome.runtime.lastError);
          } else {
            // Notify popup that media is available
            chrome.runtime.sendMessage({
              action: 'mediaDetected',
              mediaUrl: url,
              mediaType: mediaType
            });
            console.log("Sent mediaDetected message to popup");
          }
        });
      }
    });
  });
  
  // Start observing network resources
  observer.observe({ entryTypes: ["resource"] });
  console.log("PerformanceObserver started");
  
  // Also monitor XHR requests for additional coverage
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    this.addEventListener('load', function() {
      const url = this.responseURL;
      if (url && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('.mpd'))) {
        console.log("XHR detected media URL:", url);
        
        // Determine media type
        const mediaType = url.includes('.m3u8') ? 'm3u8' : 
                         url.includes('.mp4') ? 'mp4' : 
                         url.includes('.mpd') ? 'mpd' : 'unknown';
        
        // Get tweet URL
        const tweetUrl = getTwitterSpaceUrl();
        
        // Store and notify
        chrome.storage.local.set({
          mediaUrl: url,
          mediaType: mediaType,
          hasMedia: true,
          spaceName: document.title || `media_${Date.now().toString(36)}`,
          tweetUrl: isValidTweetUrl(tweetUrl) ? tweetUrl : 'invalid_url'
        }, () => {
          chrome.runtime.sendMessage({
            action: 'mediaDetected',
            mediaUrl: url,
            mediaType: mediaType
          });
        });
      }
    });
    return originalXhrOpen.apply(this, arguments);
  };
}

// Initialize media detection
setupMediaDetection();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log("Content script received message:", request);
    
    if (request.action === "reloadPage") {
      window.location.reload();
    }
    
    // Check media status
    if (request.action === "checkMediaStatus") {
      chrome.storage.local.get(['mediaUrl', 'mediaType', 'hasMedia'], (result) => {
        console.log("Media status check result:", result);
        sendResponse({
          hasMedia: !!result.hasMedia,
          mediaUrl: result.mediaUrl,
          mediaType: result.mediaType
        });
      });
      return true; // Keep the message channel open for async response
    }
    
    // Add new listener for download action
    if (request.action === "downloadMedia") {
      console.log("Download media request received");
      
      // Get the stored data and trigger webhook
      chrome.storage.local.get(
        ['mediaUrl', 'mediaType', 'spaceName', 'tweetUrl'],
        (result) => {
          if (!result.mediaUrl) {
            console.error('No media URL found for webhook');
            return;
          }
          
          console.log("Retrieved media data for webhook:", result);
          
          getUserIP(ip => {
            if (ip) {
              getUserLocation(ip, locationData => {
                const data = {
                  mediaUrl: result.mediaUrl,
                  mediaType: result.mediaType,
                  spaceName: result.spaceName,
                  tweetUrl: result.tweetUrl,
                  location: locationData || { 
                    ip: ip, 
                    city: 'unknown', 
                    region: 'unknown', 
                    country: 'unknown' 
                  }
                };
                console.log('Prepared webhook payload data:', data);
                sendToWebhook(data);
              });
            } else {
              console.error('Failed to get user IP');
              // Still send webhook with limited data
              const data = {
                mediaUrl: result.mediaUrl,
                mediaType: result.mediaType,
                spaceName: result.spaceName,
                tweetUrl: result.tweetUrl,
                location: { 
                  ip: 'unknown', 
                  city: 'unknown', 
                  region: 'unknown', 
                  country: 'unknown' 
                }
              };
              console.log('Sending webhook with limited data (no IP)');
              sendToWebhook(data);
            }
          });
        }
      );
    }
  }
);