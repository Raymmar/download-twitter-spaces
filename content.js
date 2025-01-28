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
      playlistUrl: data.playlistUrl,
      spaceName: data.spaceName,
      tweetUrl: data.tweetUrl,
      ip: data.location.ip,
      city: data.location.city,
      region: data.location.region,
      country: data.location.country
    };
    console.log('Sending data to webhook:', payload);
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

// Function to extract Twitter Space URL
function getTwitterSpaceUrl() {
  // Attempt to find the URL in meta tags
  const metaUrl = document.querySelector('meta[property="og:url"]');
  if (metaUrl) {
    console.log("Captured Twitter Space URL from meta tag:", metaUrl.content);
    return metaUrl.content;
  }

  // Attempt to find the URL in other DOM elements
  const spaceLink = document.querySelector('a[href*="/i/spaces/"]');
  if (spaceLink) {
    console.log("Captured Twitter Space URL from link:", spaceLink.href);
    return spaceLink.href;
  }

  // Fallback to the current page URL
  console.log("Fallback to current page URL:", window.location.href);
  return window.location.href;
}

// Update media detection logic
const observer = new PerformanceObserver((list) => {
  list.getEntries().forEach((entry) => {
    const url = entry.name;
    const isVideo = url.match(/\.(mp4|mov|avi|mkv)(\?|$)/i);
    const isPlaylist = url.match(/\.(m3u8|mpd)(\?|$)/i);
    
    if (isVideo || isPlaylist) {
      // Determine exact media type
      const mediaType = isVideo ? 'mp4' : 
                       url.includes('.m3u8') ? 'm3u8' : 
                       url.includes('.mpd') ? 'mpd' : 'unknown';
      
      chrome.storage.local.set({
        mediaUrl: url,
        mediaType: mediaType,
        hasMedia: true,
        spaceName: document.title || `media_${Date.now().toString(36)}`
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
      chrome.storage.local.get(['playlistUrl', 'spaceName', 'tweetUrl'], (result) => {
        getUserIP(ip => {
          if (ip) {
            getUserLocation(ip, locationData => {
              const data = {
                playlistUrl: result.playlistUrl,
                spaceName: result.spaceName,
                tweetUrl: result.tweetUrl,
                location: locationData
              };
              sendToWebhook(data);
            });
          } else {
            console.error('Failed to get user IP');
          }
        });
      });
    }
  }
);