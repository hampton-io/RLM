/**
 * Log Analysis Example
 *
 * Demonstrates RLM's ability to analyze log files for:
 * - Parsing various log formats (Apache, nginx, application)
 * - Finding error patterns and anomalies
 * - Detecting anomalies in traffic patterns
 * - Timeline reconstruction of incidents
 * - Root cause analysis
 *
 * Run with: npx tsx examples/log-analysis.ts [--format apache|nginx|app]
 */

import { RLM, analyzeTemplate, render } from '../src/index.js';
import * as fs from 'fs';

interface LogEntry {
  timestamp: string;
  level?: string;
  source?: string;
  message: string;
  raw: string;
}

interface ErrorPattern {
  pattern: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  severity: 'critical' | 'error' | 'warning' | 'info';
  examples: string[];
}

interface Anomaly {
  type: 'spike' | 'drop' | 'unusual_pattern' | 'new_error';
  timestamp: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  relatedEntries: number[];
}

interface Timeline {
  events: TimelineEvent[];
  duration: string;
  summary: string;
}

interface TimelineEvent {
  timestamp: string;
  event: string;
  significance: 'high' | 'medium' | 'low';
}

interface RootCauseAnalysis {
  summary: string;
  rootCause: string;
  contributingFactors: string[];
  timeline: string[];
  recommendations: string[];
  confidence: 'high' | 'medium' | 'low';
}

interface LogAnalysisResult {
  summary: string;
  errorPatterns: ErrorPattern[];
  anomalies: Anomaly[];
  timeline: Timeline;
  rootCause?: RootCauseAnalysis;
  statistics: {
    totalEntries: number;
    errorCount: number;
    warningCount: number;
    timeRange: string;
    topErrors: { error: string; count: number }[];
  };
}

/**
 * Sample log data for different formats.
 */
