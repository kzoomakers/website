/**
 * Interactive Donation Inventory Table
 * Provides category filtering and sortable table functionality
 */

class DonationInventoryTable {
  constructor(config) {
    this.config = config;
    this.data = [];
    this.filteredData = [];
    this.currentCategory = 'all';
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.init();
  }

  async init() {
    try {
      await this.loadData();
      this.extractCategories();
      this.renderSearchBox();
      this.renderCategoryFilters();
      this.renderTable();
      this.updateStats();
      this.attachEventListeners();
      
      if (this.config.onLoad) {
        this.config.onLoad(this.data);
      }
    } catch (error) {
      console.error('Error initializing donation inventory:', error);
    }
  }

  async loadData() {
    const response = await fetch(this.config.jsonPath);
    const json = await response.json();
    this.data = json.items || [];
    this.filteredData = [...this.data];
  }

  extractCategories() {
    const categorySet = new Set();
    this.data.forEach(item => {
      if (item.type) {
        categorySet.add(item.type);
      }
    });
    this.categories = Array.from(categorySet).sort();
  }

  renderSearchBox() {
    const container = document.getElementById('search-box-container');
    if (!container) return;

    const html = `
      <div class="search-box-wrapper">
        <input
          type="text"
          id="donation-search"
          class="search-input"
          placeholder="Search for tools, equipment, or supplies..."
          autocomplete="off"
        />
        <span class="search-icon">🔍</span>
      </div>
    `;
    container.innerHTML = html;
  }

  renderCategoryFilters() {
    const container = document.getElementById('category-filters');
    if (!container) return;

    // Create category count map
    const categoryCounts = {};
    this.data.forEach(item => {
      categoryCounts[item.type] = (categoryCounts[item.type] || 0) + 1;
    });

    // Create filter buttons
    let html = `
      <div class="category-filter-container">
        <button class="category-btn active" data-category="all">
          All Categories <span class="category-count">${this.data.length}</span>
        </button>
    `;

    this.categories.forEach(category => {
      html += `
        <button class="category-btn" data-category="${this.escapeHtml(category)}">
          ${this.escapeHtml(category)} <span class="category-count">${categoryCounts[category]}</span>
        </button>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }

  renderTable() {
    const container = document.getElementById(this.config.tableId);
    if (!container) return;

    let html = `
      <div class="table-responsive">
        <table class="donation-table">
          <thead>
            <tr>
              <th class="sortable" data-column="description">
                Item We Need
                <span class="sort-indicator"></span>
              </th>
              <th class="sortable" data-column="type">
                Category
                <span class="sort-indicator"></span>
              </th>
            </tr>
          </thead>
          <tbody>
    `;

    if (this.filteredData.length === 0) {
      html += `
        <tr>
          <td colspan="2" class="no-results">No items found in this category</td>
        </tr>
      `;
    } else {
      this.filteredData.forEach(item => {
        html += `
          <tr>
            <td class="item-description">${this.escapeHtml(item.description)}</td>
            <td class="item-category">${this.escapeHtml(item.type)}</td>
          </tr>
        `;
      });
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
    this.updateSortIndicators();
  }

  filterByCategory(category) {
    this.currentCategory = category;
    this.applyFilters();
  }

  searchItems(searchTerm) {
    this.searchTerm = searchTerm.toLowerCase().trim();
    this.applyFilters();
  }

  applyFilters() {
    // Start with all data
    let filtered = [...this.data];

    // Apply category filter
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(item => item.type === this.currentCategory);
    }

    // Apply search filter
    if (this.searchTerm) {
      filtered = filtered.filter(item => {
        const description = (item.description || '').toLowerCase();
        const type = (item.type || '').toLowerCase();
        return description.includes(this.searchTerm) || type.includes(this.searchTerm);
      });
    }

    this.filteredData = filtered;

    // Re-apply current sort if any
    if (this.sortColumn) {
      this.sortData(this.sortColumn, this.sortDirection);
    }

    this.renderTable();
    this.updateStats();
    this.updateActiveCategory();
  }

  sortData(column, direction) {
    this.sortColumn = column;
    this.sortDirection = direction;

    this.filteredData.sort((a, b) => {
      let aVal = a[column] || '';
      let bVal = b[column] || '';
      
      // Case-insensitive string comparison
      aVal = aVal.toString().toLowerCase();
      bVal = bVal.toString().toLowerCase();

      if (direction === 'asc') {
        return aVal.localeCompare(bVal);
      } else {
        return bVal.localeCompare(aVal);
      }
    });

    this.renderTable();
  }

  updateSortIndicators() {
    const headers = document.querySelectorAll('.sortable');
    headers.forEach(header => {
      const indicator = header.querySelector('.sort-indicator');
      const column = header.dataset.column;
      
      if (column === this.sortColumn) {
        indicator.textContent = this.sortDirection === 'asc' ? ' ▲' : ' ▼';
        header.classList.add('sorted');
      } else {
        indicator.textContent = '';
        header.classList.remove('sorted');
      }
    });
  }

  updateStats() {
    const totalQuantityEl = document.getElementById(this.config.statsConfig.totalQuantity);
    if (totalQuantityEl) {
      totalQuantityEl.textContent = this.filteredData.length;
    }
  }

  updateActiveCategory() {
    const buttons = document.querySelectorAll('.category-btn');
    buttons.forEach(btn => {
      if (btn.dataset.category === this.currentCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  attachEventListeners() {
    // Search box
    const searchInput = document.getElementById('donation-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchItems(e.target.value);
      });
    }

    // Category filter buttons
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('category-btn') || e.target.closest('.category-btn')) {
        const btn = e.target.classList.contains('category-btn') ? e.target : e.target.closest('.category-btn');
        const category = btn.dataset.category;
        this.filterByCategory(category);
      }
    });

    // Table sorting
    document.addEventListener('click', (e) => {
      const header = e.target.closest('.sortable');
      if (header) {
        const column = header.dataset.column;
        let direction = 'asc';
        
        if (this.sortColumn === column) {
          direction = this.sortDirection === 'asc' ? 'desc' : 'asc';
        }
        
        this.sortData(column, direction);
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Make it available globally
window.DonationInventoryTable = DonationInventoryTable;
