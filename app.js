// Pricing data
let pricingData = {};
let calculatorState = {};
let hasUnsavedChanges = false;

// =============================================================================
// RULES ENGINE - Simple declarative recommendation system
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
        id: 'logs-no-retention',
        type: 'error',
        icon: '⛔',
        condition: (state) => {
            if (!state.Logs || !state.Logs.customLines) return false;
            return state.Logs.customLines.some(line =>
                line.ingestion > 0 && line.retentionMonths === 0
            );
        },
        message: () => 'Log ingestion configured without retention',
        suggestions: [
            'Logs needs a retention of 1 month minimum',
            'Typical retention: 1-3 months',
            'For longer retention, consider Grafana Cloud Logs Export'
        ]
    },
    {
        id: 'logs-excessive-retention',
        type: 'info',
        icon: 'ℹ️',
        condition: (state) => {
            if (!state.Logs || !state.Logs.customLines) return false;
            return state.Logs.customLines.some(line => line.retentionMonths > 12);
        },
        message: () => 'Long log retention period detected',
        suggestions: [
            'Retention costs add up: $0.10 per GB per month',
            'Consider archiving old logs with Grafana Cloud Logs Export',
            'Evaluate if 12+ months of logs are actively queried'
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
        id: 'kubernetes-without-logs',
        type: 'info',
        icon: 'ℹ️',
        condition: (state) => {
            const hasK8s = (state['Kubernetes Monitoring - Host']?.options?.[0]?.quantity > 0) ||
                (state['Kubernetes Monitoring - Container']?.options?.[0]?.quantity > 0);
            const withLogs = state.Logs?.customLines.some(line => line.ingestion > 0);
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

// Load pricing data
function loadPricingData() {
    // Pricing data is now loaded from pricing.js
    pricingData = PRICING_DATA;
    initializeCalculator();
}

// Initialize calculator state
function initializeCalculator() {
    calculatorState = {};

    Object.keys(pricingData).forEach(category => {
        const categoryData = pricingData[category];

        // Handle custom line items (like Logs)
        if (categoryData.customLineItems) {
            calculatorState[category] = {
                collapsed: true,
                customLines: []
            };
            return;
        }

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
}

// Render the calculator UI
function renderCalculator() {
    const container = document.getElementById('pricingCategories');
    container.innerHTML = '';

    Object.keys(pricingData).forEach(category => {
        const categoryData = pricingData[category];

        // Handle custom line items
        if (categoryData.customLineItems) {
            const categoryCard = createCustomLineItemCard(category, categoryData);
            container.appendChild(categoryCard);
            return;
        }

        

        const categoryCard = createCategoryCard(category, categoryData);
        container.appendChild(categoryCard);
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

// Create a custom line item card (for Logs)
function createCustomLineItemCard(category, categoryData) {
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

    // Add pricing info
    const pricingInfo = document.createElement('div');
    pricingInfo.className = 'pricing-info';
    pricingInfo.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>Ingestion:</strong> ${formatCurrency(categoryData.ingestPrice)} per GB
        </div>
        <div style="margin-bottom: 15px;">
            <strong>Retention:</strong> ${formatCurrency(categoryData.retentionPrice)} per GB per month
        </div>
    `;
    content.appendChild(pricingInfo);

    // Add button to add new line
    const addButton = document.createElement('button');
    addButton.className = 'btn btn-add-line';
    addButton.textContent = '+ Add Log Environment';
    addButton.onclick = () => addCustomLine(category);
    content.appendChild(addButton);

    // Container for custom lines
    const linesContainer = document.createElement('div');
    linesContainer.id = `${category}-lines`;
    linesContainer.className = 'custom-lines-container';

    // Render existing lines
    calculatorState[category].customLines.forEach((line, index) => {
        const lineElement = createCustomLineElement(category, categoryData, line, index);
        linesContainer.appendChild(lineElement);
    });

    content.appendChild(linesContainer);

    card.appendChild(header);
    card.appendChild(content);

    return card;
}

// Create a custom line element
function createCustomLineElement(category, categoryData, line, index) {
    const div = document.createElement('div');
    div.className = 'custom-line-item';

    const ingestCost = line.ingestion * categoryData.ingestPrice;
    const retentionCost = line.ingestion * line.retentionMonths * categoryData.retentionPrice;
    const totalCost = calculateCustomLineCost(line, categoryData);

    div.innerHTML = `
        <div class="custom-line-header">
            <input type="text" 
                   class="line-name-input" 
                   placeholder="Environment name (e.g., Prod, Dev)" 
                   value="${line.name || ''}"
                   onchange="updateCustomLineName('${category}', ${index}, this.value)">
            <button class="btn-remove-line" onclick="removeCustomLine('${category}', ${index})">×</button>
        </div>
        <div class="custom-line-controls">
            <div class="control-group">
                <label>Ingestion (GB/month):</label>
                <input type="text" 
                       class="quantity-input"
                       value="${formatNumber(line.ingestion || 0)}"
                       onblur="updateCustomLineValue('${category}', ${index}, 'ingestion', this.value)"
                       onfocus="this.value = this.value.replace(/,/g, '')"
                       onkeypress="return event.charCode >= 48 && event.charCode <= 57 || event.charCode === 46">
            </div>
            <div class="control-group">
                <label>Retention (months):</label>
                <input type="text" 
                       class="quantity-input"
                       value="${formatNumber(line.retentionMonths || 0)}"
                       onblur="updateCustomLineValue('${category}', ${index}, 'retentionMonths', this.value)"
                       onfocus="this.value = this.value.replace(/,/g, '')"
                       onkeypress="return event.charCode >= 48 && event.charCode <= 57 || event.charCode === 46">
            </div>
        </div>
        <div class="custom-line-summary">
            <div>Ingestion cost: <strong>${formatCurrency(ingestCost)}</strong></div>
            <div>Retention cost: <strong>${formatCurrency(retentionCost)}</strong> (${formatNumber(line.ingestion)} GB × ${formatNumber(line.retentionMonths)} months)</div>
            <div class="line-total">Total: <strong>${formatCurrency(totalCost)}</strong></div>
        </div>
    `;

    return div;
}

// Add a new custom line
function addCustomLine(category) {
    calculatorState[category].customLines.push({
        name: '',
        ingestion: 0,
        retentionMonths: 0
    });
    renderCalculator();
    updateSummary();
}

// Remove a custom line
function removeCustomLine(category, index) {
    calculatorState[category].customLines.splice(index, 1);
    renderCalculator();
    updateSummary();
}

// Update custom line name
function updateCustomLineName(category, index, value) {
    calculatorState[category].customLines[index].name = value;
    updateSummary();
}

// Update custom line value
function updateCustomLineValue(category, index, field, value) {
    calculatorState[category].customLines[index][field] = parseFormattedNumber(value);
    renderCalculator();
    updateSummary();
}

// Calculate cost for a custom line
function calculateCustomLineCost(line, categoryData) {
    const ingestCost = line.ingestion * categoryData.ingestPrice;
    const retentionCost = line.ingestion * line.retentionMonths * categoryData.retentionPrice;
    return ingestCost + retentionCost;
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

        // Handle custom line items
        if (categoryData.customLineItems && calculatorState[category]) {
            calculatorState[category].customLines.forEach((line) => {
                const lineCost = calculateCustomLineCost(line, categoryData);
                if (lineCost > 0) {
                    categoryCost += lineCost;
                    categoryDetails.push({
                        name: line.name || 'Unnamed',
                        quantity: line.ingestion,
                        quantityDisplay: `${formatNumber(line.ingestion)} GB ingested, ${formatNumber(line.retentionMonths)} months retention`,
                        unitPrice: null,
                        unit: null,
                        pack: null,
                        cost: lineCost
                    });
                }
            });
        }
        // Handle regular options
        else if (categoryData.options && calculatorState[category]) {
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
                    let billableQuantity = quantity;
                    let quantityDisplay = formatNumber(quantity);

                    if (option.pack) {
                        const numPacks = Math.ceil(quantity / option.pack);
                        billableQuantity = numPacks;
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
    document.getElementById('totalPrice').textContent = formatCurrency(totalCost);

    // Update details
    const summaryDetails = document.getElementById('summaryDetails');
    summaryDetails.innerHTML = '';

    if (details.length === 0) {
        summaryDetails.innerHTML = '<p style="color: #666; text-align: center; padding: 20px;">No services configured yet</p>';
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
                } else {
                    // Custom line item display
                    itemsHtml += `
                        <div class="option-detail">
                            ${item.name}: ${item.quantityDisplay} = 
                            <span class="option-cost">${formatCurrency(item.cost)}</span>
                        </div>
                    `;
                }
            });

            detailCard.innerHTML = `
                <div class="category-name">${detail.category} - ${formatCurrency(detail.cost)}</div>
                ${itemsHtml}
            `;

            summaryDetails.appendChild(detailCard);
        });
    }

    // Add recommendations section
    displayRecommendations(calculatorState, totalCost);
}

// Display recommendations based on rules
function displayRecommendations(state, totalCost) {
    const recommendations = evaluateRecommendations(state, totalCost);

    // Find or create recommendations container
    let recommendationsContainer = document.getElementById('recommendationsContainer');
    if (!recommendationsContainer) {
        recommendationsContainer = document.createElement('div');
        recommendationsContainer.id = 'recommendationsContainer';
        recommendationsContainer.className = 'recommendations-section';
        document.getElementById('summaryContent').appendChild(recommendationsContainer);
    }

    // Clear previous recommendations
    recommendationsContainer.innerHTML = '';

    if (recommendations.length === 0) return;

    // Add header
    const header = document.createElement('h3');
    header.className = 'recommendations-header';
    header.textContent = 'Recommendations';
    recommendationsContainer.appendChild(header);

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

        recommendationsContainer.appendChild(card);
    });
}

// =============================================================================
// PREVENT ACCIDENTAL DATA LOSS
// =============================================================================

// Check if there's any meaningful data
function hasData() {
    let totalCost = 0;

    Object.keys(calculatorState).forEach(category => {
        const state = calculatorState[category];

        // Check custom lines
        if (state.customLines) {
            state.customLines.forEach(line => {
                if (line.ingestion > 0) totalCost += line.ingestion;
            });
        }

        // Check options
        if (state.options) {
            state.options.forEach(option => {
                if (option.quantity > 0) totalCost += option.quantity;
            });
        }
    });

    return totalCost > 0;
}

// Warn user before leaving if there's data
window.addEventListener('beforeunload', (e) => {
    if (hasData()) {
        e.preventDefault();
        e.returnValue = ''; // Modern browsers require this
        return ''; // Some older browsers
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

// Event listeners
document.getElementById('saveBtn').addEventListener('click', saveConfiguration);

document.getElementById('loadBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        loadConfiguration(e.target.files[0]);
        // Reset the input so the same file can be loaded again
        e.target.value = '';
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', loadPricingData);
