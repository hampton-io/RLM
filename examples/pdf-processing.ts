/**
 * PDF Processing Example
 *
 * Demonstrates RLM's ability to process PDF documents for:
 * - Question answering about PDF content
 * - Table extraction and structured data
 * - Document summarization
 * - Multi-page document handling
 *
 * Requires: npm install pdf-parse
 *
 * Run with: npx tsx examples/pdf-processing.ts [path-to-pdf]
 */

import { RLM, extractTemplate, summarizeTemplate, render } from '../src/index.js';
import * as fs from 'fs';
import * as path from 'path';

// Optional pdf-parse import (install separately)
let pdfParse: typeof import('pdf-parse') | null = null;
try {
  pdfParse = (await import('pdf-parse')).default;
} catch {
  // pdf-parse not installed
}

interface PDFContent {
  text: string;
  numPages: number;
  info: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    producer?: string;
    creationDate?: Date;
    modificationDate?: Date;
  };
  metadata?: Record<string, unknown>;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

interface ExtractionResult {
  tables: TableData[];
  entities: {
    type: string;
    value: string;
    context: string;
  }[];
  keyPoints: string[];
  sections: {
    title: string;
    content: string;
  }[];
}

/**
 * Extract text content from a PDF file.
 */
async function extractPDFContent(pdfPath: string): Promise<PDFContent> {
  if (!pdfParse) {
    throw new Error(
      'pdf-parse is not installed. Run: npm install pdf-parse\n' +
      'Or use the sample mode with --sample flag.'
    );
  }

  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);

  return {
    text: data.text,
    numPages: data.numpages,
    info: data.info || {},
    metadata: data.metadata,
  };
}

/**
 * Generate a sample document for demonstration.
 */
