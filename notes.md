# Grafana Cloud Pricing Calculator

An attempt to make a simple interactive pricing calculator for Grafana Cloud services.

## Features

- ✅ **Custom Log Environments** - Add multiple log configurations with individual ingestion and retention settings
- ✅ **Real-time Summary** - Live cost summary updates as you configure services
- ✅ **Save/Load Configuration** - Export and import your pricing configurations as JSON

## Pricing Categories

The calculator does not support the following Grafana Cloud services:

- **k6** - defer to the k6 calculator
- any services published since latest release


## Deployment

### GitHub Pages

1. Upload all files: `index.html`, `styles.css`, `app.js`, `pricing.json`
2. Go to repository Settings → Pages
3. Under "Source", select "Deploy from a branch"
4. Select the branch to deploy
5. The calculator will be available at `https://[username].github.io/[repository-name]`

## Local Development

```bash
# Using Python 3
python -m http.server 8000
# Then open http://localhost:8000 in your browser
```

## Customizing Pricing

To update pricing data, edit `pricing.json`. The structure supports:

### Standard Options
- **optionsExclusive: true** - User must select one option (radio buttons)
- **optionsExclusive: false** - User can select multiple options with quantities
- **Single option** - Simple quantity × price calculation
- **pack** - Automatic pack-based pricing (rounds up to nearest pack, e.g. per 10,000 sessions)

### Custom Line Items (Logs)
For logs, the logic is custom.
```json
{
    "Logs": {
        "unit": "Per GB ingested",
        "customLineItems": true,
        "ingestPrice": 0.40,
        "retentionPrice": 0.10,
        "description": "Add custom log environments with ingestion and retention settings"
    }
}
```

The app.js will let user create multiple lines with different quantities and retention.
