#!/usr/bin/env node
const { MeterProvider, PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http')
const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api')

const loadConfiguration = require('./configuration')
const StatsClient = require('./statsClient')
const deriveMetrics = require('./metricsAggregator')
const crypto = require('crypto')

const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')

const RelayMetricsCollector = require('./relayMetricsCollector')

const DEFAULT_SERVICE_NAME = 'relay-metrics'
const DEFAULT_SERVICE_NAMESPACE = 'claude-relay'

const METRIC_DEFINITIONS = [
  {
    name: 'relay_requests_total',
    description: 'Total requests processed by the relay API key'
  },
  {
    name: 'relay_tokens_total',
    description: 'Total tokens consumed by the relay API key'
  },
  {
    name: 'relay_input_tokens_total',
    description: 'Input tokens consumed by the relay API key'
  },
  {
    name: 'relay_output_tokens_total',
    description: 'Output tokens consumed by the relay API key'
  },
  {
    name: 'relay_cache_create_tokens_total',
    description: 'Cache create tokens consumed by the relay API key'
  },
  {
    name: 'relay_cache_read_tokens_total',
    description: 'Cache read tokens consumed by the relay API key'
  },
  {
    name: 'relay_cost_total_usd',
    description: 'Total USD cost attributed to the relay API key'
  },
  {
    name: 'relay_current_window_requests',
    description: 'Requests counted in the active rate-limit window'
  },
  {
    name: 'relay_current_window_tokens',
    description: 'Tokens counted in the active rate-limit window'
  },
  {
    name: 'relay_current_window_cost_usd',
    description: 'USD cost accumulated in the active rate-limit window'
  },
  {
    name: 'relay_current_window_seconds_remaining',
    description: 'Seconds remaining in the active rate-limit window'
  },
  {
    name: 'relay_rate_limit_requests_limit',
    description: 'Maximum requests allowed per rate-limit window'
  },
  {
    name: 'relay_rate_limit_window_minutes',
    description: 'Length of the rate-limit window in minutes'
  },
  {
    name: 'relay_rate_limit_cost_limit_usd',
    description: 'USD cost threshold for the active rate-limit window'
  },
  {
    name: 'relay_daily_cost_usd',
    description: 'USD cost incurred during the current day'
  },
  {
    name: 'relay_daily_cost_limit_usd',
    description: 'USD cost ceiling configured for the current day'
  },
  {
    name: 'relay_total_cost_limit_usd',
    description: 'Overall USD cost ceiling for the relay API key'
  },
  {
    name: 'relay_weekly_opus_cost_usd',
    description: 'USD spent on Opus tier usage in the current week'
  },
  {
    name: 'relay_weekly_opus_cost_limit_usd',
    description: 'USD cost ceiling for Opus tier usage in the current week'
  },
  {
    name: 'relay_token_limit',
    description: 'Total token limit configured for the relay API key'
  },
  {
    name: 'relay_concurrency_limit',
    description: 'Maximum concurrent requests allowed for the relay API key'
  },
  {
    name: 'relay_model_tokens',
    description: 'Tokens consumed for a specific model by the relay API key'
  },
  {
    name: 'relay_model_cost_usd',
    description: 'USD cost for a specific model by the relay API key'
  },
  {
    name: 'relay_stats_staleness_seconds',
    description: 'Seconds since the last successful stats poll'
  }
]

const DEPLOYMENT_ENVIRONMENT_ATTR =
  SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT || 'deployment.environment'
const SERVICE_ENDPOINT_ATTR =
  SemanticResourceAttributes.SERVICE_ENDPOINT || 'service.endpoint'

function createResource(config) {
  const attrs = {
    [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: process.env.OTEL_SERVICE_NAMESPACE || DEFAULT_SERVICE_NAMESPACE,
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION || '1.0.0'
  }

  const environment = process.env.RELAY_ENVIRONMENT || process.env.NODE_ENV
  if (environment) {
    attrs[DEPLOYMENT_ENVIRONMENT_ATTR] = environment
  }

  const credentialValue = config.credential?.value
  if (credentialValue) {
    const instanceId = crypto.createHash('sha256').update(credentialValue).digest('hex').slice(0, 16)
    attrs[SemanticResourceAttributes.SERVICE_INSTANCE_ID] = instanceId
  }

  if (config.baseUrl) {
    attrs[SERVICE_ENDPOINT_ATTR] = config.baseUrl
  }

  return new Resource(attrs)
}

function createMeterProvider(config) {
  const exporter = new OTLPMetricExporter({
    url: config.otlpUrl,
    timeoutMillis: config.requestTimeoutMs,
    headers: config.otlpHeaders
  })

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: config.pushIntervalMs
  })

  return new MeterProvider({
    resource: createResource(config),
    readers: [reader]
  })
}

function createInstruments(meter) {
  const instrumentMap = new Map()

  for (const definition of METRIC_DEFINITIONS) {
    instrumentMap.set(
      definition.name,
      meter.createObservableGauge(definition.name, {
        description: definition.description
      })
    )
  }

  return instrumentMap
}

async function main() {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR)

  const config = loadConfiguration()
  const statsClient = new StatsClient({
    baseUrl: config.baseUrl,
    credential: config.credential,
    requestTimeoutMs: config.requestTimeoutMs,
    metricsPeriod: config.metricsPeriod
  })

  const relayCollector = new RelayMetricsCollector({
    statsClient,
    deriveMetrics,
    pollIntervalMs: config.statsPollIntervalMs,
    logger: console
  })

  await relayCollector.start()

  const meterProvider = createMeterProvider(config)
  const meter = meterProvider.getMeter('claude-relay-metrics')
  const instruments = createInstruments(meter)

  meter.addBatchObservableCallback(async (observableResult) => {
    try {
      const samples = relayCollector.getMetrics()

      for (const sample of samples) {
        const instrument = instruments.get(sample.name)
        if (!instrument) {
          continue
        }
        observableResult.observe(instrument, sample.value, sample.attributes)
      }

      const stalenessInstrument = instruments.get('relay_stats_staleness_seconds')
      if (stalenessInstrument) {
        const lastUpdated = relayCollector.getLastUpdated()
        const ageSeconds = lastUpdated > 0 ? Math.max(0, (Date.now() - lastUpdated) / 1000) : 0
        observableResult.observe(stalenessInstrument, ageSeconds, {})
      }
    } catch (error) {
      console.error('[relay-metrics] collection failed:', error.message)
    }
  }, [...instruments.values()])

  console.log('[relay-metrics] metrics publisher is running')

  const keepAlive = setInterval(() => {}, 60_000)

  await waitForShutdown({ meterProvider, keepAlive, relayCollector })
}

async function waitForShutdown({ meterProvider, keepAlive, relayCollector }) {
  const signals = ['SIGINT', 'SIGTERM']

  await new Promise((resolve) => {
    const handle = async (signal) => {
      try {
        console.log(`[relay-metrics] received ${signal}, shutting down`)
        clearInterval(keepAlive)
        relayCollector?.stop()
        await meterProvider.shutdown()
      } catch (error) {
        console.error('[relay-metrics] shutdown error:', error.message)
      } finally {
        resolve()
      }
    }

    for (const signal of signals) {
      process.on(signal, handle)
    }
  })
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[relay-metrics] fatal error:', error)
    process.exitCode = 1
  })
}

module.exports = {
  createMeterProvider,
  createInstruments,
  main
}
