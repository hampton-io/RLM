/**
 * Comparative Analysis Example
 *
 * Demonstrates RLM's ability to analyze and compare multiple documents:
 * - Load and compare multiple documents
 * - Identify similarities and differences
 * - Generate comparison matrices
 * - Highlight conflicting information
 * - Produce structured comparison reports
 *
 * Run with: npx tsx examples/comparative-analysis.ts
 */

import { RLM, compareTemplate, render } from '../src/index.js';
import * as fs from 'fs';

interface ComparisonResult {
  summary: string;
  similarities: Similarity[];
  differences: Difference[];
  conflicts: Conflict[];
  matrix: ComparisonMatrix;
  recommendation: string;
}

interface Similarity {
  aspect: string;
  description: string;
  documents: string[];
}

interface Difference {
  aspect: string;
  descriptions: Record<string, string>;
  significance: 'high' | 'medium' | 'low';
}

interface Conflict {
  aspect: string;
  claims: Record<string, string>;
  resolution?: string;
}

interface ComparisonMatrix {
  aspects: string[];
  documents: string[];
  values: Record<string, Record<string, string>>;
}

/**
 * Sample documents for comparison.
 */
const SAMPLE_DOCUMENTS = {
  // Cloud Provider Comparison
  cloudProviders: {
    'AWS': `
AMAZON WEB SERVICES (AWS) - Service Overview 2024
================================================================================

COMPUTE SERVICES
--------------------------------------------------------------------------------
EC2 (Elastic Compute Cloud):
- Instance Types: 600+ instance types
- Regions: 33 regions, 105 availability zones
- Spot Instances: Up to 90% discount
- Reserved: 1-3 year terms, up to 75% savings
- Serverless: Lambda (up to 10GB memory, 15 min timeout)

Pricing (us-east-1):
- t3.micro: $0.0104/hour
- t3.medium: $0.0416/hour
- m6i.large: $0.096/hour
- c6i.xlarge: $0.17/hour

STORAGE SERVICES
--------------------------------------------------------------------------------
S3 (Simple Storage Service):
- Storage Classes: Standard, IA, Glacier, Deep Archive
- Durability: 99.999999999% (11 9s)
- Max Object Size: 5TB
- Pricing: $0.023/GB (Standard)

EBS (Elastic Block Store):
- Types: gp3, io2, st1, sc1
- IOPS: Up to 256,000 (io2)
- Throughput: Up to 4,000 MB/s
- Pricing: $0.08/GB-month (gp3)

DATABASE SERVICES
--------------------------------------------------------------------------------
RDS: MySQL, PostgreSQL, Oracle, SQL Server, MariaDB
Aurora: MySQL/PostgreSQL compatible, 5x faster
DynamoDB: NoSQL, single-digit ms latency
Redshift: Data warehouse, columnar storage

AI/ML SERVICES
--------------------------------------------------------------------------------
SageMaker: Full ML platform
Bedrock: Foundation models (Claude, Llama, Titan)
Rekognition: Image/video analysis
Comprehend: NLP services

SUPPORT & SLA
--------------------------------------------------------------------------------
Support Plans:
- Basic: Free
- Developer: $29/month
- Business: $100/month+
- Enterprise: $15,000/month+

SLA: 99.99% for most services
`,

    'Azure': `
MICROSOFT AZURE - Service Overview 2024
================================================================================

COMPUTE SERVICES
--------------------------------------------------------------------------------
Virtual Machines:
- Instance Types: 500+ VM sizes
- Regions: 60+ regions globally
- Spot VMs: Up to 90% discount
- Reserved: 1-3 year terms, up to 72% savings
- Serverless: Azure Functions (up to 14GB memory, no timeout limit)

Pricing (East US):
- B1s: $0.0104/hour
- B2s: $0.0416/hour
- D2s_v5: $0.096/hour
- F4s_v2: $0.17/hour

STORAGE SERVICES
--------------------------------------------------------------------------------
Blob Storage:
- Tiers: Hot, Cool, Cold, Archive
- Durability: 99.999999999% (11 9s) with GRS
- Max Blob Size: 190.7 TB (block blobs)
- Pricing: $0.018/GB (Hot LRS)

Managed Disks:
- Types: Premium SSD, Standard SSD, Standard HDD, Ultra
- IOPS: Up to 160,000 (Ultra)
- Throughput: Up to 4,000 MB/s
- Pricing: $0.075/GB-month (Premium SSD)

DATABASE SERVICES
--------------------------------------------------------------------------------
Azure SQL: Managed SQL Server
Cosmos DB: Multi-model NoSQL, global distribution
PostgreSQL/MySQL: Managed open source
Synapse: Analytics and data warehouse

AI/ML SERVICES
--------------------------------------------------------------------------------
Azure ML: Full ML platform
Azure OpenAI: GPT-4, DALL-E, Whisper
Cognitive Services: Vision, Speech, Language
Azure AI Search: Vector + semantic search

SUPPORT & SLA
--------------------------------------------------------------------------------
Support Plans:
- Basic: Free
- Developer: $29/month
- Standard: $100/month
- Professional Direct: $1,000/month
- Premier: Custom pricing

SLA: 99.99% for most services
`,

    'GCP': `
GOOGLE CLOUD PLATFORM (GCP) - Service Overview 2024
================================================================================

COMPUTE SERVICES
--------------------------------------------------------------------------------
Compute Engine:
- Machine Types: 300+ configurations
- Regions: 40 regions, 121 zones
- Spot VMs: Up to 91% discount
- Committed Use: 1-3 year terms, up to 70% savings
- Serverless: Cloud Functions (up to 32GB memory, 60 min timeout)

Pricing (us-central1):
- e2-micro: $0.0084/hour
- e2-medium: $0.0335/hour
- n2-standard-2: $0.097/hour
- c2-standard-4: $0.21/hour

STORAGE SERVICES
--------------------------------------------------------------------------------
Cloud Storage:
- Classes: Standard, Nearline, Coldline, Archive
- Durability: 99.999999999% (11 9s)
- Max Object Size: 5TB
- Pricing: $0.020/GB (Standard)

Persistent Disk:
- Types: pd-balanced, pd-ssd, pd-standard, pd-extreme
- IOPS: Up to 120,000 (pd-extreme)
- Throughput: Up to 2,400 MB/s
- Pricing: $0.08/GB-month (pd-balanced)

DATABASE SERVICES
--------------------------------------------------------------------------------
Cloud SQL: MySQL, PostgreSQL, SQL Server
Spanner: Globally distributed relational
Firestore: NoSQL document database
BigQuery: Serverless data warehouse

AI/ML SERVICES
--------------------------------------------------------------------------------
Vertex AI: Full ML platform
Gemini API: Gemini 2.0 Flash/Pro models
Vision AI: Image analysis
Natural Language AI: Text analysis

SUPPORT & SLA
--------------------------------------------------------------------------------
Support Plans:
- Basic: Free
- Standard: $29/month
- Enhanced: $500/month
- Premium: $12,500/month+

SLA: 99.95-99.99% depending on service
`,
  },

  // Product Comparison
  products: {
    'ProductA': `
TECHPRO X500 - Premium Laptop
================================================================================

SPECIFICATIONS
--------------------------------------------------------------------------------
Processor: Intel Core i9-14900HX (24 cores, 5.8 GHz boost)
Memory: 64GB DDR5-5600
Storage: 2TB NVMe SSD (7,000 MB/s read)
Display: 16" 4K OLED, 120Hz, HDR1000, 100% DCI-P3
Graphics: NVIDIA RTX 4080 16GB
Battery: 100Wh, up to 12 hours
Weight: 2.2 kg (4.85 lbs)
Ports: 2x Thunderbolt 4, 2x USB-A, HDMI 2.1, SD card
Connectivity: WiFi 7, Bluetooth 5.3

FEATURES
--------------------------------------------------------------------------------
- Mechanical keyboard with per-key RGB
- IR camera for Windows Hello
- Fingerprint reader
- Advanced cooling with vapor chamber
- MIL-STD-810H certified

PRICING
--------------------------------------------------------------------------------
Base Model: $2,999
As Tested: $3,499
Warranty: 2 years standard, 4 years extended available

REVIEWS
--------------------------------------------------------------------------------
TechRadar: 4.5/5 - "Best performance laptop of 2024"
The Verge: 8.5/10 - "Incredible power, decent battery"
PCMag: 4/5 - "Outstanding for creators and gamers"
`,

    'ProductB': `
ULTRABOOK PRO 15 - Business Ultrabook
================================================================================

SPECIFICATIONS
--------------------------------------------------------------------------------
Processor: Apple M3 Max (16 cores, 4.05 GHz)
Memory: 48GB Unified Memory
Storage: 1TB NVMe SSD (5,000 MB/s read)
Display: 15.3" Liquid Retina XDR, ProMotion 120Hz, 1600 nits peak
Graphics: Integrated 40-core GPU
Battery: 72Wh, up to 18 hours
Weight: 1.51 kg (3.33 lbs)
Ports: 3x Thunderbolt 4, HDMI, MagSafe 3, SD card
Connectivity: WiFi 6E, Bluetooth 5.3

FEATURES
--------------------------------------------------------------------------------
- Magic Keyboard with Touch ID
- 1080p FaceTime camera
- Six-speaker sound system
- Silent operation (fanless in light use)
- macOS Sonoma with AI features

PRICING
--------------------------------------------------------------------------------
Base Model: $2,499
As Tested: $3,199
Warranty: 1 year standard, AppleCare+ $299/3 years

REVIEWS
--------------------------------------------------------------------------------
TechRadar: 5/5 - "The laptop to beat in 2024"
The Verge: 9/10 - "Best battery life, great performance"
PCMag: 4.5/5 - "Premium quality, premium price"
`,
  },
};

