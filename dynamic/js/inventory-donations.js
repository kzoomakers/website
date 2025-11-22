/**
 * Dynamic Inventory Table Library - Donations Edition
 * A specialized version for donation pages with category filtering
 * 
 * Usage:
 * const inventory = new DonationInventoryTable({
 *   jsonPath: 'dynamic/json/inventory-misc-tools.json',
 *   tableId: 'inventoryTable',
 *   searchInputId: 'searchInput',
 *   statsConfig: {
 *     totalItems: 'total-items',
 *     totalQuantity: 'total-quantity',
 *     typeCounts: 'type-counts-container'
 *   }
 * });
 */

class DonationInventoryTable {
  constructor(config) {
    this.config = {
      jsonPath: config.jsonPath || '',
      tableId: config.tableId || 'inventoryTable',
      searchInputId: config.searchInputId || 'searchInput',
      statsConfig: config.statsConfig || null,
      columns: config.columns || ['description', 'type'],
      columnHeaders: config.columnHeaders || {
        description: 'Item We Need',
        type: 'Category'
      },
      onLoad: config.onLoad || null
    };
    
    this.data = [];
    this.filteredData = [];
    this.sortColumn = null;
    this.sortDirection = 'asc';
    this.selectedCategory = null;
    this.allCategories = [];
    
    this.init();
  }
  
  async init() {
    try {
      await this.loadData();
      this.deduplicateData();
      this.extractCategories();
      this.renderCategoryFilters();
      this.renderTable();
      this.attachEventListeners();
      this.calculateStats();
      
      if (this.config.onLoad && typeof this.config.onLoad === 'function') {
        this.config.onLoad(this.data);
      }
    } catch (error) {
      console.error('Error initializing donation inventory table:', error);
      this.showError('Failed to load donation items. Please try again later.');
    }
  }
  
  async loadData() {
    try {
      const response = await fetch(this.config.jsonPath);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const json = await response.json();
      this.data = json.items || [];
      this.filteredData = [...this.data];
    } catch (error) {
      console.error('Error loading JSON data:', error);
      throw error;
    }
  }
  
  deduplicateData() {
    // Create a map to track unique items by description + type combination
    const uniqueItems = new Map();
    
    this.data.forEach(item => {
      const key = `${item.description}|${item.type}`;
      if (!uniqueItems.has(key)) {
        uniqueItems.set(key, item);
      }
    });
    
    // Replace data with deduplicated items
    this.data = Array.from(uniqueItems.values());
    this.filteredData = [...this.data];
  }
  
  extractCategories() {
    const categories = new Set();
    this.data.forEach(item => {
      if (item.type) {
        categories.add(item.type);
      }
    });
    this.allCategories = Array.from(categories).sort();
  }
  
