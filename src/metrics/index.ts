/**
 * RLM Metrics Module
 * Provides observability for RLM instances
 */

export { metricsCollector, type QueryMetric, type MetricsConfig } from "./collector.js";
export { metricsRouter } from "./api.js";
