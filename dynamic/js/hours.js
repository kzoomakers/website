/**
 * Dynamic Hours of Operation Generator
 * Loads hours data from JSON and generates HTML for different contexts
 * Jon Kelley wuz here 2025!!
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    jsonPath: 'dynamic/json/hours.json',
    contactCardId: 'hours-contact-card',
    homepageSectionId: 'hours-homepage-section',
    footerSectionId: 'hours-footer-section'
  };

  let hoursData = null;

  /**
   * Check if today is a closed day
   */
  function isClosedToday(schedule) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = days[new Date().getDay()];
    return schedule.closedDays.includes(today);
  }

  /**
   * Generate hours display for contact page card
   */
  function generateContactCardHours(data) {
    const schedule = data.schedule;
    const closedMessage = schedule.closedMessage || 'Closed';
    const closedMessageToday = schedule.closedMessageToday || closedMessage;
    const isClosed = isClosedToday(schedule);
    
    if (isClosed) {
      return `
        <p style="color: #dc3545; margin-bottom: 10px; font-weight: bold; font-size: 1.1em;">We are Closed</p>
        <p style="color: #dc3545; margin: 0; font-size: 0.95em;">${closedMessageToday}</p>
        <p style="color: #666; margin-top: 15px; font-size: 0.9em;"><strong>Regular Hours:</strong></p>
        <p style="color: #666; margin: 0; font-size: 0.9em;">${schedule.openDaysShort.join(', ')}</p>
        <p style="color: #666; margin: 0; font-size: 0.9em;">${schedule.openTime} - ${schedule.closeTime}</p>
      `;
    }
    
    return `
      <p style="color: #666; margin-bottom: 10px;"><strong>${data.display.title}:</strong></p>
      <p style="color: #666; margin: 0;">${schedule.openDaysShort.join(', ')}</p>
      <p style="color: #666; margin: 0;">${schedule.openTime} - ${schedule.closeTime}</p>
      <p style="color: #dc3545; margin-top: 10px; font-size: 0.9em;"><strong>${schedule.closedDaysShort.join(', ')}: ${closedMessage}</strong></p>
    `;
  }

  /**
   * Generate hours display for homepage section
   */
  function generateHomepageSection(data) {
    const schedule = data.schedule;
    const closedMessage = schedule.closedMessage || 'Closed';
    const closedMessageToday = schedule.closedMessageToday || closedMessage;
    const isClosed = isClosedToday(schedule);
    
    if (isClosed) {
      return `
        <div class="card shadow-sm" style="border: none; border-radius: 10px; border: 2px solid #dc3545;">
          <div class="card-body text-center p-5">
            <div class="mb-4">
              <i class="tf-ion-ios-close-outline" style="font-size: 60px; color: #dc3545;"></i>
            </div>
            <h3 class="mb-3" style="color: #dc3545; font-weight: bold;">We are Closed</h3>
            <p style="color: #dc3545; font-size: 1.1em; margin-bottom: 30px;">${closedMessageToday}</p>
            <div class="hours-list" style="font-size: 1em; line-height: 1.8; padding-top: 20px; border-top: 2px solid #dc3545;">
              <p style="margin: 0; color: #666; font-size: 0.95em;"><strong>Regular Hours:</strong></p>
              <p style="margin: 5px 0; color: #555;">${schedule.openDays.join(', ')}</p>
              <p style="margin: 5px 0; color: #f9b234; font-size: 1.1em; font-weight: 600;">${schedule.openTime} - ${schedule.closeTimeDisplay}</p>
            </div>
            <div class="mt-4 pt-3" style="border-top: 1px solid #eee;">
              <p style="color: #666; margin: 0;">
                <i class="tf-ion-ios-location" style="color: #f9b234;"></i>
                ${data.contact.address}
              </p>
            </div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="card shadow-sm" style="border: none; border-radius: 10px;">
        <div class="card-body text-center p-5">
          <div class="mb-4">
            <i class="tf-ion-ios-clock-outline" style="font-size: 60px; color: #f9b234;"></i>
          </div>
          <h3 class="mb-4" style="color: #333;">${data.display.subtitle}</h3>
          <div class="hours-list" style="font-size: 1.1em; line-height: 2;">
            <p style="margin: 0; color: #555;"><strong>${schedule.openDays.join(', ')}</strong></p>
            <p style="margin: 10px 0 20px 0; color: #f9b234; font-size: 1.3em; font-weight: 600;">${schedule.openTime} - ${schedule.closeTimeDisplay}</p>
            <p style="margin: 0; color: #dc3545; font-size: 0.95em; font-weight: 600;">${schedule.closedDays.join(', ')}: ${closedMessage}</p>
          </div>
          <div class="mt-4 pt-3" style="border-top: 1px solid #eee;">
            <p style="color: #666; margin: 0;">
              <i class="tf-ion-ios-location" style="color: #f9b234;"></i>
              ${data.contact.address}
            </p>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Generate hours display for footer
   */
  function generateFooterHours(data) {
    const schedule = data.schedule;
    const closedMessage = schedule.closedMessage || 'Closed';
    return `
      <ul>
        <li>
          <h3>${data.display.title}</h3>
        </li>
        <li><a href="contact.html">${schedule.openDaysShort.join(', ')}</a></li>
        <li><a href="contact.html">${schedule.openTime} - ${schedule.closeTime}</a></li>
        <li><a href="contact.html" style="color: #dc3545;">${schedule.closedDaysShort.join(', ')}: ${closedMessage}</a></li>
      </ul>
    `;
  }

  /**
   * Load hours data from JSON
   */
  function loadHoursData() {
    return fetch(CONFIG.jsonPath)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        hoursData = data;
        return data;
      })
      .catch(error => {
        console.error('Error loading hours data:', error);
        throw error;
      });
  }

  /**
   * Render hours in contact card
   */
  function renderContactCard(data) {
    const element = document.getElementById(CONFIG.contactCardId);
    if (element) {
      element.innerHTML = generateContactCardHours(data);
    }
  }

  /**
   * Render hours in homepage section
   */
  function renderHomepageSection(data) {
    const element = document.getElementById(CONFIG.homepageSectionId);
    if (element) {
      element.innerHTML = generateHomepageSection(data);
    }
  }

  /**
   * Render hours in footer
   */
  function renderFooterSection(data) {
    const element = document.getElementById(CONFIG.footerSectionId);
    if (element) {
      element.innerHTML = generateFooterHours(data);
    }
  }

  /**
   * Initialize hours display on all applicable elements
   */
  function initializeHours() {
    loadHoursData()
      .then(data => {
        renderContactCard(data);
        renderHomepageSection(data);
        renderFooterSection(data);
      })
      .catch(error => {
        console.error('Failed to initialize hours:', error);
      });
  }

  /**
   * Public API for manual updates
   */
  window.KzooHours = {
    refresh: initializeHours,
    getData: () => hoursData
  };

  /**
   * Initialize when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHours);
  } else {
    initializeHours();
  }

})();