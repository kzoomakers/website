/**
 * Dynamic Footer Generator
 * Loads footer structure from JSON and generates HTML
 * Jon Kelley wuz here 2025!!
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    jsonPath: 'dynamic/json/footer.json',
    footerId: 'footer'
  };

  /**
   * Generate about section HTML
   */
  function generateAboutSection(aboutData) {
    return `
      <div class="col-lg-4 col-md-6 mb-5 mb-lg-0">
        <h3>${aboutData.title}</h3>
        <p>${aboutData.description}</p>
        <div id="hours-footer-section">
          <!-- Hours will be dynamically loaded by hours.js -->
          <p>Loading hours...</p>
        </div>
      </div>`;
  }

  /**
   * Generate a footer column with links
   */
  function generateColumn(column) {
    let html = `
      <div class="col-lg-${column.id === 'services' ? '3' : column.id === 'quicklinks' ? '2' : '3'} col-md-6 mb-5 ${column.id === 'quicklinks' ? 'mb-md-0' : 'mb-lg-0'}">
        <ul>
          <li>
            <h3>${column.title}</h3>
          </li>`;

    if (Array.isArray(column.links)) {
      column.links.forEach(link => {
        html += `
          <li><a href="${link.href}">${link.label}</a></li>`;
      });
    }
    
    html += `
        </ul>
      </div>`;
    
    return html;
  }

  /**
   * Generate footer bottom section HTML
   */
  function generateFooterBottom(copyrightData) {
    return `
    <div class="footer-bottom">
      <h5>${copyrightData.text}</h5>
      <h6>${copyrightData.credit.text} <a href="${copyrightData.credit.link.href}">${copyrightData.credit.link.label}</a></h6>
    </div>`;
  }

  /**
   * Generate complete footer HTML
   */
  function generateFooter(data) {
    let html = `
  <div class="top-footer">
    <div class="container">
      <div class="row justify-content-around">
        ${generateAboutSection(data.about)}
        <!-- End of .col-sm-3 -->
`;

    // Generate all columns
    data.columns.forEach(column => {
      html += `
        ${generateColumn(column)}
        <!-- End of .col-sm-3 -->
`;
    });

    html += `
      </div>
    </div> <!-- end container -->
  </div>
  ${generateFooterBottom(data.copyright)}`;

    return html;
  }

  /**
   * Load footer data and inject into page
   */
  function loadFooter() {
    fetch(CONFIG.jsonPath)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const footer = document.getElementById(CONFIG.footerId);
        if (footer) {
          footer.innerHTML = generateFooter(data);
        } else {
          console.error('Footer element not found');
        }
      })
      .catch(error => {
        console.error('Error loading footer:', error);
      });
  }

  /**
   * Initialize footer when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFooter);
  } else {
    loadFooter();
  }

})();