const SAMPLE_LOGS = {
  apache: `192.168.1.100 - - [15/Jan/2024:10:00:01 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
192.168.1.101 - - [15/Jan/2024:10:00:02 +0000] "GET /api/products HTTP/1.1" 200 5678 "-" "Mozilla/5.0"
192.168.1.102 - - [15/Jan/2024:10:00:03 +0000] "POST /api/login HTTP/1.1" 200 89 "-" "Mozilla/5.0"
192.168.1.103 - - [15/Jan/2024:10:00:05 +0000] "GET /api/orders/123 HTTP/1.1" 500 45 "-" "Mozilla/5.0"
192.168.1.100 - - [15/Jan/2024:10:00:06 +0000] "GET /api/orders/124 HTTP/1.1" 500 45 "-" "Mozilla/5.0"
192.168.1.104 - - [15/Jan/2024:10:00:07 +0000] "GET /api/orders/125 HTTP/1.1" 500 45 "-" "Mozilla/5.0"
192.168.1.105 - - [15/Jan/2024:10:00:08 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
192.168.1.106 - - [15/Jan/2024:10:00:09 +0000] "GET /api/orders/126 HTTP/1.1" 500 45 "-" "Mozilla/5.0"
192.168.1.107 - - [15/Jan/2024:10:00:10 +0000] "POST /api/checkout HTTP/1.1" 503 0 "-" "Mozilla/5.0"
192.168.1.108 - - [15/Jan/2024:10:00:11 +0000] "POST /api/checkout HTTP/1.1" 503 0 "-" "Mozilla/5.0"
192.168.1.109 - - [15/Jan/2024:10:00:12 +0000] "GET /api/health HTTP/1.1" 200 15 "-" "HealthChecker/1.0"
192.168.1.110 - - [15/Jan/2024:10:00:15 +0000] "GET /api/orders/127 HTTP/1.1" 200 890 "-" "Mozilla/5.0"
192.168.1.111 - - [15/Jan/2024:10:00:16 +0000] "GET /api/products HTTP/1.1" 200 5678 "-" "Mozilla/5.0"
192.168.1.112 - - [15/Jan/2024:10:00:17 +0000] "POST /api/login HTTP/1.1" 401 23 "-" "Mozilla/5.0"
192.168.1.112 - - [15/Jan/2024:10:00:18 +0000] "POST /api/login HTTP/1.1" 401 23 "-" "Mozilla/5.0"
192.168.1.112 - - [15/Jan/2024:10:00:19 +0000] "POST /api/login HTTP/1.1" 401 23 "-" "Mozilla/5.0"
192.168.1.112 - - [15/Jan/2024:10:00:20 +0000] "POST /api/login HTTP/1.1" 429 18 "-" "Mozilla/5.0"
192.168.1.113 - - [15/Jan/2024:10:00:22 +0000] "GET /api/users HTTP/1.1" 200 1234 "-" "Mozilla/5.0"
192.168.1.114 - - [15/Jan/2024:10:00:25 +0000] "GET /../../../etc/passwd HTTP/1.1" 400 0 "-" "curl/7.68.0"
192.168.1.100 - - [15/Jan/2024:10:00:28 +0000] "GET /api/orders HTTP/1.1" 200 4567 "-" "Mozilla/5.0"
192.168.1.115 - - [15/Jan/2024:10:00:30 +0000] "POST /api/upload HTTP/1.1" 413 0 "-" "Mozilla/5.0"`,

  nginx: `2024/01/15 10:00:01 [error] 1234#1234: *100 connect() failed (111: Connection refused) while connecting to upstream
2024/01/15 10:00:02 [warn] 1234#1234: *101 an upstream response is buffered to a temporary file
2024/01/15 10:00:03 [info] 1234#1234: *102 client 192.168.1.100 connected
2024/01/15 10:00:05 [error] 1234#1234: *103 upstream timed out (110: Connection timed out) reading response header
2024/01/15 10:00:06 [error] 1234#1234: *104 upstream timed out (110: Connection timed out) reading response header
2024/01/15 10:00:07 [crit] 1234#1234: *105 SSL_do_handshake() failed (SSL: error:1408F119:SSL routines)
2024/01/15 10:00:08 [error] 1234#1234: *106 connect() failed (111: Connection refused) while connecting to upstream
2024/01/15 10:00:09 [error] 1234#1234: *107 connect() failed (111: Connection refused) while connecting to upstream
2024/01/15 10:00:10 [warn] 1234#1234: *108 upstream server temporarily disabled while connecting to upstream
2024/01/15 10:00:12 [info] 1234#1234: *109 client closed connection while waiting for request
2024/01/15 10:00:15 [error] 1234#1234: *110 open() "/var/www/html/admin.php" failed (2: No such file or directory)
2024/01/15 10:00:16 [error] 1234#1234: *111 upstream prematurely closed connection
2024/01/15 10:00:18 [alert] 1234#1234: worker process 5678 exited on signal 9
2024/01/15 10:00:20 [notice] 1234#1234: worker process 5679 started
2024/01/15 10:00:22 [error] 1234#1234: *112 connect() failed (111: Connection refused) while connecting to upstream
2024/01/15 10:00:25 [info] 1234#1234: *113 upstream server is back online`,

  app: `2024-01-15T10:00:01.234Z INFO  [main] Application starting up
2024-01-15T10:00:01.345Z INFO  [main] Loading configuration from /etc/app/config.yaml
2024-01-15T10:00:01.456Z INFO  [main] Database connection pool initialized (size: 20)
2024-01-15T10:00:01.567Z INFO  [main] Application ready, listening on port 8080
2024-01-15T10:00:05.123Z DEBUG [http] Incoming request: GET /api/users from 192.168.1.100
2024-01-15T10:00:05.234Z DEBUG [db] Executing query: SELECT * FROM users WHERE active = true
2024-01-15T10:00:05.456Z INFO  [http] Response sent: 200 OK (232ms)
2024-01-15T10:00:08.789Z ERROR [db] Connection failed: ECONNREFUSED connecting to postgres:5432
2024-01-15T10:00:08.890Z WARN  [db] Retrying database connection (attempt 1/3)
2024-01-15T10:00:09.123Z ERROR [db] Connection failed: ECONNREFUSED connecting to postgres:5432
2024-01-15T10:00:09.234Z WARN  [db] Retrying database connection (attempt 2/3)
2024-01-15T10:00:09.456Z ERROR [db] Connection failed: ECONNREFUSED connecting to postgres:5432
2024-01-15T10:00:09.567Z ERROR [db] All retry attempts exhausted, marking database as unavailable
2024-01-15T10:00:09.678Z ERROR [http] Request failed: GET /api/orders - DatabaseUnavailableError
2024-01-15T10:00:10.123Z ERROR [http] Request failed: POST /api/checkout - DatabaseUnavailableError
2024-01-15T10:00:10.234Z WARN  [health] Health check failing: database connection lost
2024-01-15T10:00:12.345Z INFO  [scheduler] Triggering scheduled job: cleanup-expired-sessions
2024-01-15T10:00:12.456Z ERROR [scheduler] Job failed: cleanup-expired-sessions - DatabaseUnavailableError
2024-01-15T10:00:15.567Z INFO  [db] Database connection restored
2024-01-15T10:00:15.678Z INFO  [health] Health check passing: all services healthy
2024-01-15T10:00:16.789Z DEBUG [http] Incoming request: GET /api/users from 192.168.1.101
2024-01-15T10:00:16.890Z DEBUG [db] Executing query: SELECT * FROM users WHERE active = true
2024-01-15T10:00:17.012Z INFO  [http] Response sent: 200 OK (123ms)
2024-01-15T10:00:20.123Z WARN  [auth] Failed login attempt for user: admin from IP: 192.168.1.200
2024-01-15T10:00:21.234Z WARN  [auth] Failed login attempt for user: admin from IP: 192.168.1.200
2024-01-15T10:00:22.345Z WARN  [auth] Failed login attempt for user: admin from IP: 192.168.1.200
2024-01-15T10:00:23.456Z ERROR [auth] Account locked: admin - too many failed attempts
2024-01-15T10:00:25.567Z WARN  [security] Suspicious activity detected: path traversal attempt from 192.168.1.199
2024-01-15T10:00:28.678Z INFO  [cache] Cache miss ratio exceeded threshold: 45% (threshold: 30%)
2024-01-15T10:00:30.789Z DEBUG [http] Incoming request: POST /api/upload from 192.168.1.102
2024-01-15T10:00:30.890Z WARN  [http] Request entity too large: 15MB (max: 10MB)
2024-01-15T10:00:31.012Z INFO  [metrics] Exported 1234 metrics to Prometheus`,
};

