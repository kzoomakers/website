/**
 * Dynamic Navigation Generator
 * Loads navigation structure from JSON and generates HTML
 * Uses dynamic/json/navbar.json for content
 * Jon Kelley wuz here 2025!!
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    jsonPath: 'dynamic/json/navbar.json',
    navContainerId: 'navigation',
    activeClass: 'active'
  };

  /**
   * Get the current page filename
   */
  function getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    return page;
  }

  /**
   * Check if a menu item should be active
   */
  function isActive(item, currentPage) {
    if (item.type === 'link' && item.href === currentPage) {
      return true;
    }
    if (item.type === 'dropdown' && item.items) {
      return item.items.some(subItem => {
        if (subItem.href === currentPage) return true;
        if (subItem.type === 'submenu' && subItem.items) {
          return subItem.items.some(nestedItem => nestedItem.href === currentPage);
        }
        return false;
      });
    }
    return false;
  }

  /**
   * Generate submenu HTML (supports nested submenus)
   */
  function generateSubmenu(item, parentId) {
    const submenuId = `dropdown${parentId}${Math.random().toString(36).substr(2, 4)}`;
    const direction = item.direction || 'dropright';
    
    let html = `
      <li class="dropdown dropdown-submenu ${direction}">
        <a class="dropdown-item dropdown-toggle" href="#!" id="${submenuId}" role="button"
           data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
          ${item.label} <i class="${item.icon}"></i>
        </a>
        <ul class="dropdown-menu" aria-labelledby="${submenuId}">`;
    
    item.items.forEach(subItem => {
      // Check if this item is itself a submenu (recursive support)
      if (subItem.type === 'submenu') {
        html += generateSubmenu(subItem, submenuId);
      } else {
        html += `<li><a class="dropdown-item" href="${subItem.href}">${subItem.label}</a></li>`;
      }
    });
    
    html += `
        </ul>
      </li>`;
    
    return html;
  }

  /**
   * Generate dropdown menu HTML
   */
  function generateDropdown(item, isActive) {
    const dropdownId = `navbarDropdown${item.id}`;
    
    let html = `
      <li class="nav-item dropdown ${isActive ? CONFIG.activeClass : ''}">
        <a class="nav-link dropdown-toggle" href="#!" id="${dropdownId}" role="button" 
           data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
          ${item.label} <i class="${item.icon}"></i>
        </a>
        <ul class="dropdown-menu" aria-labelledby="${dropdownId}">`;
    
    item.items.forEach(subItem => {
      if (subItem.type === 'submenu') {
        html += generateSubmenu(subItem, item.id);
      } else {
        html += `<li><a class="dropdown-item" href="${subItem.href}">${subItem.label}</a></li>`;
      }
    });
    
    html += `
        </ul>
      </li>`;
    
    return html;
  }

  /**
   * Generate simple link HTML
   */
  function generateLink(item, isActive) {
    return `
      <li class="nav-item ${isActive ? CONFIG.activeClass : ''}">
        <a class="nav-link" href="${item.href}">${item.label}</a>
      </li>`;
  }

  /**
   * Generate navigation HTML
   */
  function generateNavigation(data) {
    const currentPage = getCurrentPage();
    let html = '';

    data.menuItems.forEach(item => {
      const active = isActive(item, currentPage);
      
      if (item.type === 'dropdown') {
        html += generateDropdown(item, active);
      } else if (item.type === 'link') {
        html += generateLink(item, active);
      }
    });

    return html;
  }

  /**
   * Generate logo HTML
   */
  function generateLogo(logoData) {
    return `
      <a class="navbar-brand logo" href="${logoData.href}">
        <img loading="lazy" class="logo-default" src="${logoData.default}" alt="${logoData.alt}" />
        <img loading="lazy" class="logo-white" src="${logoData.white}" alt="${logoData.alt}" />
      </a>`;
  }

  /**
   * Generate complete header HTML
   */
  function generateHeader(data) {
    return `
      <div class="container">
        <!-- main nav -->
        <nav class="navbar navbar-expand-lg navbar-light px-0">
          <!-- logo -->
          ${generateLogo(data.logo)}
          <!-- /logo -->
          <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#${CONFIG.navContainerId}"
            aria-controls="${CONFIG.navContainerId}" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <!-- Animated menu button -->
          <div id="menu-btn" class="close">
            <span class="text">MENU</span>
          </div>

          <div class="collapse navbar-collapse" id="${CONFIG.navContainerId}">
            <ul class="navbar-nav ml-auto text-center">
              ${generateNavigation(data)}
            </ul>
          </div>
        </nav>
        <!-- /main nav -->
      </div>`;
  }

  /**
   * Adjust submenu positioning to prevent off-screen overflow
   */
  function adjustSubmenuPositions() {
    const submenus = document.querySelectorAll('.dropdown-submenu');
    
    submenus.forEach(submenu => {
      const menu = submenu.querySelector('.dropdown-menu');
      if (!menu) return;
      
      submenu.addEventListener('mouseenter', function() {
        // Reset classes
        this.classList.remove('dropleft');
        this.classList.add('dropright');
        
        // Wait for next frame to get accurate positioning
        requestAnimationFrame(() => {
          const rect = menu.getBoundingClientRect();
          const viewportWidth = window.innerWidth;
          
          // Check if menu goes off-screen to the right
          if (rect.right > viewportWidth) {
            this.classList.remove('dropright');
            this.classList.add('dropleft');
          }
        });
      });
    });
  }

  /**
   * Initialize mobile dropdown behavior
   */
  function initializeMobileDropdowns() {
    // Handle main dropdown clicks on mobile
    const dropdownToggles = document.querySelectorAll('.navbar-nav .dropdown-toggle');
    
    dropdownToggles.forEach(toggle => {
      toggle.addEventListener('click', function(e) {
        // On mobile (when navbar-toggler is visible), handle dropdown clicks
        const navbarToggler = document.querySelector('.navbar-toggler');
        const isCollapsed = navbarToggler && window.getComputedStyle(navbarToggler).display !== 'none';
        
        if (isCollapsed) {
          e.preventDefault();
          e.stopPropagation();
          
          const parentLi = this.closest('.dropdown, .dropdown-submenu');
          const dropdownMenu = parentLi.querySelector('.dropdown-menu');
          
          // Close other dropdowns at the same level
          const siblings = Array.from(parentLi.parentElement.children).filter(el => el !== parentLi);
          siblings.forEach(sibling => {
            const siblingMenu = sibling.querySelector('.dropdown-menu');
            if (siblingMenu) {
              siblingMenu.classList.remove('show');
            }
          });
          
          // Toggle current dropdown
          if (dropdownMenu) {
            dropdownMenu.classList.toggle('show');
          }
        }
      });
    });
  }

  /**
   * Initialize animated menu button
   */
  function initializeMenuButton() {
    const menuBtn = document.getElementById('menu-btn');
    const navCollapse = document.getElementById(CONFIG.navContainerId);
    
    if (menuBtn && navCollapse) {
      menuBtn.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Toggle classes
        if (menuBtn.classList.contains('open')) {
          menuBtn.classList.remove('open');
          menuBtn.classList.add('close');
          // Collapse the menu
          $(navCollapse).collapse('hide');
        } else {
          menuBtn.classList.remove('close');
          menuBtn.classList.add('open');
          // Expand the menu
          $(navCollapse).collapse('show');
        }
      });
      
      // Listen for Bootstrap collapse events to sync button state
      $(navCollapse).on('hidden.bs.collapse', function() {
        if (menuBtn.classList.contains('open')) {
          menuBtn.classList.remove('open');
          menuBtn.classList.add('close');
        }
      });
      
      $(navCollapse).on('shown.bs.collapse', function() {
        if (menuBtn.classList.contains('close')) {
          menuBtn.classList.remove('close');
          menuBtn.classList.add('open');
        }
      });
    }
  }

  /**
   * Load navigation data and inject into page
   */
  function loadNavigation() {
    fetch(CONFIG.jsonPath)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const header = document.querySelector('header.navigation');
        if (header) {
          header.innerHTML = generateHeader(data);
          // Adjust submenu positions after DOM is ready
          setTimeout(adjustSubmenuPositions, 100);
          // Initialize mobile dropdown behavior
          setTimeout(initializeMobileDropdowns, 100);
          // Initialize animated menu button
          setTimeout(initializeMenuButton, 100);
        } else {
          console.error('Navigation header element not found');
        }
      })
      .catch(error => {
        console.error('Error loading navigation:', error);
      });
  }

  /**
   * Initialize navigation when DOM is ready
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavigation);
  } else {
    loadNavigation();
  }

})();