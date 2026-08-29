# GridNexus Layer 3: Power BI Audit Analytics Specification

This document provides the complete **DirectQuery** and **Data Model Specification** for Microsoft Power BI, connecting live to the GridNexus PostgreSQL audit ledger.

---

## 1. Overview & Data Sources

The report connects directly to the GridNexus PostgreSQL database containing append-only immutable audit records:
- `energytransfers`: Real-time energy transfer volume, prices, and participating microgrid IDs.
- `stabilitychecks`: Farsighted coalitional stability LP results (pass/fail, stability margin, violating deviations).
- `oraclesignals`: Exogenous Grid Oracle weather/stress broadcasts and model confidence scores.
- `negotiations`: Multi-agent Rubinstein bargaining sessions and convergence statuses.
- `beliefupdates`: Bayesian prior/posterior belief state updates and decision sources (`LLM` vs `DQN_GATE` vs `ORACLE`).

---

## 2. PostgreSQL Connection Setup

### Connection Parameters (Power BI Desktop / Gateway)

1. Open **Power BI Desktop** &rarr; **Get Data** &rarr; **PostgreSQL database**.
2. Enter the connection settings:
   - **Server**: `localhost:5432` (or container DNS `postgres:5432` / remote RDS host)
   - **Database**: `gridnexus`
   - **Data Connectivity Mode**: `DirectQuery` (recommended for real-time audit streaming) or `Import`
3. Under **Advanced options**, enter the SQL queries defined in Section 3 below.
4. Set credentials:
   - **User**: `postgres` (or dedicated read-only role `gridnexus_analyst`)
   - **Password**: `<DATABASE_PASSWORD>`
   - **Encryption / SSL**: `Require` (in staging/production)

---

## 3. DirectQuery Table Schemas & SQL Extraction

### Table 1: `Fact_EnergyTransfers`
```sql
SELECT 
    t.id AS transfer_id,
    t.frommicrogridid AS from_microgrid_id,
    t.tomicrogridid AS to_microgrid_id,
    t.amount::FLOAT AS amount_kwh,
    t.price::FLOAT AS price_per_kwh,
    (t.amount * t.price)::FLOAT AS total_trade_value_usd,
    t.stabilitycheckid AS stability_check_id,
    t.negotiationid AS negotiation_id,
    t.created_at AS transfer_timestamp,
    DATE_TRUNC('hour', t.created_at) AS transfer_hour
FROM energytransfers t;
```

### Table 2: `Fact_StabilityChecks`
```sql
SELECT 
    sc.id AS stability_check_id,
    sc.isstable AS is_stable,
    sc.margin::FLOAT AS stability_margin,
    sc.violatingdeviation AS violating_deviation,
    sc.created_at AS check_timestamp,
    DATE_TRUNC('hour', sc.created_at) AS check_hour
FROM stabilitychecks sc;
```

### Table 3: `Fact_OracleSignals`
```sql
SELECT 
    os.id AS signal_id,
    os.signaldata AS raw_signal_json,
    (os.signaldata::json->>'signal') AS signal_type,
    ((os.signaldata::json->>'confidence')::FLOAT) AS confidence_score,
    (os.signaldata::json->>'source') AS source_pipeline,
    (os.signaldata::json->>'reasoning') AS reasoning_text,
    os.created_at AS broadcast_timestamp,
    DATE_TRUNC('hour', os.created_at) AS broadcast_hour
FROM oraclesignals os;
```

### Table 4: `Fact_Negotiations`
```sql
SELECT 
    n.id AS negotiation_id,
    n.status AS final_status,
    n.created_at AS negotiation_timestamp
FROM negotiations n;
```

---

## 4. Entity-Relationship Data Model

```
        ┌─────────────────────────┐
        │    Fact_Negotiations    │
        └────────────┬────────────┘
                     │ (1 : N)
                     ▼
        ┌─────────────────────────┐        (1 : 1)       ┌─────────────────────────┐
        │   Fact_EnergyTransfers  │ ───────────────────► │  Fact_StabilityChecks   │
        └─────────────────────────┘                      └─────────────────────────┘
                     │ (N : 1)
                     ▼
        ┌─────────────────────────┐
        │   Fact_OracleSignals    │
        └─────────────────────────┘
```

- **Relationships**:
  - `Fact_EnergyTransfers[negotiation_id]` &rarr; `Fact_Negotiations[negotiation_id]` (Many-to-One, Single cross-filter)
  - `Fact_EnergyTransfers[stability_check_id]` &rarr; `Fact_StabilityChecks[stability_check_id]` (Many-to-One, Both cross-filter)

