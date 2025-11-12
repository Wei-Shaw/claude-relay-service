# Relay Metrics Docker Stack

This directory provides a self-contained Docker Compose stack for collecting usage metrics from the Claude Relay Service and forwarding them to Grafana Alloy. The `relay-metrics` container periodically calls the relay API, transforms the statistics into OpenTelemetry metrics, and pushes them to the local Alloy instance plus any remote exporters you configure.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- A reachable Claude Relay HTTP endpoint (`RELAY_BASE_URL`)
- Relay credentials: either `RELAY_API_KEY` or `RELAY_API_ID`

## Quick start

1. Copy the sample environment file and fill in the required values:

   ```bash
   cd scripts/relay-metrics
   cp .env.example .env
   # update RELAY_BASE_URL and your chosen credential
   ```

2. Review `.env` to point the publisher at your collector. By default it ships metrics to the bundled Alloy instance (`OTEL_EXPORT_URL=http://alloy:4318/v1/metrics`). To send data directly to GreptimeDB set:
   - `OTEL_EXPORT_URL=https://7oj75cvwcno3.us-west-2.aws.greptime.cloud/v1/metrics`
   - `OTEL_EXPORT_HEADERS={"X-Greptime-DB-Name":"<your-db-name>"}`
   - `OTEL_EXPORT_BASIC_AUTH_USERNAME` / `OTEL_EXPORT_BASIC_AUTH_PASSWORD`

3. Review `config/alloy/config.alloy` if you need to expose different ports or forward metrics elsewhere. The defaults expose:
   - Alloy UI at `http://localhost:12345`
   - OTLP (HTTP/GRPC) endpoints for the relay collector on the internal Docker network.

4. Start the stack:

   ```bash
   docker compose up -d
   ```

5. Tail the metrics publisher logs to confirm successful exports:

   ```bash
   docker compose logs -f relay-metrics
   ```

6. Access the Alloy debug UI for verification:
   - UI: <http://localhost:12345>

Stop the stack with `docker compose down` when you are finished.

## Remote export (GreptimeDB)

The Alloy configuration now includes an OTLP HTTP exporter pointing at GreptimeDB. Populate the following variables in `.env` (defaults are present in `.env.example`):

- `ALLOY_GREPTIME_ENDPOINT`
- `ALLOY_GREPTIME_DB_NAME`
- `ALLOY_GREPTIME_USERNAME`
- `ALLOY_GREPTIME_PASSWORD`

Alloy injects these values into the exporter and authenticates using basic auth credentials provided via the same file. If you bypass Alloy and point the Node publisher straight at GreptimeDB, reuse the same credentials via `OTEL_EXPORT_BASIC_AUTH_USERNAME` / `OTEL_EXPORT_BASIC_AUTH_PASSWORD`.

## Configuration reference

- `relay-metrics` container settings are sourced from `.env`. The script requires `RELAY_BASE_URL` and either `RELAY_API_KEY` or `RELAY_API_ID`.
- Stats polling cadence is controlled by `RELAY_STATS_POLL_INTERVAL` (e.g., `10s`, `1m`).
- OpenTelemetry exporter defaults to `http://alloy:4318/v1/metrics`, aligning with the Alloy OTLP HTTP receiver defined in `config.alloy`.
- Alloy runtime options, including GreptimeDB exporter credentials, are controlled through the same `.env` file (`ALLOY_PORT`, `ALLOY_*`, etc.).
- Customize OpenTelemetry resource labels with `OTEL_SERVICE_NAME`, `OTEL_SERVICE_NAMESPACE`, `OTEL_SERVICE_VERSION`, or `RELAY_ENVIRONMENT` to improve downstream series labels.

## Development tips

- Update the publish cadence via `OTEL_PUSH_INTERVAL_MS` and the stats polling loop via `RELAY_STATS_POLL_INTERVAL`.
- The metrics transformer lives in `scripts/relay-metrics/metricsAggregator.js`. Run the local Jest suite from the repository root with `npm test`.
- If you forward metrics to another backend, extend `config/alloy/config.alloy` with additional exporters (for example, `prometheus.remote_write`).
