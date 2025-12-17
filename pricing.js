// Pricing data for Grafana Cloud Calculator
const PRICING_DATA = {
    "Visualization": {
        "unit": "Per monthly active user",
        "description": "Only one model is possible for the whole organization.",
        "options": [
            {
                "name": "Base",
                "price": 15
            },
            {
                "name": "Base with single Enterprise plugin",
                "price": 40
            },
            {
                "name": "Base with all Enterprise plugins",
                "price": 55
            }
        ],
        "optionsExclusive": true
    },
    "IRM": {
        "unit": "Per monthly active user",
        "options": [
            {
                "price": 20
            }
        ]
    },
    "Metrics": {
        "unit": "Per 1,000 billable series",
        "description": "By default, choose low resolution.",
        "options": [
            {
                "name": "Low resolution",
                "pack": 1000,
                "price": 6.50
            },
            {
                "name": "High resolution",
                "pack": 1000,
                "price": 16
            }
        ],
        "optionsExclusive": true
    },
    "Logs": {
        "unit": "Per GB ingested",
        "description": "Ingestion and retention costs are calculated separately. Retention is charged per month.",
        "customLineItems": true,
        "ingestPrice": 0.40,
        "retentionPrice": 0.10
    },
    "Traces": {
        "unit": "Per GB ingested",
        "options": [
            {
                "price": 0.50
            }
        ]
    },
    "Profiles": {
        "unit": "Per GB ingested",
        "options": [
            {
                "price": 0.50
            }
        ]
    },
    "k6": {
        "unit": "Per virtual user hour",
        "options": [
            {
                "price": 0.15
            }
        ]
    },
    "Frontend Observability": {
        "unit": "Per 1,000 sessions",
        "options": [
            {
                "price": 0.90,
                "pack": 1000
            }
        ]
    },
    "Application Observability": {
        "unit": "Per host hour",
        "description": "The price is per host-hour. To simplify, this calculator considers 730h/month.",
        "options": [
            {
                "price": 29.2
            }
        ]
    },
    "Kubernetes Monitoring - Host": {
        "unit": "Per host hour",
        "description": "The price is per host-hour. To simplify, this calculator considers 730h/month.",
        "options": [
            {
                "price": 10.95
            }
        ]
    },
    "Kubernetes Monitoring - Container": {
        "unit": "Per container hour",
        "description": "The price is per container-hour. To simplify, this calculator considers 730h/month.",
        "options": [
            {
                "price": 0.73
            }
        ]
    },
    "Synthetics - API Testing": {
        "unit": "Per 10,000 test executions",
        "options": [
            {
                "name": "API Testing",
                "price": 5.00,
                "pack": 10000
            }
        ]
    },
    "Synthetics - Browser Testing": {
        "unit": "Per 10,000 test executions",
        "options": [
            {
                "name": "Browser Testing",
                "price": 50.00,
                "pack": 10000
            }
        ]
    }
};
