// =============================================================================
// STATE VARIABLES - All global state variables
// =============================================================================

let pricingData = {};
let calculatorState = {};
let hasUnsavedChanges = false;

// =============================================================================
// HTML ELEMENTS
// =============================================================================

const pricingCategoriesElement = document.getElementById('pricingCategories');
const totalPriceElement = document.getElementById('totalPrice');
const summaryDetailsElementElement = document.getElementById('summaryDetails');
const recommendationsContainerElement = document.getElementById('recommendationsContainer');
const summaryDetailsElement = document.getElementById('summaryDetails');
const saveBtnElement = document.getElementById('saveBtn');
const loadBtnElement = document.getElementById('loadBtn');
const fileInputElement = document.getElementById('fileInput');

// =============================================================================
// RULES ENGINE - Declarative recommendation system
// =============================================================================

const RECOMMENDATION_RULES = [
    {
        id: 'metrics-resolution-mismatch',
        type: 'info',
        icon: 'ℹ️',
        condition: (state) => {
            if (!state.Metrics || !state.Metrics.options) return false;
            const highResSelected = state.Metrics.options[1]?.selected;
            const quantity = state.Metrics.options.find(o => o.selected)?.quantity || 0;
            return highResSelected && quantity < 200000;
        },
        message: () => 'High-resolution metrics selected with relatively low volume',
        suggestions: [
            'Low-resolution is recommended for most use cases',
            'High-resolution metrics are more expensive'
        ]
    },
    {
        id: 'too-many-irm',
        type: 'error',
        icon: '⛔',
        condition: (state) => {
            const irmUsers = state['IRM']?.options?.[0]?.quantity;
            const vizUsers = state['Visualization']?.options?.find(o => o.selected)?.quantity;
            return  irmUsers > vizUsers;
        },
        message: () => 'More IRM users than Visualization users',
        suggestions: [
            'Although it is possible, it is unlikely to happen',
            'Verify your IRM and Visualization users assumptions'
        ]
    },
    {
        id: 'too-many-ai',
        type: 'error',
        icon: '⛔',
        condition: (state) => {
            const aiUsers = state['Grafana Assistant']?.options?.[0]?.quantity;
            const vizUsers = state['Visualization']?.options?.find(o => o.selected)?.quantity;
            return  aiUsers > vizUsers;
        },
        message: () => 'More Grafana Assistant users than Visualization users',
        suggestions: [
            'Although it is possible, it is unlikely to happen',
            'Verify your Grafana Assistant and Visualization users assumptions'
        ]
    },
    {
        id: 'kubernetes-without-logs',
        type: 'info',
        icon: 'ℹ️',
        condition: (state) => {
            const hasK8s = (state['Kubernetes Monitoring - Host']?.options?.[0]?.quantity > 0) ||
                (state['Kubernetes Monitoring - Container']?.options?.[0]?.quantity > 0);
            const withLogs = state['Logs']?.options?.some(option => option.quantity > 0);
            return hasK8s && !withLogs;
        },
        message: () => 'Kubernetes monitoring configured without logs',
        suggestions: [
            'Kubernetes monitoring typically requires logs to provide better results',
            'Consider adding Logs service for complete observability'
        ]
    }
];

