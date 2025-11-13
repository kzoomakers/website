/**
 * Dynamic Inventory Table Library
 * A reusable library for creating sortable, searchable inventory tables
 * 
 * Usage:
 * const inventory = new InventoryTable({
 *   jsonPath: 'dynamic/json/inventory-woodshop.json',
 *   tableId: 'inventoryTable',
 *   searchInputId: 'searchInput',
 *   statsConfig: {
 *     totalItems: 'total-items',
 *     totalQuantity: 'total-quantity'
 *   }
 * });
 */

class InventoryTable {
  constructor(config) {
    this.config = {
      jsonPath: config.jsonPath || '',
      tableId: config.tableId || 'inventoryTable',
      searchInputId: config.searchInputId || 'searchInput',
      statsConfig: config.statsConfig || null,
      columns: config.columns || ['quantity', 'description', 'type'],
      columnHeaders: config.columnHeaders || {
        quantity: 'Quantity',
        description: 'Item Description',
        type: 'Type of Tool'
      },
      onLoad: config.onLoad || null
    };
    
    this.data = [];
    this.filteredData = [];
    this.sortColumn = null;
    this.sortDirection = 'asc';
    
    this.init();
  }
  
  async init() {
    try {
      await this.loadData();
      this.renderTable();
      this.attachEventListeners();
      this.calculateStats();
      
      if (this.config.onLoad && typeof this.config.onLoad === 'function') {
        this.config.onLoad(this.data);
      }
    } catch (error) {
      console.error('Error initializing inventory table:', error);
      this.showError('Failed to load inventory data. Please try again later.');
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
      
      // Apply column-specific styles
      if (column === 'quantity') {
        th.style.textAlign = 'center';
        th.style.width = '100px';
      }
      
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create tbody
    const tbody = document.createElement('tbody');
    this.filteredData.forEach(item => {
      const row = document.createElement('tr');
      
      this.config.columns.forEach(column => {
        const td = document.createElement('td');
        
        if (column === 'quantity') {
          td.className = 'quantity-col';
          td.textContent = item[column] || '';
        } else if (column === 'type') {
          // Gracefully handle empty type
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
      
      // Handle numeric sorting for quantity
      if (column === 'quantity') {
        aVal = parseInt(aVal) || 0;
        bVal = parseInt(bVal) || 0;
      } else {
        // Case-insensitive string sorting
        aVal = aVal.toString().toLowerCase();
        bVal = bVal.toString().toLowerCase();
      }
      
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
    
    if (!term) {
      this.filteredData = [...this.data];
    } else {
      this.filteredData = this.data.filter(item => {
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
      totalQuantity: this.filteredData.reduce((sum, item) => {
        return sum + (parseInt(item.quantity) || 0);
      }, 0)
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
    
    // Calculate and display type counts if configured
    if (this.config.statsConfig.typeCounts) {
      this.calculateTypeCounts();
    }
    
    return stats;
  }
  
  calculateTypeCounts() {
    // Count items by type
    const typeCounts = {};
    
    this.filteredData.forEach(item => {
      const type = item.type || 'Uncategorized';
      if (!typeCounts[type]) {
        typeCounts[type] = 0;
      }
      typeCounts[type] += parseInt(item.quantity) || 0;
    });
    
    // Filter types with more than 10 items
    const filteredTypes = Object.entries(typeCounts)
      .filter(([type, count]) => count > 10)
      .sort((a, b) => b[1] - a[1]); // Sort by count descending
    
    // Update DOM
    const container = document.getElementById(this.config.statsConfig.typeCounts);
    if (container) {
      if (filteredTypes.length === 0) {
        container.innerHTML = '<p style="text-align: center; opacity: 0.7;">No tool types with more than 10 items</p>';
      } else {
        container.innerHTML = filteredTypes.map(([type, count]) => `
          <div class="type-count-item">
            <span class="type-name">${type}</span>
            <span class="type-count">${count}</span>
          </div>
        `).join('');
      }
    }
    
    return filteredTypes;
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
  
  exportToCSV(filename = 'inventory.csv') {
    const headers = this.config.columns.map(col => this.config.columnHeaders[col] || col);
    const rows = this.filteredData.map(item => 
      this.config.columns.map(col => {
        const value = item[col] || '';
        // Escape quotes and wrap in quotes if contains comma
        return value.toString().includes(',') ? `"${value.replace(/"/g, '""')}"` : value;
      })
    );
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  window.InventoryTable = InventoryTable;
}