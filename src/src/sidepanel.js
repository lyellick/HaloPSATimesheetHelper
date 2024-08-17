'use strict';

import './sidepanel.css';


document.addEventListener("DOMContentLoaded", async function () {
  /**
   * AppSettings
   */
  const appSettings = await fetch('appsettings.json')
    .then(response => response.json())
    .then(data => { return data })
    .catch(error => console.log(error));

  /**
   * Functions
   */
  async function readLocalStorage(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([key], function (result) {
        if (result[key] === undefined) {
          reject(`Key "${key}" not found in local storage`);
        } else {
          resolve(result[key]);
        }
      });
    });
  };

  async function writeLocalStorage(key, value) {
    return new Promise((resolve, reject) => {
      const data = {};
      data[key] = value;

      chrome.storage.local.set(data, function () {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };

  async function clearLocalStorage(key) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([key], function () {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  };

  async function fetchAuthToken() {
    var key = await readLocalStorage('key').then((key) => {
      return key;
    }).catch(async (error) => {
      await writeLocalStorage('key', '');
    });


    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: appSettings.haloPSAClientId,
      client_secret: key,
      scope: "all"
    });

    try {
      const response = await fetch("https://psa.bluenetinc.com/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: body.toString()
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const tokenData = await response.json();
      return tokenData.access_token;
    } catch (error) {
      console.error("Error fetching token:", error);
      return null;  // Return null or handle the error as appropriate
    }
  }


  function getMeetingDuration(startDateTime, endDateTime) {
    // Parse the start and end date-time strings into Date objects
    const start = new Date(startDateTime);
    const end = new Date(endDateTime);

    // Calculate the difference in milliseconds
    const durationMs = end - start;

    // Convert milliseconds to hours and minutes
    const totalMinutes = Math.floor(durationMs / 60000); // Convert to minutes
    const hours = Math.floor(totalMinutes / 60); // Hours
    const minutes = totalMinutes % 60; // Remaining minutes

    // Format duration in {hours}.{minutes}
    return `${hours}.${minutes.toString().padStart(2, '0')}`;
  }

  function convertUTCToCentralTime(utcDateString) {

    // Create a Date object from the UTC datetime string
    const utcDate = new Date(`${utcDateString}Z`);

    // Create an Intl.DateTimeFormat object to format the date and time in CST
    const options = {
      timeZone: 'America/Chicago', // CST/CDT timezone
      hour12: true, // 12-hour format
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short'
    };

    const formatter = new Intl.DateTimeFormat('en-US', options);
    const formattedDate = formatter.format(utcDate);
    return formattedDate;
  }

  function sortEventsByStartTime(events) {
    return events.sort((a, b) => {
      const startA = new Date(a.start.dateTime);
      const startB = new Date(b.start.dateTime);
      return startA - startB; // Sort in ascending order (earliest first)
    });
  }

  async function getTodaysEvents(accessToken) {
    // Get today's date and format it in ISO 8601 format
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    // Define the Microsoft Graph API endpoint for the calendar view
    const url = `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${encodeURIComponent(startOfDay)}&endDateTime=${encodeURIComponent(endOfDay)}`;

    try {
      // Make the fetch request
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      // Check if the response is OK
      if (response.ok) {
        const data = await response.json();
        return data.value; // Return the events
      } else {
        // Handle errors
        const errorData = await response.json();
        console.error('Error fetching events:', errorData);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  }

  async function getHaloPSAAuthToken() {
    return await fetchAuthToken().then(token => {
      if (token) {
        return token;
      }
    });
  }

  /**
   * Entra
   */
  chrome.tabs.create({ url: `https://login.microsoftonline.com/${appSettings.azureTenantId}/oauth2/v2.0/authorize?client_id=${appSettings.azureClientId}&response_type=token&redirect_uri=${encodeURIComponent(chrome.runtime.getURL('auth.html'))}&scope=https://graph.microsoft.com/Calendars.Read` });

  /**
   * Listeners
   */
  document.getElementById('halopsa-secret').value = await readLocalStorage('key').then((key) => {
    return key;
  }).catch(async (error) => {
    await writeLocalStorage('key', '');
  });

  document.getElementById('halopsa-secret').addEventListener('change', async function () {
    var value = document.getElementById('halopsa-secret').value;
    await writeLocalStorage('key', value);
  });

  chrome.runtime.onMessage.addListener(async function (request, sender, sendResponse) {
    if (request.action === 'receiveToken') {
      var events = await getTodaysEvents(request.token);
      var sortedEvents = sortEventsByStartTime(events);
      document.getElementById('meetings').innerHTML = "";
      sortedEvents.forEach((event) => {
        const startDateTime = convertUTCToCentralTime(event.start.dateTime);
        const endDateTime = convertUTCToCentralTime(event.end.dateTime);
        const duration = getMeetingDuration(event.start.dateTime, event.end.dateTime);
        document.getElementById('meetings').innerHTML += `
    <div class="small">
      <div class="d-flex align-items-center justify-content-between">
        <div>${event.subject}</div>
        <div>${duration}</div>
      </div>
      <div class="d-flex align-items-center justify-content-between small text-muted">
        <div>${startDateTime.split(",")[1]}</div>
        <div class="d-flex align-items-center justify-content-center">
          <i class="bi bi-arrow-right-short"></i>
        </div>
        <div>${endDateTime.split(",")[1]}</div>
      </div>
    </div>`
      });
    }
  });
});