/**
 * Create comparison context from multiple documents.
 */
function createComparisonContext(
  documents: Record<string, string>,
  category: string
): string {
  let context = `DOCUMENTS FOR COMPARISON
Category: ${category}
${'='.repeat(80)}

`;

  for (const [name, content] of Object.entries(documents)) {
    context += `${'#'.repeat(80)}
DOCUMENT: ${name}
${'#'.repeat(80)}
${content}

`;
  }

  return context;
}

/**
 * Parse comparison response into structured result.
 */
function parseComparisonResponse(response: string): Partial<ComparisonResult> {
  const result: Partial<ComparisonResult> = {
    similarities: [],
    differences: [],
    conflicts: [],
  };

  // Try to extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.summary) result.summary = parsed.summary;
      if (parsed.similarities) result.similarities = parsed.similarities;
      if (parsed.differences) result.differences = parsed.differences;
      if (parsed.conflicts) result.conflicts = parsed.conflicts;
      if (parsed.matrix) result.matrix = parsed.matrix;
      if (parsed.recommendation) result.recommendation = parsed.recommendation;
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
 * Generate a markdown comparison report.
 */
function generateComparisonReport(
  result: Partial<ComparisonResult>,
  documentNames: string[],
  category: string
): string {
  let report = `# Comparative Analysis Report\n\n`;
  report += `**Category:** ${category}\n`;
  report += `**Documents Compared:** ${documentNames.join(', ')}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;

  // Summary
  if (result.summary) {
    report += `## Executive Summary\n\n${result.summary}\n\n`;
  }

  // Comparison Matrix
  if (result.matrix) {
    report += `## Comparison Matrix\n\n`;
    const { aspects, documents, values } = result.matrix;

    // Header
    report += `| Aspect | ${documents.join(' | ')} |\n`;
    report += `|${'-'.repeat(20)}|${documents.map(() => '-'.repeat(20)).join('|')}|\n`;

    // Rows
    for (const aspect of aspects) {
      const row = documents.map((doc) => values[aspect]?.[doc] || '-');
      report += `| ${aspect} | ${row.join(' | ')} |\n`;
    }
    report += '\n';
  }

  // Similarities
  if (result.similarities && result.similarities.length > 0) {
    report += `## Similarities\n\n`;
    for (const sim of result.similarities) {
      report += `### ${sim.aspect}\n`;
      report += `${sim.description}\n`;
      report += `*Found in: ${sim.documents.join(', ')}*\n\n`;
    }
  }

  // Differences
  if (result.differences && result.differences.length > 0) {
    report += `## Key Differences\n\n`;

    // Group by significance
    const bySignificance = {
      high: result.differences.filter((d) => d.significance === 'high'),
      medium: result.differences.filter((d) => d.significance === 'medium'),
      low: result.differences.filter((d) => d.significance === 'low'),
    };

    for (const [level, diffs] of Object.entries(bySignificance)) {
      if (diffs.length > 0) {
        report += `### ${level.charAt(0).toUpperCase() + level.slice(1)} Significance\n\n`;
        for (const diff of diffs) {
          report += `**${diff.aspect}**\n`;
          for (const [doc, desc] of Object.entries(diff.descriptions)) {
            report += `- *${doc}*: ${desc}\n`;
          }
          report += '\n';
        }
      }
    }
  }

  // Conflicts
  if (result.conflicts && result.conflicts.length > 0) {
    report += `## Conflicting Information\n\n`;
    for (const conflict of result.conflicts) {
      report += `### ${conflict.aspect}\n`;
      for (const [doc, claim] of Object.entries(conflict.claims)) {
        report += `- *${doc}* claims: ${claim}\n`;
      }
      if (conflict.resolution) {
        report += `\n**Resolution:** ${conflict.resolution}\n`;
      }
      report += '\n';
    }
  }

  // Recommendation
  if (result.recommendation) {
    report += `## Recommendation\n\n${result.recommendation}\n`;
  }

  return report;
}