---

## 5. Core DAX Measures

### Trade Volume & Economics
```dax
Total Energy Traded (kWh) = 
SUM('Fact_EnergyTransfers'[amount_kwh])

Total Trade Volume ($) = 
SUM('Fact_EnergyTransfers'[total_trade_value_usd])

Weighted Average Price ($/kWh) = 
DIVIDE(
    [Total Trade Volume ($)],
    [Total Energy Traded (kWh)],
    0
)

Hourly Traded Volume Rolling 24h = 
CALCULATE(
    [Total Energy Traded (kWh)],
    DATESINPERIOD(
        'DateTable'[Date],
        LASTDATE('DateTable'[Date]),
        -1,
        DAY
    )
)
```

### Stability Gate Metrics
```dax
Total Stability Checks = 
COUNTROWS('Fact_StabilityChecks')

Stable Coalitions Count = 
CALCULATE(
    COUNTROWS('Fact_StabilityChecks'),
    'Fact_StabilityChecks'[is_stable] = TRUE
)

Unstable Coalitions Count = 
CALCULATE(
    COUNTROWS('Fact_StabilityChecks'),
    'Fact_StabilityChecks'[is_stable] = FALSE
)

Stability Gate Pass Rate = 
DIVIDE(
    [Stable Coalitions Count],
    [Total Stability Checks],
    1.0
)

Average Stability Margin = 
AVERAGE('Fact_StabilityChecks'[stability_margin])
```

### Oracle Broadcast Frequency & Impact
```dax
Total Oracle Broadcasts = 
COUNTROWS('Fact_OracleSignals')

Average Oracle Confidence = 
AVERAGE('Fact_OracleSignals'[confidence_score])

High Confidence Signals Count = 
CALCULATE(
    COUNTROWS('Fact_OracleSignals'),
    'Fact_OracleSignals'[confidence_score] >= 0.80
)
```

---

## 6. Report Dashboard Layout (3 Pages)

### Page 1: Trade Volume & Market Clearing
- **Header**: Active Virtual Power Plant Market Clearing Overview.
- **KPI Cards**: `Total Energy Traded (kWh)`, `Total Volume ($)`, `Weighted Avg Price ($/kWh)`.
- **Visual 1 (Area / Line Chart)**: `amount_kwh` and `price_per_kwh` by `transfer_hour`.
- **Visual 2 (Bar Chart)**: Energy Transferred by `from_microgrid_id` and `to_microgrid_id`.
- **Visual 3 (Table Visual)**: Recent settled transactions with linked Stability Check IDs.

### Page 2: Farsighted Coalitional Stability Gate
- **Header**: Farsighted Coalitional Stability & LP Verification.
- **KPI Cards**: `Stability Gate Pass Rate` (Target: > 90%), `Average Stability Margin`, `Unstable Blocked`.
- **Visual 1 (Donut Chart)**: Stable Approved vs Unstable Blocked coalitions.
- **Visual 2 (Histogram / Scatter)**: Distribution of `stability_margin` across coalition sizes.
- **Visual 3 (Matrix)**: Violating deviations list with blocked microgrid coalitions.

### Page 3: Oracle Exogenous Signals & Bayesian Alignment
- **Header**: Grid Oracle Bayesian Persuasion & Weather Stress Signals.
- **KPI Cards**: `Total Oracle Broadcasts`, `Avg Confidence Score`, `High Confidence Signals`.
- **Visual 1 (Column Chart)**: Broadcasts count per hour grouped by `signal_type`.
- **Visual 2 (Scatter Plot)**: `confidence_score` vs `amount_kwh` in subsequent hour.
- **Visual 3 (Feed / Table)**: Signal audit trail with full reasoning texts.

---

## 7. Power BI Embedded Token Configuration

To embed this report inside the GridNexus Command Center React app:
1. Register Azure AD App with Power BI Service permissions (`Report.Read.All`).
2. Generate Embed Token using the Power BI REST API:
   ```http
   POST https://api.powerbi.com/v1.0/myorg/groups/{workspaceId}/reports/{reportId}/GenerateToken
   { "accessLevel": "View" }
   ```
3. Pass `embedUrl` and `accessToken` via `VITE_POWERBI_EMBED_URL` into `PowerBIPanel.tsx`.
4. If no live Power BI server is configured, `PowerBIPanel.tsx` automatically displays the interactive client-side dashboard with live data from the broker `/api/analytics` endpoint.
