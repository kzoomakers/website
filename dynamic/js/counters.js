/**
 * Dynamic Counters Generator
 * Loads counter data from JSON and generates HTML
 * Uses dynamic/json/counters.json for content
 * Jon Kelley wuz here 2025!!
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    jsonPath: 'dynamic/json/counters.json',
    containerSelector: '.counter-wrapper .row'
  };

  /**
   * Generate counter item HTML
   */
  function generateCounterItem(counter) {
    const killBorderClass = counter.killBorder ? ' kill-border' : '';
    
    return `
      <!-- ${counter.label} -->
      <div class="${counter.columnClass} text-center">
        <div class="counters-item${killBorderClass}">
          <i class="${counter.icon}"></i>
          <div>
            <span class="counter" data-count="${counter.count}">0</span>
          </div>
          <h3>${counter.label}</h3>
        </div>
      </div>
      <!-- end ${counter.label} -->`;
  }

  /**
   * Generate all counters HTML
   */
  function generateCounters(data) {
    return data.counters.map(counter => generateCounterItem(counter)).join('\n');
  }

  /**
   * Load counters data and inject into page
   */
  function loadCounters() {
    fetch(CONFIG.jsonPath)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const container = document.querySelector(CONFIG.containerSelector);
        if (container) {
          container.innerHTML = generateCounters(data);
          
          // Reinitialize counter animation if script.js has loaded
          if (typeof window.initCounters === 'function') {
            window.initCounters();
          }
        } else {
          console.error('Counter container element not found');
        }
      })
      .catch(error => {
        console.error('Error loading counters:', error);
      });
  }

  /**
   * Initialize counters when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCounters);
  } else {
    loadCounters();
  }

})();