async function main() {
  console.log('=== Comparative Analysis Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let dataset: 'cloudProviders' | 'products' = 'cloudProviders';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dataset' && args[i + 1]) {
      dataset = args[i + 1] as 'cloudProviders' | 'products';
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

  const documents = SAMPLE_DOCUMENTS[dataset];
  if (!documents) {
    console.error(`Unknown dataset: ${dataset}`);
    console.error(`Available: ${Object.keys(SAMPLE_DOCUMENTS).join(', ')}`);
    process.exit(1);
  }

  const documentNames = Object.keys(documents);
  console.log(`Dataset: ${dataset}`);
  console.log(`Comparing: ${documentNames.join(' vs ')}\n`);

  // Create context
  const context = createComparisonContext(documents, dataset);
  console.log(`Context size: ${context.length.toLocaleString()} characters\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 20,
    maxDepth: 2,
  });

  console.log('=' .repeat(80) + '\n');

  // Comparison prompt
  const comparisonPrompt = `Perform a detailed comparative analysis of these ${documentNames.length} documents.

Your analysis should include:

1. **Summary**: A brief executive summary of the comparison (2-3 sentences)

2. **Comparison Matrix**: Create a matrix comparing key aspects across all documents

3. **Similarities**: Identify areas where the documents agree or have similar offerings

4. **Differences**: Highlight key differences with significance levels (high/medium/low)

5. **Conflicts**: Note any conflicting or contradictory information between documents

6. **Recommendation**: Based on the comparison, provide a balanced recommendation

Return your analysis in this JSON format:
\`\`\`json
{
  "summary": "Executive summary...",
  "matrix": {
    "aspects": ["Aspect1", "Aspect2"],
    "documents": ["Doc1", "Doc2"],
    "values": {
      "Aspect1": {"Doc1": "Value", "Doc2": "Value"},
      "Aspect2": {"Doc1": "Value", "Doc2": "Value"}
    }
  },
  "similarities": [
    {"aspect": "Area", "description": "What's similar", "documents": ["Doc1", "Doc2"]}
  ],
  "differences": [
    {"aspect": "Area", "descriptions": {"Doc1": "...", "Doc2": "..."}, "significance": "high"}
  ],
  "conflicts": [
    {"aspect": "Area", "claims": {"Doc1": "...", "Doc2": "..."}, "resolution": "..."}
  ],
  "recommendation": "Based on the analysis..."
}
\`\`\`

Be thorough and objective in your comparison.`;

  console.log('Analyzing documents...\n');

  try {
    const startTime = Date.now();
    const result = await rlm.completion(comparisonPrompt, context);
    const elapsed = Date.now() - startTime;

    // Parse the response
    const comparison = parseComparisonResponse(result.response);

    // Generate report
    const report = generateComparisonReport(
      comparison,
      documentNames,
      dataset
    );

    // Output report
    console.log(report);

    // Save report
    const reportPath = `comparative-analysis-${dataset}.md`;
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