/**
 * Create log context for analysis.
 */
function createLogContext(logs: string, format: string): string {
  return `LOG FILE ANALYSIS
Format: ${format}
${'='.repeat(80)}

LOG ENTRIES:
${'='.repeat(80)}
${logs}
${'='.repeat(80)}`;
}

/**
 * Parse analysis response into structured result.
 */
function parseAnalysisResponse(response: string): Partial<LogAnalysisResult> {
  const result: Partial<LogAnalysisResult> = {
    errorPatterns: [],
    anomalies: [],
  };

  // Try to extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.summary) result.summary = parsed.summary;
      if (parsed.errorPatterns) result.errorPatterns = parsed.errorPatterns;
      if (parsed.anomalies) result.anomalies = parsed.anomalies;
      if (parsed.timeline) result.timeline = parsed.timeline;
      if (parsed.rootCause) result.rootCause = parsed.rootCause;
      if (parsed.statistics) result.statistics = parsed.statistics;
    } catch {
      // Extract summary from text
      result.summary = response.slice(0, 500);
    }
  } else {
    result.summary = response.slice(0, 500);
  }

  return result;
}

/**
 * Generate a markdown analysis report.
 */
function generateAnalysisReport(
  analysis: Partial<LogAnalysisResult>,
  format: string
): string {
  let report = `# Log Analysis Report\n\n`;
  report += `**Format:** ${format}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;

  // Summary
  if (analysis.summary) {
    report += `## Summary\n\n${analysis.summary}\n\n`;
  }

  // Statistics
  if (analysis.statistics) {
    const stats = analysis.statistics;
    report += `## Statistics\n\n`;
    report += `- **Total Entries:** ${stats.totalEntries}\n`;
    report += `- **Errors:** ${stats.errorCount}\n`;
    report += `- **Warnings:** ${stats.warningCount}\n`;
    report += `- **Time Range:** ${stats.timeRange}\n\n`;

    if (stats.topErrors && stats.topErrors.length > 0) {
      report += `### Top Errors\n\n`;
      for (const err of stats.topErrors) {
        report += `- ${err.error}: ${err.count} occurrences\n`;
      }
      report += '\n';
    }
  }

  // Error Patterns
  if (analysis.errorPatterns && analysis.errorPatterns.length > 0) {
    report += `## Error Patterns\n\n`;
    for (const pattern of analysis.errorPatterns) {
      const severityIcon =
        pattern.severity === 'critical' ? '🔴' :
        pattern.severity === 'error' ? '🟠' :
        pattern.severity === 'warning' ? '🟡' : '🔵';

      report += `### ${severityIcon} ${pattern.pattern}\n\n`;
      report += `- **Count:** ${pattern.count}\n`;
      report += `- **First Seen:** ${pattern.firstSeen}\n`;
      report += `- **Last Seen:** ${pattern.lastSeen}\n`;
      if (pattern.examples && pattern.examples.length > 0) {
        report += `- **Examples:**\n`;
        for (const ex of pattern.examples.slice(0, 3)) {
          report += `  - \`${ex}\`\n`;
        }
      }
      report += '\n';
    }
  }

  // Anomalies
  if (analysis.anomalies && analysis.anomalies.length > 0) {
    report += `## Anomalies Detected\n\n`;
    for (const anomaly of analysis.anomalies) {
      const severityIcon =
        anomaly.severity === 'high' ? '⚠️' :
        anomaly.severity === 'medium' ? '⚡' : 'ℹ️';

      report += `### ${severityIcon} ${anomaly.type.replace('_', ' ').toUpperCase()}\n\n`;
      report += `**Time:** ${anomaly.timestamp}\n\n`;
      report += `${anomaly.description}\n\n`;
    }
  }

  // Timeline
  if (analysis.timeline) {
    report += `## Incident Timeline\n\n`;
    if (analysis.timeline.summary) {
      report += `${analysis.timeline.summary}\n\n`;
    }
    if (analysis.timeline.duration) {
      report += `**Duration:** ${analysis.timeline.duration}\n\n`;
    }
    if (analysis.timeline.events && analysis.timeline.events.length > 0) {
      report += `| Time | Event | Significance |\n`;
      report += `|------|-------|-------------|\n`;
      for (const event of analysis.timeline.events) {
        report += `| ${event.timestamp} | ${event.event} | ${event.significance} |\n`;
      }
      report += '\n';
    }
  }

  // Root Cause Analysis
  if (analysis.rootCause) {
    report += `## Root Cause Analysis\n\n`;
    report += `**Confidence:** ${analysis.rootCause.confidence}\n\n`;
    report += `### Root Cause\n\n${analysis.rootCause.rootCause}\n\n`;

    if (analysis.rootCause.contributingFactors && analysis.rootCause.contributingFactors.length > 0) {
      report += `### Contributing Factors\n\n`;
      for (const factor of analysis.rootCause.contributingFactors) {
        report += `- ${factor}\n`;
      }
      report += '\n';
    }

    if (analysis.rootCause.recommendations && analysis.rootCause.recommendations.length > 0) {
      report += `### Recommendations\n\n`;
      for (let i = 0; i < analysis.rootCause.recommendations.length; i++) {
        report += `${i + 1}. ${analysis.rootCause.recommendations[i]}\n`;
      }
      report += '\n';
    }
  }

  return report;
}

