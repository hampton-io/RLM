/**
 * Data Extraction Example
 *
 * Demonstrates RLM's ability to extract structured data from unstructured text:
 * - JSON schema-based extraction
 * - CSV output generation
 * - Table and list parsing
 * - Entity extraction (names, dates, amounts, organizations)
 * - Template-based extraction patterns
 *
 * Run with: npx tsx examples/data-extraction.ts [--mode json|csv|entities]
 */

import { RLM, extractTemplate, render } from '../src/index.js';
import * as fs from 'fs';

interface ExtractedEntity {
  type: 'person' | 'organization' | 'date' | 'currency' | 'percentage' | 'email' | 'phone' | 'address' | 'product';
  value: string;
  context: string;
  confidence: number;
}

interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  description: string;
  required?: boolean;
}

interface ExtractionSchema {
  name: string;
  description: string;
  fields: SchemaField[];
}

/**
 * Sample unstructured text documents for extraction.
 */
const SAMPLE_DOCUMENTS = {
  invoice: `
INVOICE #INV-2024-0892
Date: January 15, 2024
Due Date: February 14, 2024

From:
TechSupply Co.
123 Innovation Drive
San Francisco, CA 94105
Email: billing@techsupply.example.com
Phone: (415) 555-0123
Tax ID: 12-3456789

Bill To:
Acme Corporation
Attn: John Smith
456 Business Ave, Suite 200
New York, NY 10001
Email: john.smith@acme.example.com
PO Number: PO-2024-001234

Items:
+------+--------------------------------+----------+--------+------------+
| Qty  | Description                    | Unit     | Price  | Total      |
+------+--------------------------------+----------+--------+------------+
| 50   | USB-C Cables (2m)              | EA       | $12.99 | $649.50    |
| 25   | Wireless Mouse - Ergonomic     | EA       | $45.00 | $1,125.00  |
| 10   | 27" Monitor - 4K IPS           | EA       | $399.00| $3,990.00  |
| 100  | Ethernet Cable Cat6 (1m)       | EA       | $5.50  | $550.00    |
| 5    | Laptop Stand - Adjustable      | EA       | $79.99 | $399.95    |
+------+--------------------------------+----------+--------+------------+

                                        Subtotal:    $6,714.45
                                        Tax (8.5%):  $570.73
                                        Shipping:    $125.00
                                        --------------------------------
                                        TOTAL DUE:   $7,410.18

Payment Terms: Net 30
Payment Methods: Wire Transfer, ACH, Check
Bank: First National Bank
Account: 9876543210
Routing: 021000021

Notes:
- All items covered under standard 1-year warranty
- Returns accepted within 30 days with RMA
- Contact support@techsupply.example.com for questions
`,

  jobPosting: `
Software Engineer - Backend Systems
Company: NextGen Software Inc.
Location: Austin, TX (Hybrid - 3 days in office)
Department: Engineering
Reports to: Director of Engineering

About Us:
NextGen Software is a fast-growing startup building the future of developer
tools. Founded in 2021, we've raised $50M in Series B funding and serve
over 10,000 developers worldwide. Our mission is to make software development
10x more productive.

Role Overview:
We're looking for an experienced backend engineer to join our platform team.
You'll design and build scalable APIs, optimize database performance, and
mentor junior engineers.

Requirements:
- 5+ years of professional software development experience
- Strong proficiency in Go or Python
- Experience with PostgreSQL and Redis
- Familiarity with Kubernetes and Docker
- Bachelor's degree in Computer Science or equivalent experience
- Excellent communication skills

Nice to Have:
- Experience with gRPC and Protocol Buffers
- Contributions to open source projects
- Experience at a high-growth startup
- Knowledge of distributed systems

Compensation & Benefits:
- Salary Range: $150,000 - $200,000 annually
- Equity: 0.05% - 0.15% (4-year vest, 1-year cliff)
- Health Insurance: 100% premium covered for employee + family
- 401(k): 4% match
- Unlimited PTO (minimum 4 weeks encouraged)
- $2,500 annual learning budget
- Remote work flexibility

Application Process:
1. Submit resume and cover letter
2. Initial phone screen (30 min)
3. Technical interview (90 min)
4. System design interview (60 min)
5. Culture fit interviews (2x30 min)
6. Offer!

Contact:
Email: careers@nextgensoftware.example.com
Website: https://nextgensoftware.example.com/careers
Recruiter: Sarah Johnson (sarah.j@nextgensoftware.example.com)

NextGen Software is an equal opportunity employer. We celebrate diversity
and are committed to creating an inclusive environment for all employees.

Posted: January 10, 2024
Application Deadline: February 28, 2024
Job ID: ENG-2024-042
`,

  meetingNotes: `
MEETING NOTES
Project: Customer Portal Redesign
Date: January 18, 2024 | 2:00 PM - 3:30 PM EST
Location: Conference Room A / Zoom Meeting ID: 123-456-7890

Attendees:
- Maria Garcia (Project Manager) - Present
- David Kim (Lead Designer) - Present
- Alex Thompson (Frontend Developer) - Present
- Jennifer Wu (Backend Developer) - Present (Remote)
- Robert Chen (Product Owner) - Present
- Lisa Park (QA Lead) - Absent (sent notes via email)

Agenda:
1. Sprint review - last 2 weeks
2. Design review - new dashboard mockups
3. Technical discussion - API changes
4. Q1 timeline review
5. Action items

Discussion:

Sprint Review (Maria):
- Completed: User authentication module (Story #234)
- Completed: Database migration scripts (Story #256)
- In Progress: Dashboard components (Story #267) - 70% done
- Blocked: Payment integration (Story #278) - waiting on vendor API docs
- Velocity: 42 points (target was 45)

Design Review (David):
- Presented new dashboard mockups v2.3
- Key changes:
  * Simplified navigation (reduced from 8 to 5 top-level items)
  * New data visualization widgets
  * Mobile-responsive layouts
- Feedback: Robert requested larger font sizes for accessibility
- Decision: Approved with minor revisions due by Jan 22

Technical Discussion (Jennifer):
- API v2 breaking changes:
  * /users endpoint renamed to /accounts
  * New rate limiting: 1000 req/min (was 5000)
  * Authentication: moving from API keys to OAuth 2.0
- Timeline: Backend changes complete by Feb 1
- Risk: Third-party service deprecation (AnalyticsPro API)
  * Mitigation: Evaluate alternatives (DataDog, New Relic)

Q1 Timeline (Maria):
- Alpha release: February 15, 2024
- Beta testing: February 15 - March 15
- UAT: March 15 - March 31
- Production release: April 1, 2024

Action Items:
| Owner    | Task                                  | Due Date   |
|----------|---------------------------------------|------------|
| David    | Revise mockups with accessibility     | Jan 22     |
| Jennifer | Complete API v2 documentation         | Jan 25     |
| Alex     | Finish dashboard components           | Jan 26     |
| Maria    | Contact vendor re: payment API docs   | Jan 19     |
| Robert   | Approve revised designs               | Jan 24     |
| Lisa     | Create test plan for alpha release    | Feb 1      |

Next Meeting: January 25, 2024, 2:00 PM EST

Notes prepared by: Maria Garcia
Distribution: All attendees + Lisa Park, Michael Brown (VP Engineering)
`,
};