// Evaluate all rules and return matching recommendations
function evaluateRecommendations(state, totalCost) {
    return RECOMMENDATION_RULES
        .filter(rule => rule.condition(state, totalCost))
        .map(rule => ({
            id: rule.id,
            type: rule.type,
            icon: rule.icon,
            message: typeof rule.message === 'function' ? rule.message(totalCost) : rule.message,
            suggestions: rule.suggestions
        }));
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

// Utility function to format numbers with thousand separators
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Utility function to format currency
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    return '$' + amount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Utility function to parse number from formatted string
function parseFormattedNumber(str) {
    if (!str) return 0;
    // Remove commas and parse
    const cleaned = str.toString().replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

// =============================================================================
// LOADING AND RENDERING
// =============================================================================

// Load pricing data
function loadPricingData() {
    fetch('pricing.json')
    .then(response => {
        if (!response.ok) throw new Error('Failed to load pricing data.');
        return response.json();
    })
    .then(data => {
        pricingData = data;
        calculatorState = {};
        
        Object.keys(pricingData).forEach(category => {
            const categoryData = pricingData[category];
        
            calculatorState[category] = {
                collapsed: true,
                options: []
            };
        
            categoryData.options?.forEach((option, optionIndex) => {
                calculatorState[category].options.push({
                    quantity: 0,
                    selected: optionIndex === 0 // Default first option for exclusive groups
                });
            });
        });
        
        renderCalculator();
        updateSummary();
    })
    .catch(error => {
        console.error(error);
    });
}

// Render the calculator UI
function renderCalculator() {
    pricingCategoriesElement.innerHTML = '';

    Object.keys(pricingData).forEach(category => {
        const categoryData = pricingData[category];
        const categoryCard = createCategoryCard(category, categoryData);
        pricingCategoriesElement.appendChild(categoryCard);
    });
}

// Create a category card
function createCategoryCard(category, categoryData) {
    const card = document.createElement('div');
    card.className = 'category-card';

    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `
        <h3>${category}</h3>
        <span class="toggle-icon ${calculatorState[category].collapsed ? 'collapsed' : ''}">▼</span>
    `;

    header.addEventListener('click', () => {
        calculatorState[category].collapsed = !calculatorState[category].collapsed;
        const content = card.querySelector('.category-content');
        const icon = header.querySelector('.toggle-icon');

        if (calculatorState[category].collapsed) {
            content.classList.add('collapsed');
            icon.classList.add('collapsed');
        } else {
            content.classList.remove('collapsed');
            icon.classList.remove('collapsed');
        }
    });

    const content = document.createElement('div');
    content.className = `category-content ${calculatorState[category].collapsed ? 'collapsed' : ''}`;

    // Add description if available
    if (categoryData.description) {
        const descElement = document.createElement('div');
        descElement.className = 'category-description';
        descElement.innerHTML = categoryData.description;
        content.appendChild(descElement);
    }

    // Add unit info if available
    if (categoryData.unit) {
        const unitInfo = document.createElement('div');
        unitInfo.className = 'unit-info';
        unitInfo.textContent = `Unit: ${categoryData.unit}`;
        unitInfo.style.marginBottom = '15px';
        unitInfo.style.fontWeight = '600';
        content.appendChild(unitInfo);
    }

    // Handle exclusive options (radio buttons)
    if (categoryData.optionsExclusive && categoryData.options.length > 1) {
        categoryData.options?.forEach((option, optionIndex) => {
            const optionElement = createExclusiveOption(category, categoryData, option, optionIndex);
            content.appendChild(optionElement);
        });
    }
    // Handle non-exclusive options or single option
    else {
        categoryData.options?.forEach((option, optionIndex) => {
            const optionElement = createNonExclusiveOption(category, categoryData, option, optionIndex);
            content.appendChild(optionElement);
        });
    }

    card.appendChild(header);
    card.appendChild(content);

    return card;
}

// Create exclusive option (radio button)
function createExclusiveOption(category, categoryData, option, optionIndex) {
    const div = document.createElement('div');
    div.className = 'price-option';

    const radioId = `${category}-${optionIndex}`;
    const radioName = `${category}`;

    const isSelected = calculatorState[category].options[optionIndex].selected;

    // Determine the unit to display
    const displayUnit = option.unit || categoryData.unit || '';

    div.innerHTML = `
        <div class="price-option-header">
            <div class="option-name">${option.name || 'Standard'}</div>
            <div class="option-price">${formatCurrency(option.price)} ${displayUnit}</div>
        </div>
        <div class="option-controls">
            <input type="radio" 
                   id="${radioId}" 
                   name="${radioName}" 
                   ${isSelected ? 'checked' : ''}
                   onchange="handleExclusiveSelection('${category}', ${optionIndex})">
            <label for="${radioId}">Select this option</label>
        </div>
    `;

    // Add quantity input for selected option
    if (isSelected) {
        const quantityControl = document.createElement('div');
        quantityControl.className = 'option-controls';
        quantityControl.style.marginTop = '10px';

        const currentQuantity = calculatorState[category].options[optionIndex].quantity;

        // Add pack information if applicable
        let packInfo = '';
        if (option.pack) {
            packInfo = `<span class="pack-info">(Sold in packs of ${formatNumber(option.pack)})</span>`;
        }

        quantityControl.innerHTML = `
            <label>Quantity:</label>
            <input type="text" 
                   class="quantity-input"
                   value="${formatNumber(currentQuantity)}" 
                   onblur="handleQuantityChange('${category}', ${optionIndex}, this.value)"
                   onfocus="this.value = this.value.replace(/,/g, '')"
                   onkeypress="return event.charCode >= 48 && event.charCode <= 57 || event.charCode === 46">
            ${packInfo}
        `;

        div.appendChild(quantityControl);
    }

    return div;
}

// Create non-exclusive option (quantity input)
function createNonExclusiveOption(category, categoryData, option, optionIndex) {
    const div = document.createElement('div');
    div.className = 'price-option';

    const currentQuantity = calculatorState[category].options[optionIndex].quantity;

    // Determine the unit to display
    const displayUnit = option.unit || categoryData.unit || '';

    // Add pack information if applicable
    let packInfo = '';
    if (option.pack) {
        packInfo = `<div class="pack-info">Sold in packs of ${formatNumber(option.pack)}</div>`;
    }

    div.innerHTML = `
        <div class="price-option-header">
            <div class="option-name">${option.name || 'Standard'}</div>
            <div class="option-price">${formatCurrency(option.price)} ${displayUnit}</div>
        </div>
        ${packInfo}
        <div class="option-controls">
            <label>Quantity:</label>
            <input type="text" 
                   class="quantity-input"
                   value="${formatNumber(currentQuantity)}" 
                   onblur="handleQuantityChange('${category}', ${optionIndex}, this.value)"
                   onfocus="this.value = this.value.replace(/,/g, '')"
                   onkeypress="return event.charCode >= 48 && event.charCode <= 57 || event.charCode === 46">
        </div>
    `;

    return div;
}

// Handle exclusive option selection
function handleExclusiveSelection(category, optionIndex) {
    // Deselect all options in this category
    calculatorState[category].options.forEach((opt, idx) => {
        opt.selected = (idx === optionIndex);
        if (idx !== optionIndex) {
            opt.quantity = 0; // Reset quantity for unselected options
        }
    });

    renderCalculator();
    updateSummary();
}

// Handle quantity change
function handleQuantityChange(category, optionIndex, value) {
    const quantity = parseFormattedNumber(value);
    calculatorState[category].options[optionIndex].quantity = Math.max(0, quantity);
    renderCalculator();
    updateSummary();
}

// Calculate cost with pack logic
function calculateCost(quantity, price, pack) {
    if (!pack) {
        // Simple multiplication if no pack
        return quantity * price;
    }

    // Round up to nearest pack
    const numPacks = Math.ceil(quantity / pack);
    return numPacks * price;
}

// Update summary
function updateSummary() {
    let totalCost = 0;
    const details = [];

    Object.keys(pricingData).forEach(category => {
        const categoryData = pricingData[category];
        let categoryCost = 0;
        const categoryDetails = [];

        // Handle regular options
        if (categoryData.options && calculatorState[category]) {
            categoryData.options.forEach((option, optionIndex) => {
                const state = calculatorState[category].options[optionIndex];
                const quantity = state.quantity || 0;

                // For exclusive options, only count if selected
                if (categoryData.optionsExclusive && !state.selected) {
                    return;
                }

                if (quantity > 0) {
                    const cost = calculateCost(quantity, option.price, option.pack);
                    categoryCost += cost;

                    // Calculate actual billable quantity for display
                    let quantityDisplay = formatNumber(quantity);

                    if (option.pack) {
                        const numPacks = Math.ceil(quantity / option.pack);
                        quantityDisplay = `${formatNumber(quantity)} (${formatNumber(numPacks)} pack${numPacks > 1 ? 's' : ''} of ${formatNumber(option.pack)})`;
                    }

                    categoryDetails.push({
                        name: option.name || 'Standard',
                        quantity: quantity,
                        quantityDisplay: quantityDisplay,
                        unitPrice: option.price,
                        unit: option.unit || categoryData.unit,
                        pack: option.pack,
                        cost: cost
                    });
                }
            });
        }

        if (categoryCost > 0) {
            totalCost += categoryCost;
            details.push({
                category: category,
                cost: categoryCost,
                items: categoryDetails
            });
        }
    });

    // Update total
    totalPriceElement.textContent = formatCurrency(totalCost);

    // Update details
    summaryDetailsElement.innerHTML = '';

    if (details.length === 0) {
        summaryDetailsElement.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No services configured yet</p>';
    } else {
        details.forEach(detail => {
            const detailCard = document.createElement('div');
            detailCard.className = 'summary-detail-item';

            let itemsHtml = '';
            detail.items.forEach(item => {
                if (item.unitPrice !== null) {
                    itemsHtml += `
                        <div class="option-detail">
                            ${item.name}: ${item.quantityDisplay} × ${formatCurrency(item.unitPrice)} = 
                            <span class="option-cost">${formatCurrency(item.cost)}</span>
                        </div>
                    `;
                }
            });

            detailCard.innerHTML = `
                <div class="category-name">${detail.category} - ${formatCurrency(detail.cost)}</div>
                ${itemsHtml}
            `;

            summaryDetailsElement.appendChild(detailCard);
        });
    }

    // Add recommendations section
    displayRecommendations(calculatorState, totalCost);
}

// Display recommendations based on rules
function displayRecommendations(state, totalCost) {
    const recommendations = evaluateRecommendations(state, totalCost);

    // Clear previous recommendations
    recommendationsContainerElement.innerHTML = '';

    if (recommendations.length === 0) return;

    // Add header
    const header = document.createElement('h3');
    header.className = 'recommendations-header';
    header.textContent = 'Recommendations';
    recommendationsContainerElement.appendChild(header);

    // Add each recommendation
    recommendations.forEach(rec => {
        const card = document.createElement('div');
        card.className = `recommendation-card recommendation-${rec.type}`;

        let suggestionsHtml = '';
        if (rec.suggestions && rec.suggestions.length > 0) {
            suggestionsHtml = '<ul class="recommendation-suggestions">';
            rec.suggestions.forEach(suggestion => {
                suggestionsHtml += `<li>${suggestion}</li>`;
            });
            suggestionsHtml += '</ul>';
        }

        card.innerHTML = `
            <div class="recommendation-header">
                <span class="recommendation-icon">${rec.icon}</span>
                <span class="recommendation-message">${rec.message}</span>
            </div>
            ${suggestionsHtml}
        `;

        recommendationsContainerElement.appendChild(card);
    });
}

// =============================================================================
// PREVENT ACCIDENTAL DATA LOSS
// =============================================================================

// Check if there's any meaningful data
function hasData() {
    return Object.keys(calculatorState).some(category => {
        const state = calculatorState[category];
        return state.options?.some(option => option.quantity > 0);
    });
}

// Warn user before leaving if there's data
window.addEventListener('beforeunload', (e) => {
    if (hasData()) {
        e.preventDefault();
        e.returnValue = ''; // Modern browsers require this
        return ''; // Some older browsers
    }
});

// =============================================================================
// SAVE / LOAD CONFIGURATION
// =============================================================================

saveBtnElement.addEventListener('click', saveConfiguration);

loadBtnElement.addEventListener('click', () => {
    fileInputElement.click();
});

fileInputElement.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadConfiguration(e.target.files[0]);
        // Reset the input so the same file can be loaded again
        e.target.value = '';
    }
});

// Save configuration
function saveConfiguration() {
    const config = {
        timestamp: new Date().toISOString(),
        state: calculatorState
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grafana-pricing-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Load configuration
function loadConfiguration(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);

            if (config.state) {
                calculatorState = config.state;
                renderCalculator();
                updateSummary();
            } else {
                alert('Invalid configuration file format');
            }
        } catch (error) {
            alert('Error loading configuration: ' + error.message);
        }
    };

    reader.readAsText(file);
}

// =============================================================================
// MAIN INITIALIZATION
// =============================================================================

// Event listeners
document.addEventListener('DOMContentLoaded', loadPricingData);