async function main() {
  console.log('=== Log Analysis Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let format: keyof typeof SAMPLE_LOGS = 'app';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      format = args[i + 1] as keyof typeof SAMPLE_LOGS;
      i++;
    }
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable'
    );
    process.exit(1);
  }

  const logs = SAMPLE_LOGS[format];
  if (!logs) {
    console.error(`Unknown format: ${format}`);
    console.error(`Available: ${Object.keys(SAMPLE_LOGS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Log Format: ${format}`);
  console.log(`Log Size: ${logs.length.toLocaleString()} characters`);
  console.log(`Lines: ${logs.split('\n').length}\n`);

  // Create context
  const context = createLogContext(logs, format);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 15,
  });

  console.log('=' .repeat(80) + '\n');

  // Analysis prompt
  const analysisPrompt = `Analyze these ${format} log entries to identify issues, patterns, and provide insights.

Your analysis should include:

1. **Summary**: Brief overview of what's happening in the logs

2. **Statistics**: Count of entries, errors, warnings, time range, top errors

3. **Error Patterns**: Identify recurring error patterns with:
   - Pattern description
   - Count of occurrences
   - First and last seen timestamps
   - Severity (critical/error/warning/info)
   - Example log entries

4. **Anomalies**: Detect unusual patterns like:
   - Traffic spikes or drops
   - Unusual error rates
   - New error types
   - Security concerns

5. **Incident Timeline**: If there's an incident, reconstruct the timeline

6. **Root Cause Analysis**: If errors are present, analyze the likely root cause with:
   - Summary
   - Root cause identification
   - Contributing factors
   - Recommendations for resolution
   - Confidence level (high/medium/low)

Return your analysis in this JSON format:
\`\`\`json
{
  "summary": "Brief overview",
  "statistics": {
    "totalEntries": 25,
    "errorCount": 10,
    "warningCount": 5,
    "timeRange": "10:00:01 - 10:00:31",
    "topErrors": [{"error": "Database connection failed", "count": 4}]
  },
  "errorPatterns": [
    {
      "pattern": "Database connection refused",
      "count": 3,
      "firstSeen": "10:00:08",
      "lastSeen": "10:00:09",
      "severity": "error",
      "examples": ["Connection failed: ECONNREFUSED"]
    }
  ],
  "anomalies": [
    {
      "type": "spike",
      "timestamp": "10:00:08",
      "description": "Sudden increase in errors",
      "severity": "high",
      "relatedEntries": [8, 9, 10]
    }
  ],
  "timeline": {
    "events": [
      {"timestamp": "10:00:08", "event": "Database connection lost", "significance": "high"}
    ],
    "duration": "7 seconds",
    "summary": "Database outage causing service disruption"
  },
  "rootCause": {
    "summary": "Database server became unreachable",
    "rootCause": "PostgreSQL database connection refused",
    "contributingFactors": ["Network issue", "Database server down"],
    "recommendations": ["Check database server status", "Review network connectivity"],
    "confidence": "high"
  }
}
\`\`\`

Be thorough and focus on actionable insights.`;

  console.log('Analyzing logs...\n');

  try {
    const startTime = Date.now();
    const result = await rlm.completion(analysisPrompt, context);
    const elapsed = Date.now() - startTime;

    // Parse the response
    const analysis = parseAnalysisResponse(result.response);

    // Generate report
    const report = generateAnalysisReport(analysis, format);

    // Output report
    console.log(report);

    // Save report
    const reportPath = `log-analysis-${format}.md`;
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);

    // Stats
    console.log('\n' + '=' .repeat(80));
    console.log(`Analysis completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`Tokens used: ${result.usage.totalTokens.toLocaleString()}`);
    console.log(`Estimated cost: $${result.usage.estimatedCost.toFixed(4)}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  console.log('\nDone!');
}

main();