function generateSampleDocument(): PDFContent {
  return {
    text: `
ANNUAL FINANCIAL REPORT
Fiscal Year 2024
================================================================================

EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
TechCorp Inc. delivered exceptional financial performance in fiscal year 2024,
achieving record revenue while maintaining strong profit margins. Our strategic
investments in cloud infrastructure and AI capabilities positioned us well for
sustainable long-term growth.

Key Financial Highlights:
- Total Revenue: $12.5 billion (up 18% year-over-year)
- Gross Profit: $7.8 billion (62.4% margin)
- Operating Income: $3.2 billion (25.6% margin)
- Net Income: $2.8 billion (22.4% margin)
- Earnings Per Share: $5.42 (up from $4.58)
- Free Cash Flow: $3.5 billion

INCOME STATEMENT
--------------------------------------------------------------------------------
                                    2024            2023            Change
--------------------------------------------------------------------------------
Revenue                         $12,500,000     $10,593,220        +18.0%
Cost of Revenue                  $4,700,000      $4,131,356        +13.8%
Gross Profit                     $7,800,000      $6,461,864        +20.7%
Operating Expenses               $4,600,000      $3,920,248        +17.3%
Operating Income                 $3,200,000      $2,541,616        +25.9%
Interest Expense                   $150,000        $165,000         -9.1%
Other Income                       $200,000        $180,000        +11.1%
Pre-tax Income                   $3,250,000      $2,556,616        +27.1%
Income Tax                         $450,000        $357,926        +25.7%
Net Income                       $2,800,000      $2,198,690        +27.3%

BALANCE SHEET HIGHLIGHTS
--------------------------------------------------------------------------------
                                    2024            2023
--------------------------------------------------------------------------------
Total Assets                    $28,500,000     $24,200,000
Cash and Equivalents             $8,200,000      $6,500,000
Accounts Receivable              $2,100,000      $1,800,000
Property and Equipment           $5,500,000      $5,000,000
Total Liabilities               $11,200,000     $10,100,000
Long-term Debt                   $4,500,000      $4,800,000
Shareholders' Equity            $17,300,000     $14,100,000

SEGMENT PERFORMANCE
--------------------------------------------------------------------------------
Cloud Services (45% of revenue):
  Revenue: $5,625,000 (up 32% YoY)
  Operating Margin: 35%
  Key Products: CloudCore, DataSync, SecureNet
  Customer Growth: 45,000 new enterprise customers

Enterprise Software (35% of revenue):
  Revenue: $4,375,000 (up 12% YoY)
  Operating Margin: 28%
  Key Products: TechSuite Pro, WorkFlow AI
  License Renewals: 94% retention rate

Professional Services (20% of revenue):
  Revenue: $2,500,000 (up 8% YoY)
  Operating Margin: 18%
  Services: Implementation, Training, Consulting
  Project Completion: 98% on-time delivery

QUARTERLY BREAKDOWN
--------------------------------------------------------------------------------
Quarter     Revenue       Net Income    EPS      Key Events
--------------------------------------------------------------------------------
Q1 2024     $2,800,000    $620,000     $1.20    CloudCore 3.0 launch
Q2 2024     $3,000,000    $680,000     $1.31    Acquired DataTech Inc.
Q3 2024     $3,200,000    $720,000     $1.39    Expanded to Asia Pacific
Q4 2024     $3,500,000    $780,000     $1.52    Enterprise deal record

CAPITAL ALLOCATION
--------------------------------------------------------------------------------
R&D Investment: $1.8 billion (14.4% of revenue)
- AI/ML Development: $600 million
- Cloud Infrastructure: $500 million
- Security Products: $400 million
- Platform Modernization: $300 million

Capital Expenditures: $800 million
- Data Centers: $500 million
- Equipment: $200 million
- Facilities: $100 million

Shareholder Returns: $2.2 billion
- Dividends: $800 million ($1.55 per share)
- Share Repurchases: $1.4 billion (25 million shares)

RISK FACTORS
--------------------------------------------------------------------------------
1. Competitive Pressure: Intense competition in cloud and enterprise markets
2. Cybersecurity Threats: Increasing sophistication of attacks
3. Regulatory Changes: Evolving data privacy regulations globally
4. Economic Conditions: Potential impact on enterprise IT spending
5. Talent Acquisition: Competition for skilled engineers
6. Supply Chain: Component availability for hardware products

OUTLOOK FOR 2025
--------------------------------------------------------------------------------
Management provides the following guidance for fiscal year 2025:
- Revenue: $14.5 - $15.0 billion (16-20% growth)
- Operating Margin: 26-27%
- Earnings Per Share: $6.20 - $6.50

Key growth drivers:
- Continued cloud adoption by enterprise customers
- AI product expansion and monetization
- International market growth, particularly APAC
- Cross-selling opportunities from DataTech acquisition

LEADERSHIP TEAM
--------------------------------------------------------------------------------
CEO: Sarah Mitchell (since 2020)
CFO: James Rodriguez
CTO: Dr. Emily Chen
COO: Michael Thompson
Chief Revenue Officer: David Park

AUDITOR'S OPINION
--------------------------------------------------------------------------------
Ernst & Young LLP has audited our consolidated financial statements for the
fiscal year ended December 31, 2024. In their opinion, the financial statements
present fairly, in all material respects, the financial position of TechCorp Inc.

================================================================================
For investor relations: ir@techcorp-example.com | +1 (555) 123-4567
================================================================================
`,
    numPages: 8,
    info: {
      title: 'TechCorp Inc. Annual Financial Report FY2024',
      author: 'TechCorp Finance Department',
      subject: 'Annual Financial Report',
      creator: 'TechCorp Document System',
      creationDate: new Date('2024-02-15'),
    },
  };
}

/**
 * Create context from PDF content.
 */
function createPDFContext(pdf: PDFContent, pdfPath?: string): string {
  let context = 'PDF DOCUMENT CONTENT\n';
  context += '='.repeat(80) + '\n\n';

  // Metadata
  context += 'DOCUMENT METADATA\n';
  context += '-'.repeat(80) + '\n';
  if (pdfPath) context += `File: ${pdfPath}\n`;
  context += `Pages: ${pdf.numPages}\n`;
  if (pdf.info.title) context += `Title: ${pdf.info.title}\n`;
  if (pdf.info.author) context += `Author: ${pdf.info.author}\n`;
  if (pdf.info.subject) context += `Subject: ${pdf.info.subject}\n`;
  if (pdf.info.creationDate) context += `Created: ${pdf.info.creationDate}\n`;
  context += '\n';

  // Content
  context += 'DOCUMENT TEXT\n';
  context += '-'.repeat(80) + '\n';
  context += pdf.text;

  return context;
}

/**
 * Parse extraction response from LLM.
 */
function parseExtractionResponse(response: string): ExtractionResult {
  const result: ExtractionResult = {
    tables: [],
    entities: [],
    keyPoints: [],
    sections: [],
  };

  // Try to extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.tables) result.tables = parsed.tables;
      if (parsed.entities) result.entities = parsed.entities;
      if (parsed.keyPoints) result.keyPoints = parsed.keyPoints;
      if (parsed.sections) result.sections = parsed.sections;
    } catch {
      // Continue with empty result
    }
  }

  return result;
}

