/**
 * Multi-Document Reasoning Example
 *
 * Demonstrates RLM's ability to reason across multiple documents,
 * synthesizing information from different sources to answer questions.
 *
 * Run with: npx tsx examples/multi-document.ts
 */

import { RLM } from '../src/index.js';

// Document separator used in the combined context
const DOC_SEPARATOR = '\n\n=== DOCUMENT BOUNDARY ===\n\n';

/**
 * Sample documents representing different sources of information.
 */
const documents = {
  'company_profile.txt': `
TECHVISION INDUSTRIES - Company Profile
========================================

Founded: 2018
Headquarters: San Francisco, CA
CEO: Sarah Mitchell
Industry: Enterprise Software & AI

Mission Statement:
To revolutionize enterprise workflows through intelligent automation and AI-powered solutions.

Company Overview:
TechVision Industries is a leading provider of enterprise automation solutions. Founded by
Sarah Mitchell and David Chen, the company has grown from a 5-person startup to a global
enterprise with over 2,000 employees across 15 offices worldwide.

Key Products:
1. FlowMaster Pro - Workflow automation platform
2. DataPulse - Real-time analytics engine
3. AIAssist - AI-powered customer service solution

Market Position:
- Ranked #3 in Gartner Magic Quadrant for Enterprise Low-Code Platforms
- 500+ enterprise customers globally
- 45% year-over-year revenue growth

Recent Achievements:
- Q4 2024: Launched FlowMaster Pro 3.0 with AI capabilities
- Q3 2024: Opened new R&D center in Berlin
- Q2 2024: Achieved SOC 2 Type II certification
`,

  'financial_report.txt': `
TECHVISION INDUSTRIES - Q4 2024 Financial Summary
=================================================

REVENUE BREAKDOWN
----------------
Total Revenue: $287.5 million

By Product:
- FlowMaster Pro: $142.3M (49.5%)
- DataPulse: $89.2M (31.0%)
- AIAssist: $45.8M (15.9%)
- Professional Services: $10.2M (3.6%)

By Region:
- North America: $172.5M (60%)
- Europe: $74.8M (26%)
- Asia Pacific: $34.5M (12%)
- Rest of World: $5.7M (2%)

PROFITABILITY
-------------
Gross Profit: $215.6M (75% margin)
Operating Income: $43.1M (15% margin)
Net Income: $34.5M (12% margin)

CUSTOMER METRICS
----------------
Total Enterprise Customers: 523
Net Revenue Retention: 124%
Customer Acquisition Cost: $45,000
Lifetime Value: $892,000
LTV/CAC Ratio: 19.8x

YEAR-OVER-YEAR COMPARISON
-------------------------
Revenue Growth: +45%
Customer Growth: +38%
Employee Growth: +52%
`,

  'employee_handbook.txt': `
TECHVISION INDUSTRIES - Employee Handbook (Excerpt)
===================================================

WORK POLICIES
-------------

Remote Work:
TechVision operates on a hybrid model. Employees are expected to be in-office
a minimum of 2 days per week (Tuesday and Thursday recommended). Full remote
work is available for qualifying roles with manager approval.

Working Hours:
Core hours are 10 AM - 4 PM local time. Employees have flexibility outside
these hours. Standard work week is 40 hours.

COMPENSATION & BENEFITS
-----------------------

Salary Bands (Annual, USD):
- Engineer I: $95,000 - $120,000
- Engineer II: $120,000 - $150,000
- Senior Engineer: $150,000 - $190,000
- Staff Engineer: $190,000 - $240,000
- Principal Engineer: $240,000 - $300,000

Benefits Package:
- Health Insurance: 100% premium coverage for employees, 80% for dependents
- 401(k) Match: 6% company match, immediate vesting
- Stock Options: Granted annually based on performance
- PTO: Unlimited (minimum 15 days recommended)
- Parental Leave: 16 weeks paid for all parents

CAREER DEVELOPMENT
------------------
- Annual learning stipend: $3,000
- Conference attendance budget: $5,000/year
- Internal mobility program
- Mentorship matching service
`,

  'press_release.txt': `
FOR IMMEDIATE RELEASE

TechVision Industries Announces Strategic Partnership with GlobalTech Corp
==========================================================================

San Francisco, CA - December 15, 2024

TechVision Industries, a leader in enterprise automation, today announced a
strategic partnership with GlobalTech Corp, one of the world's largest
technology consulting firms.

Key Partnership Highlights:
- GlobalTech to become preferred implementation partner for FlowMaster Pro
- Joint go-to-market initiative targeting Fortune 500 companies
- Co-development of industry-specific solutions for healthcare and finance
- Initial 3-year partnership valued at $150 million

"This partnership represents a significant milestone for TechVision," said
CEO Sarah Mitchell. "By combining GlobalTech's implementation expertise with
our cutting-edge automation platform, we can deliver unprecedented value to
enterprise customers."

GlobalTech Corp CEO James Chen added, "We've seen tremendous demand for
intelligent automation among our clients. TechVision's technology leadership
makes them the ideal partner to address this market opportunity."

About TechVision Industries:
TechVision Industries provides AI-powered enterprise automation solutions.
For more information, visit www.techvision-industries.example.com

Contact: media@techvision-industries.example.com
`,

  'product_roadmap.txt': `
TECHVISION INDUSTRIES - 2025 Product Roadmap (CONFIDENTIAL)
===========================================================

Q1 2025 RELEASES
----------------
FlowMaster Pro 3.1
- Natural language workflow creation
- Enhanced mobile app
- Microsoft Teams integration

DataPulse 2.5
- Real-time anomaly detection
- Custom dashboard builder
- Multi-cloud data connectors

Q2 2025 RELEASES
----------------
AIAssist 2.0
- Multi-language support (20 languages)
- Voice interaction capability
- Sentiment analysis dashboard

New Product: SecurityShield
- AI-powered threat detection
- Automated compliance reporting
- Integration with FlowMaster

Q3-Q4 2025 FOCUS
----------------
Platform Unification:
- Single sign-on across all products
- Unified admin console
- Cross-product data sharing

Enterprise Features:
- On-premise deployment option
- Government cloud certification
- Advanced audit logging

INVESTMENT PRIORITIES
---------------------
- AI/ML capabilities: $45M
- Platform infrastructure: $30M
- Security & compliance: $20M
- UX improvements: $15M

Total 2025 R&D Investment: $110M
`,
};

