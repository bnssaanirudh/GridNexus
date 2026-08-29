# GridNexus Layer 3: R Shiny Geospatial Planar Graph

This directory contains the R Shiny geospatial mapping module for GridNexus, plotting the physical planar graph of microgrid power lines with real-time energy routing and line utilization.

## Features

- **Planar Graph Rendering**: Uses `leaflet` and `sf` geometries to plot microgrid nodes and planar transmission lines.
- **Dynamic Line Utilization**: Lines change color (Green `<50%`, Amber `50-80%`, Red `>80%`) and line weight based on current power flow in `energytransfers`.
- **Node Sizing by Capacity**: Microgrid markers dynamically scale with pooled battery/generation capacity (kWh) and highlight active VPP coalition members.
- **Sub-5-Second Live Refresh**: Polling interval set to 3 seconds (`reactiveTimer(3000)`) against the broker `/api/topology` endpoint.
- **Dark-Theme Aesthetics**: Styled with the GridNexus design system (`#232629` dark charcoal, `#2AA9FF` electric blue, `#F5A623` ochre alert).

---

## Local Setup & Execution

### Prerequisites

- R (>= 4.2.0)
- R Packages: `shiny`, `leaflet`, `sf`, `jsonlite`, `httr`, `bslib`

Install required packages:
```r
install.packages(c("shiny", "leaflet", "sf", "jsonlite", "httr", "bslib"))
```

### Running the App

Run the Shiny app locally on port `3838`:
```bash
Rscript -e "shiny::runApp('command-center/geospatial', port = 3838, host = '0.0.0.0')"
```

Or from inside R / RStudio:
```r
shiny::runApp("command-center/geospatial", port = 3838)
```

### Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BROKER_URL` | `http://localhost:3000` | Base URL of the GridNexus broker API |
| `SHINY_POLL_INTERVAL_MS` | `3000` | Polling frequency in milliseconds (< 5000 ms) |
| `SHINY_PORT` | `3838` | Port for the Shiny web server |

---

## Production Deployment & iframe Embedding

### 1. Standalone / Docker Container
A minimal Dockerfile for the Shiny module:
```dockerfile
FROM rocker/geospatial:4.3.0
RUN install2.r --error shiny leaflet jsonlite httr
WORKDIR /app
COPY app.R .
EXPOSE 3838
CMD ["R", "-e", "shiny::runApp('/app', port = 3838, host = '0.0.0.0')"]
```

### 2. ShinyProxy Integration
In a multi-user Kubernetes / enterprise setup, configure `application.yml` for ShinyProxy:
```yaml
proxy:
  specs:
    - id: gridnexus-geospatial
      display-name: GridNexus Geospatial Planar Graph
      container-image: gridnexus/geospatial:latest
      port: 3838
```

### 3. React iframe Embedding
The React command-center embeds this app via `GeoPanel.tsx`:
```tsx
<iframe
  src={import.meta.env.VITE_SHINY_URL || "http://localhost:3838"}
  title="GridNexus Geospatial Planar Graph"
  className="shiny-embed-frame"
  sandbox="allow-scripts allow-same-origin allow-popups"
  loading="lazy"
/>
```
If the external Shiny server is not currently running, `GeoPanel.tsx` automatically falls back to an in-process interactive SVG/canvas planar visualizer with the identical live data feed.