/**
 * Create extraction context for a document.
 */
function createExtractionContext(document: string, docType: string): string {
  return `DOCUMENT FOR EXTRACTION
Type: ${docType}
${'='.repeat(80)}

${document}

${'='.repeat(80)}`;
}

/**
 * Parse entity extraction response.
 */
function parseEntityResponse(response: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Try to parse JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.entities) {
        return parsed.entities;
      }
    } catch {
      // Continue
    }
  }

  return entities;
}

/**
 * Convert extracted data to CSV format.
 */
function toCSV(data: Record<string, unknown>[], headers?: string[]): string {
  if (data.length === 0) return '';

  const keys = headers || Object.keys(data[0]);
  const rows = [keys.join(',')];

  for (const item of data) {
    const values = keys.map((key) => {
      const value = item[key];
      if (value === undefined || value === null) return '';
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    rows.push(values.join(','));
  }

  return rows.join('\n');
}

async function main() {
  console.log('=== Data Extraction Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let mode: 'json' | 'csv' | 'entities' = 'json';
  let docType: keyof typeof SAMPLE_DOCUMENTS = 'invoice';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mode' && args[i + 1]) {
      mode = args[i + 1] as 'json' | 'csv' | 'entities';
      i++;
    } else if (args[i] === '--doc' && args[i + 1]) {
      docType = args[i + 1] as keyof typeof SAMPLE_DOCUMENTS;
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

  const document = SAMPLE_DOCUMENTS[docType];
  if (!document) {
    console.error(`Unknown document type: ${docType}`);
    console.error(`Available: ${Object.keys(SAMPLE_DOCUMENTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Document type: ${docType}`);
  console.log(`Extraction mode: ${mode}`);
  console.log(`Document length: ${document.length.toLocaleString()} characters\n`);

  // Create context
  const context = createExtractionContext(document, docType);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 10,
  });

  console.log('=' .repeat(80) + '\n');

  if (mode === 'json') {
    // JSON schema-based extraction
    const schemas: Record<string, ExtractionSchema> = {
      invoice: {
        name: 'Invoice',
        description: 'Extract invoice details',
        fields: [
          { name: 'invoiceNumber', type: 'string', description: 'Invoice number', required: true },
          { name: 'date', type: 'date', description: 'Invoice date', required: true },
          { name: 'dueDate', type: 'date', description: 'Payment due date', required: true },
          { name: 'vendor', type: 'object', description: 'Vendor details (name, address, email, phone)' },
          { name: 'customer', type: 'object', description: 'Customer details (name, address, email, contact)' },
          { name: 'lineItems', type: 'array', description: 'Line items (quantity, description, unitPrice, total)' },
          { name: 'subtotal', type: 'number', description: 'Subtotal before tax', required: true },
          { name: 'tax', type: 'number', description: 'Tax amount' },
          { name: 'shipping', type: 'number', description: 'Shipping cost' },
          { name: 'total', type: 'number', description: 'Total amount due', required: true },
          { name: 'paymentTerms', type: 'string', description: 'Payment terms' },
        ],
      },
      jobPosting: {
        name: 'JobPosting',
        description: 'Extract job posting details',
        fields: [
          { name: 'title', type: 'string', description: 'Job title', required: true },
          { name: 'company', type: 'string', description: 'Company name', required: true },
          { name: 'location', type: 'string', description: 'Job location' },
          { name: 'department', type: 'string', description: 'Department' },
          { name: 'requirements', type: 'array', description: 'Required qualifications' },
          { name: 'niceToHave', type: 'array', description: 'Nice to have qualifications' },
          { name: 'salaryMin', type: 'number', description: 'Minimum salary' },
          { name: 'salaryMax', type: 'number', description: 'Maximum salary' },
          { name: 'equity', type: 'string', description: 'Equity range' },
          { name: 'benefits', type: 'array', description: 'Benefits offered' },
          { name: 'contactEmail', type: 'string', description: 'Contact email' },
          { name: 'deadline', type: 'date', description: 'Application deadline' },
          { name: 'jobId', type: 'string', description: 'Job ID' },
        ],
      },
      meetingNotes: {
        name: 'MeetingNotes',
        description: 'Extract meeting details',
        fields: [
          { name: 'project', type: 'string', description: 'Project name', required: true },
          { name: 'date', type: 'date', description: 'Meeting date', required: true },
          { name: 'attendees', type: 'array', description: 'List of attendees (name, role, present)' },
          { name: 'agendaItems', type: 'array', description: 'Agenda items' },
          { name: 'decisions', type: 'array', description: 'Decisions made' },
          { name: 'actionItems', type: 'array', description: 'Action items (owner, task, dueDate)' },
          { name: 'nextMeeting', type: 'date', description: 'Next meeting date' },
          { name: 'blockers', type: 'array', description: 'Blockers identified' },
        ],
      },
    };

    const schema = schemas[docType];
    const schemaDescription = schema.fields
      .map((f) => `- ${f.name} (${f.type}${f.required ? ', required' : ''}): ${f.description}`)
      .join('\n');

    const prompt = `Extract structured data from this ${docType} according to the following schema:

${schemaDescription}

Return the extracted data as valid JSON. Use null for missing optional fields.
Format dates as ISO 8601 (YYYY-MM-DD). Format currency as numbers without symbols.

\`\`\`json
{
  // Your extracted data here
}
\`\`\``;

    console.log('Extracting to JSON schema...\n');

    try {
      const result = await rlm.completion(prompt, context);

      // Try to parse JSON from response
      const jsonMatch = result.response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[1]);
        console.log('Extracted Data:\n');
        console.log(JSON.stringify(extracted, null, 2));

        // Save to file
        const outputPath = `${docType}-extracted.json`;
        fs.writeFileSync(outputPath, JSON.stringify(extracted, null, 2));
        console.log(`\nSaved to: ${outputPath}`);
      } else {
        console.log('Response:\n');
        console.log(result.response);
      }

      console.log('\n' + '-'.repeat(80));
      console.log(`[${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
  } else if (mode === 'csv') {
    // CSV extraction mode
    const prompts: Record<string, string> = {
      invoice: `Extract line items from this invoice as a CSV-friendly format.
Return as JSON array with: quantity, description, unitPrice, total
\`\`\`json
[{"quantity": 50, "description": "USB-C Cables", "unitPrice": 12.99, "total": 649.50}]
\`\`\``,
      jobPosting: `Extract requirements and nice-to-have items as a CSV-friendly format.
Return as JSON array with: type (required/nice-to-have), item
\`\`\`json
[{"type": "required", "item": "5+ years experience"}]
\`\`\``,
      meetingNotes: `Extract action items as a CSV-friendly format.
Return as JSON array with: owner, task, dueDate
\`\`\`json
[{"owner": "John", "task": "Complete review", "dueDate": "2024-01-22"}]
\`\`\``,
    };

    console.log('Extracting to CSV format...\n');

    try {
      const result = await rlm.completion(prompts[docType], context);

      // Parse JSON and convert to CSV
      const jsonMatch = result.response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const extracted = JSON.parse(jsonMatch[1]);
        const csv = toCSV(extracted);

        console.log('CSV Output:\n');
        console.log(csv);

        // Save to file
        const outputPath = `${docType}-extracted.csv`;
        fs.writeFileSync(outputPath, csv);
        console.log(`\nSaved to: ${outputPath}`);
      } else {
        console.log('Response:\n');
        console.log(result.response);
      }

      console.log('\n' + '-'.repeat(80));
      console.log(`[${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
  } else if (mode === 'entities') {
    // Entity extraction mode
    const prompt = `Extract all named entities from this document.

Categories to extract:
- person: Names of people
- organization: Company/organization names
- date: Dates (any format)
- currency: Money amounts
- percentage: Percentage values
- email: Email addresses
- phone: Phone numbers
- address: Physical addresses
- product: Product/service names

Return as JSON array with: type, value, context (surrounding text), confidence (0-1)

\`\`\`json
[
  {"type": "person", "value": "John Smith", "context": "Attn: John Smith", "confidence": 0.95}
]
\`\`\``;

    console.log('Extracting entities...\n');

    try {
      const result = await rlm.completion(prompt, context);
      const entities = parseEntityResponse(result.response);

      if (entities.length > 0) {
        console.log(`Found ${entities.length} entities:\n`);

        // Group by type
        const byType = entities.reduce(
          (acc, e) => {
            (acc[e.type] = acc[e.type] || []).push(e);
            return acc;
          },
          {} as Record<string, ExtractedEntity[]>
        );

        for (const [type, items] of Object.entries(byType)) {
          console.log(`${type.toUpperCase()} (${items.length}):`);
          for (const item of items) {
            console.log(`  - ${item.value} [${(item.confidence * 100).toFixed(0)}%]`);
          }
          console.log();
        }

        // Save to file
        const outputPath = `${docType}-entities.json`;
        fs.writeFileSync(outputPath, JSON.stringify(entities, null, 2));
        console.log(`Saved to: ${outputPath}`);
      } else {
        console.log('Response:\n');
        console.log(result.response);
      }

      console.log('\n' + '-'.repeat(80));
      console.log(`[${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}]`);
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log('\nDone!');
}

main();
