'use strict';
const os = require('os');
const express = require('express');
const {v4: uuidv4} = require('uuid');

const {DiagConsoleLogger, DiagLogLevel, ValueType, diag} = require('@opentelemetry/api');
const {OTLPMetricExporter} = require('@opentelemetry/exporter-metrics-otlp-proto');

const {
  ExponentialHistogramAggregation, MeterProvider, PeriodicExportingMetricReader, View,
} = require('@opentelemetry/sdk-metrics');
const {Resource} = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes,
} = require('@opentelemetry/semantic-conventions');


const otlpEndpoint = process.env.OTLP_ENDPOINT;
const collectorResourcePath = process.env.OTLP_COLLECTOR_RESOURCE_PATH || 'v1/metrics';
const collectorHostAddress = process.env.OTLP_COLLECTOR_HOST_ADDRESS || 'localhost:4318';
const collectorUrl = `${collectorHostAddress}/${collectorResourcePath}`;
const port = parseInt(process.env.APPLICATION_PORT || '8080');
const app = express();


// Optional and only needed to see the internal diagnostic logging (during development)
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

console.log('Collector URL:', collectorUrl);
const collectorOptions = {
	url: collectorUrl,
};

const metricExporter = new OTLPMetricExporter(collectorOptions);

// Create an instance of the metric provider
const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "my-service",
  }),
});

meterProvider.addMetricReader(new PeriodicExportingMetricReader({
  exporter: metricExporter, // exporter: new ConsoleMetricExporter(),
  exportIntervalMillis: 10000,
}));


const meter = meterProvider.getMeter('example-meter');


// Create a histogram
const requestsLatency = meter.createHistogram("http_request_duration_second", {
  description: "Latency of a service",
});

// Create a counter
const requestsCount = meter.createCounter("http_requests_total", {
  description: "Throughput of a service",
});

// Create an updown counter
const activeRequests = meter.createUpDownCounter("http_active_requests", {
	description: "Number of active requests",
});

// middleware to record the number of active requests, throughputs and latencies
app.use((req, res, next) => {
	activeRequests.add(1);

	const startTime = new Date().getTime();

	res.on('finish', () => {
		const endTime = new Date().getTime();
		const duration = endTime - startTime;

		requestsCount.add(1);
		requestsLatency.record(duration);
		activeRequests.add(-1);

		console.log(`Request ${req.method} ${req.originalUrl} took ${duration}ms`)
	});

	next();
});


app.get('/api/fast', (req, res) => {
	res.send('fast ok');
});

app.get('/api/slow', (req, res) => {
	// sleep for 2 seconds then send response
	setTimeout(() => {
		res.send('slow ok');
	}, 2000);
});

// Start the server
app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});