  renderCategoryFilters() {
    const container = document.getElementById(this.config.statsConfig?.typeCounts);
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create "All Categories" button
    const allBtn = document.createElement('button');
    allBtn.className = 'category-filter-btn active';
    allBtn.dataset.category = 'all';
    allBtn.textContent = 'All Categories';
    container.appendChild(allBtn);
    
    // Create category buttons
    this.allCategories.forEach(category => {
      const btn = document.createElement('button');
      btn.className = 'category-filter-btn';
      btn.dataset.category = category;
      btn.textContent = category;
      container.appendChild(btn);
    });
    
    // Create reset button
    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-filters';
    resetBtn.className = 'reset-filters-btn';
    resetBtn.textContent = 'Reset Filters';
    
    // Insert reset button after the filter controls
    const filterSection = container.parentElement;
    if (filterSection) {
      filterSection.appendChild(resetBtn);
    }
    
    // Attach click handlers
    const filterBtns = container.querySelectorAll('.category-filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const category = e.target.dataset.category;
        this.filterByCategory(category);
        
        // Update active state
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
      });
    });
    
    // Reset button handler
    const resetBtnElement = document.getElementById('reset-filters');
    if (resetBtnElement) {
      resetBtnElement.addEventListener('click', () => {
        this.resetFilters();
        filterBtns.forEach(b => b.classList.remove('active'));
        filterBtns[0].classList.add('active');
      });
    }
  }
  
  filterByCategory(category) {
    this.selectedCategory = category === 'all' ? null : category;
    
    if (!this.selectedCategory) {
      this.filteredData = [...this.data];
    } else {
      this.filteredData = this.data.filter(item => item.type === this.selectedCategory);
    }
    
    // Reset search input
    const searchInput = document.getElementById(this.config.searchInputId);
    if (searchInput) {
      searchInput.value = '';
    }
    
    this.renderTable();
    this.attachEventListeners();
    this.calculateStats();
  }
  
  resetFilters() {
    this.selectedCategory = null;
    this.filteredData = [...this.data];
    
    const searchInput = document.getElementById(this.config.searchInputId);
    if (searchInput) {
      searchInput.value = '';
    }
    
    this.renderTable();
    this.attachEventListeners();
    this.calculateStats();
  }
  
  renderTable() {
    const table = document.getElementById(this.config.tableId);
    if (!table) {
      console.error(`Table with id "${this.config.tableId}" not found`);
      return;
    }
    
    // Clear existing content
    table.innerHTML = '';
    
    // Create thead
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    this.config.columns.forEach(column => {
      const th = document.createElement('th');
      th.textContent = this.config.columnHeaders[column] || column;
      th.dataset.column = column;
      th.style.cursor = 'pointer';
      th.style.userSelect = 'none';
      
      // Add sort indicator
      const sortIndicator = document.createElement('span');
      sortIndicator.className = 'sort-indicator';
      sortIndicator.style.marginLeft = '5px';
      sortIndicator.style.opacity = '0.3';
      sortIndicator.textContent = '⇅';
      th.appendChild(sortIndicator);
      
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create tbody
    const tbody = document.createElement('tbody');
    
    if (this.filteredData.length === 0) {
      const row = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = this.config.columns.length;
      td.style.textAlign = 'center';
      td.style.padding = '20px';
      td.style.opacity = '0.7';
      td.textContent = 'No items found in this category.';
      row.appendChild(td);
      tbody.appendChild(row);
    } else {
      this.filteredData.forEach(item => {
        const row = document.createElement('tr');
        
        this.config.columns.forEach(column => {
          const td = document.createElement('td');
          
          if (column === 'type') {
            td.textContent = item[column] || '';
            if (!item[column]) {
              td.style.fontStyle = 'italic';
              td.style.opacity = '0.5';
            }
          } else {
            td.textContent = item[column] || '';
          }
          
          row.appendChild(td);
        });
        
        tbody.appendChild(row);
      });
    }
    
    table.appendChild(tbody);
  }
  
  attachEventListeners() {
    // Sort functionality
    const table = document.getElementById(this.config.tableId);
    if (table) {
      const headers = table.querySelectorAll('thead th');
      headers.forEach(header => {
        header.addEventListener('click', () => {
          const column = header.dataset.column;
          this.sortTable(column);
        });
      });
    }
    
    // Search functionality
    const searchInput = document.getElementById(this.config.searchInputId);
    if (searchInput) {
      searchInput.addEventListener('keyup', (e) => {
        this.filterTable(e.target.value);
      });
    }
    
    // Reset button functionality (next to search box)
    const resetBtn = document.getElementById('resetFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
        // Update category filter buttons
        const filterBtns = document.querySelectorAll('.category-filter-btn');
        filterBtns.forEach(b => b.classList.remove('active'));
        if (filterBtns.length > 0) {
          filterBtns[0].classList.add('active');
        }
      });
    }
  }
  
  sortTable(column) {
    // Toggle sort direction if clicking the same column
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    
    // Sort the filtered data
    this.filteredData.sort((a, b) => {
      let aVal = a[column] || '';
      let bVal = b[column] || '';
      
      // Case-insensitive string sorting
      aVal = aVal.toString().toLowerCase();
      bVal = bVal.toString().toLowerCase();
      
      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    
    // Update sort indicators
    this.updateSortIndicators();
    
    // Re-render table
    this.renderTable();
    this.attachEventListeners();
  }
  
  updateSortIndicators() {
    const table = document.getElementById(this.config.tableId);
    if (!table) return;
    
    const headers = table.querySelectorAll('thead th');
    headers.forEach(header => {
      const indicator = header.querySelector('.sort-indicator');
      if (!indicator) return;
      
      if (header.dataset.column === this.sortColumn) {
        indicator.style.opacity = '1';
        indicator.textContent = this.sortDirection === 'asc' ? '↑' : '↓';
      } else {
        indicator.style.opacity = '0.3';
        indicator.textContent = '⇅';
      }
    });
  }
  
  filterTable(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    
    let baseData = this.selectedCategory 
      ? this.data.filter(item => item.type === this.selectedCategory)
      : this.data;
    
    if (!term) {
      this.filteredData = [...baseData];
    } else {
      this.filteredData = baseData.filter(item => {
        return this.config.columns.some(column => {
          const value = item[column];
          return value && value.toString().toLowerCase().includes(term);
        });
      });
    }
    
    this.renderTable();
    this.attachEventListeners();
    this.calculateStats();
  }
  
  calculateStats() {
    if (!this.config.statsConfig) return;
    
    const stats = {
      totalItems: this.filteredData.length,
      totalQuantity: this.filteredData.length
    };
    
    // Update DOM elements
    if (this.config.statsConfig.totalItems) {
      const elem = document.getElementById(this.config.statsConfig.totalItems);
      if (elem) elem.textContent = stats.totalItems;
    }
    
    if (this.config.statsConfig.totalQuantity) {
      const elem = document.getElementById(this.config.statsConfig.totalQuantity);
      if (elem) elem.textContent = stats.totalQuantity;
    }
    
    return stats;
  }
  
  showError(message) {
    const table = document.getElementById(this.config.tableId);
    if (table) {
      table.innerHTML = `
        <tbody>
          <tr>
            <td colspan="${this.config.columns.length}" style="text-align: center; padding: 40px; color: #dc3545;">
              <strong>Error:</strong> ${message}
            </td>
          </tr>
        </tbody>
      `;
    }
  }
  
  // Public methods for external use
  getData() {
    return this.data;
  }
  
  getFilteredData() {
    return this.filteredData;
  }
  
  refresh() {
    this.init();
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.DonationInventoryTable = DonationInventoryTable;
}