/**
 * Create a combined context with document markers.
 */
function createMultiDocumentContext(): string {
  const parts: string[] = [];

  for (const [filename, content] of Object.entries(documents)) {
    parts.push(`[START OF DOCUMENT: ${filename}]`);
    parts.push(content.trim());
    parts.push(`[END OF DOCUMENT: ${filename}]`);
  }

  return parts.join(DOC_SEPARATOR);
}

async function main() {
  console.log('=== Multi-Document Reasoning Example ===\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  // Create combined context
  const context = createMultiDocumentContext();
  console.log(`Total context size: ${context.length.toLocaleString()} characters`);
  console.log(`Documents included: ${Object.keys(documents).length}\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 20,
    maxDepth: 2,
  });

  // Questions that require reasoning across multiple documents
  const questions = [
    // Requires: company_profile + financial_report
    'What is the relationship between FlowMaster Pro and the company\'s overall revenue?',

    // Requires: financial_report + employee_handbook
    'How does the company\'s profitability relate to its compensation philosophy?',

    // Requires: press_release + product_roadmap
    'How does the GlobalTech partnership align with the 2025 product strategy?',

    // Requires: all documents
    'Summarize TechVision\'s competitive position considering their financials, products, and partnerships.',

    // Complex multi-hop reasoning
    'If TechVision maintains its 45% revenue growth and invests $110M in R&D as planned, what percentage of next year\'s projected revenue would R&D represent?',
  ];

  console.log('Answering questions that require multi-document reasoning...\n');
  console.log('=' .repeat(80) + '\n');

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`Q${i + 1}: ${question}\n`);

    try {
      const result = await rlm.completion(question, context);

      console.log(`A${i + 1}: ${result.response}\n`);
      console.log(`   [${result.usage.totalTokens.toLocaleString()} tokens, $${result.usage.estimatedCost.toFixed(4)}, ${result.executionTime}ms]`);

      // Show trace summary
      const llmCalls = result.trace.filter((t) => t.data.type === 'llm_call').length;
      const codeExecs = result.trace.filter((t) => t.data.type === 'code_execution').length;
      console.log(`   [${llmCalls} LLM calls, ${codeExecs} code executions]\n`);

      console.log('-'.repeat(80) + '\n');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log('Done!');
}

main();
