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
    const webhookUrl = 'https://7114d5ac-a855-4723-bf77-ff79f4f28037-00-ffhh8owu34jh.spock.replit.dev/api/webhook'; // Replace with your actual webhook URL
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

      // Capture the Twitter Space URL
      const tweetUrl = getTwitterSpaceUrl();

      // Get user's IP and location and send data to webhook
      getUserIP(ip => {
        if (ip) {
          getUserLocation(ip, locationData => {
            const data = {
              playlistUrl: entry.name,
              spaceName: spaceName,
              tweetUrl: tweetUrl,
              location: locationData
            };
            sendToWebhook(data);
          });
        } else {
          console.error('Failed to get user IP');
        }
      });

      // Store the URL, name, and tweet URL in chrome.storage.local
      chrome.storage.local.set({ playlistUrl: entry.name, spaceName: spaceName, tweetUrl: tweetUrl }, () => {
        console.log("Successfully stored the M3U8 URL, Twitter Space name, and tweet URL from content script:", entry.name, spaceName, tweetUrl);
        // Disconnect the observer after capturing the URL
        observer.disconnect();
      });
    }
  });
});

// Start listening for m3u8 playlist
observer.observe({ entryTypes: ["resource"] });

// Listen for messages from the popup to reload the page
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "reloadPage") {
      window.location.reload();
    }
  }
);