async function main() {
  console.log('=== PDF Processing Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let pdfPath: string | null = null;
  let useSample = false;
  let mode: 'qa' | 'extract' | 'summarize' = 'qa';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--sample') {
      useSample = true;
    } else if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1] as 'qa' | 'extract' | 'summarize';
      i++;
    } else if (!args[i].startsWith('--')) {
      pdfPath = args[i];
    }
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable'
    );
    process.exit(1);
  }

  // Load PDF content
  let pdfContent: PDFContent;
  if (useSample || !pdfPath) {
    console.log('Using sample document (use --sample or provide a PDF path)\n');
    pdfContent = generateSampleDocument();
  } else {
    if (!fs.existsSync(pdfPath)) {
      console.error(`Error: PDF not found: ${pdfPath}`);
      process.exit(1);
    }
    console.log(`Loading PDF: ${pdfPath}\n`);
    pdfContent = await extractPDFContent(pdfPath);
  }

  console.log(`Document: ${pdfContent.info.title || 'Untitled'}`);
  console.log(`Pages: ${pdfContent.numPages}`);
  console.log(`Text length: ${pdfContent.text.length.toLocaleString()} characters\n`);

  // Create context
  const context = createPDFContext(pdfContent, pdfPath || undefined);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 15,
  });

  console.log('=' .repeat(80) + '\n');

  if (mode === 'qa') {
    // Question answering mode
    const questions = [
      'What was the total revenue and how did it compare to last year?',
      'Which business segment is growing the fastest and what is its operating margin?',
      'How much did the company invest in R&D and what were the main focus areas?',
      'What are the key risk factors mentioned in the report?',
      'What is the earnings guidance for 2025?',
    ];

    console.log('Question Answering Mode\n');

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`Q${i + 1}: ${question}\n`);

      try {
        const result = await rlm.completion(question, context);
        console.log(`A${i + 1}: ${result.response}\n`);
        console.log(`   [${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]\n`);
        console.log('-'.repeat(80) + '\n');
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : error}\n`);
      }
    }
  } else if (mode === 'extract') {
    // Data extraction mode
    console.log('Data Extraction Mode\n');

    const extractPrompt = `Extract structured data from this financial report:

1. **Tables**: Extract all tabular data (income statement, balance sheet, quarterly breakdown)
2. **Entities**: Extract key entities (people, companies, amounts, percentages, dates)
3. **Key Points**: List the 10 most important facts
4. **Sections**: Identify main sections with brief summaries

Return in JSON format:
\`\`\`json
{
  "tables": [
    {"headers": ["Column1", "Column2"], "rows": [["val1", "val2"]]}
  ],
  "entities": [
    {"type": "currency", "value": "$12.5 billion", "context": "Total Revenue"}
  ],
  "keyPoints": ["Point 1", "Point 2"],
  "sections": [
    {"title": "Section Title", "content": "Brief summary"}
  ]
}
\`\`\``;

    try {
      const result = await rlm.completion(extractPrompt, context);
      const extraction = parseExtractionResponse(result.response);

      console.log('Extraction Results:\n');
      console.log(`Tables found: ${extraction.tables.length}`);
      console.log(`Entities found: ${extraction.entities.length}`);
      console.log(`Key points: ${extraction.keyPoints.length}`);
      console.log(`Sections: ${extraction.sections.length}\n`);

      // Save extraction to file
      const outputPath = 'pdf-extraction.json';
      fs.writeFileSync(outputPath, JSON.stringify(extraction, null, 2));
      console.log(`Extraction saved to: ${outputPath}\n`);

      console.log(`[${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
  } else if (mode === 'summarize') {
    // Summarization mode
    console.log('Summarization Mode\n');

    const summaryPrompt = `Create a comprehensive executive summary of this financial report.

Include:
1. Financial Performance Overview (revenue, profit, growth)
2. Business Segment Analysis
3. Capital Allocation and Investments
4. Risk Assessment
5. Future Outlook

The summary should be suitable for a board presentation (500-800 words).`;

    try {
      const result = await rlm.completion(summaryPrompt, context);

      console.log('Executive Summary:\n');
      console.log(result.response);
      console.log('\n' + '-'.repeat(80));
      console.log(`[${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]`);

      // Save summary to file
      const outputPath = 'pdf-summary.md';
      fs.writeFileSync(outputPath, `# Executive Summary\n\n${result.response}`);
      console.log(`\nSummary saved to: ${outputPath}`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\nDone!');
}

main();
