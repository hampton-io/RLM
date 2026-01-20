/**
 * Document Q&A Example
 *
 * Demonstrates RLM's ability to answer complex questions about a document
 * that require synthesizing information from multiple sections.
 *
 * Run with: npx tsx examples/document-qa.ts
 */

import { RLM } from '../src/index.js';

/**
 * Generate a sample company report document.
 */
function generateCompanyReport(): string {
  return `
ACME CORPORATION
Annual Report 2024
================================================================================

EXECUTIVE SUMMARY
--------------------------------------------------------------------------------
ACME Corporation continued its strong performance in fiscal year 2024, achieving
record revenue of $4.2 billion, representing a 15% increase from the previous
year. This growth was driven primarily by our cloud services division and
expansion into emerging markets.

Key highlights:
- Revenue: $4.2 billion (up 15% YoY)
- Net Income: $520 million (up 22% YoY)
- Employee Count: 12,500 (up from 10,800)
- Customer Base: 45,000 enterprise clients globally

FINANCIAL PERFORMANCE
--------------------------------------------------------------------------------
Q1 2024:
  Revenue: $950 million
  Operating Income: $142 million
  Major Product Launch: CloudSync Pro

Q2 2024:
  Revenue: $1.05 billion
  Operating Income: $168 million
  Expansion: Opened offices in Singapore and Dubai

Q3 2024:
  Revenue: $1.08 billion
  Operating Income: $175 million
  Acquisition: Purchased DataFlow Inc for $180 million

Q4 2024:
  Revenue: $1.12 billion
  Operating Income: $185 million
  Partnership: Strategic alliance with TechGiant Corp

DIVISIONAL BREAKDOWN
--------------------------------------------------------------------------------
Cloud Services Division (40% of revenue):
  - Revenue: $1.68 billion
  - Growth: 28% YoY
  - Products: CloudSync, DataVault, SecureNet
  - Head: Sarah Chen (VP, Cloud Services)
  - Employees: 4,200

Enterprise Software Division (35% of revenue):
  - Revenue: $1.47 billion
  - Growth: 8% YoY
  - Products: ACME Suite, WorkFlow Pro, Analytics Hub
  - Head: Michael Torres (VP, Enterprise)
  - Employees: 3,800

Hardware Division (15% of revenue):
  - Revenue: $630 million
  - Growth: -3% YoY (planned phase-out)
  - Products: ACME Servers, Network Equipment
  - Head: James Wilson (VP, Hardware)
  - Employees: 2,100

Professional Services (10% of revenue):
  - Revenue: $420 million
  - Growth: 12% YoY
  - Services: Implementation, Training, Consulting
  - Head: Lisa Park (VP, Services)
  - Employees: 2,400

REGIONAL PERFORMANCE
--------------------------------------------------------------------------------
North America (55% of revenue):
  - Revenue: $2.31 billion
  - Growth: 12%
  - Key Markets: USA, Canada
  - Regional Head: Robert Martinez

Europe (25% of revenue):
  - Revenue: $1.05 billion
  - Growth: 18%
  - Key Markets: UK, Germany, France
  - Regional Head: Emma Schmidt

Asia Pacific (15% of revenue):
  - Revenue: $630 million
  - Growth: 35%
  - Key Markets: Japan, Australia, Singapore
  - Regional Head: David Wong

Rest of World (5% of revenue):
  - Revenue: $210 million
  - Growth: 22%
  - Key Markets: Brazil, UAE, South Africa
  - Regional Head: Ana Silva

EMPLOYEE INFORMATION
--------------------------------------------------------------------------------
Total Employees: 12,500

By Region:
  - North America: 6,500 (52%)
  - Europe: 3,100 (25%)
  - Asia Pacific: 2,200 (18%)
  - Rest of World: 700 (5%)

Executive Team:
  - CEO: Jennifer Adams (since 2019, compensation: $8.5M)
  - CFO: Thomas Brown (since 2021, compensation: $4.2M)
  - CTO: Raj Patel (since 2020, compensation: $4.8M)
  - COO: Michelle Lee (since 2022, compensation: $3.9M)

Average Employee Tenure: 4.2 years
Employee Satisfaction Score: 4.1/5.0

STRATEGIC INITIATIVES
--------------------------------------------------------------------------------
1. Cloud-First Transformation
   - Investment: $500 million over 3 years
   - Goal: 60% of revenue from cloud by 2026
   - Status: On track

2. AI Integration
   - Investment: $200 million
   - Products: AI-powered analytics in ACME Suite
   - Launch: Q2 2025

3. Sustainability Program
   - Target: Carbon neutral by 2028
   - Progress: 45% reduction achieved
   - Budget: $50 million

4. Market Expansion
   - Target Markets: India, Brazil, Indonesia
   - Investment: $150 million
   - Timeline: 2025-2027

RISK FACTORS
--------------------------------------------------------------------------------
1. Competition: Intense competition from established players and startups
2. Cybersecurity: Increasing threats require ongoing investment
3. Economic: Global economic uncertainty may impact enterprise spending
4. Talent: Competition for skilled workers in tech sector
5. Regulatory: Evolving data privacy regulations across regions

OUTLOOK FOR 2025
--------------------------------------------------------------------------------
Management expects continued growth with projected revenue of $4.8-5.0 billion
(14-19% growth). Key drivers include:
- Continued cloud services expansion
- AI product launches
- APAC market growth

Risks to outlook:
- Potential economic slowdown
- Integration of DataFlow acquisition
- Hardware division transition

================================================================================
For investor relations inquiries, contact: ir@acme-corp.example.com
================================================================================
`;
}

async function main() {
  console.log('=== Document Q&A Example ===\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error('Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable');
    process.exit(1);
  }

  // Generate the document
  const document = generateCompanyReport();
  console.log(`Document size: ${document.length.toLocaleString()} characters\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 15,
  });

  // Questions that require synthesizing information from multiple sections
  const questions = [
    'What is the fastest growing division and who leads it?',
    'Calculate the total executive compensation and compare it to the net income.',
    'Which region has the highest growth rate and what percentage of employees work there?',
    'How much has ACME invested in strategic initiatives, and what are the main goals?',
    'Compare Q1 and Q4 performance - what was the revenue growth and what major events happened?',
  ];

  console.log('Answering questions about the document...\n');
  console.log('=' .repeat(80) + '\n');

  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    console.log(`Q${i + 1}: ${question}\n`);

    try {
      const result = await rlm.completion(question, document);

      console.log(`A${i + 1}: ${result.response}\n`);
      console.log(`   [${result.usage.totalTokens} tokens, $${result.usage.estimatedCost.toFixed(4)}, ${result.executionTime}ms]\n`);
      console.log('-'.repeat(80) + '\n');
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : error}\n`);
    }
  }

  console.log('Done!');
}

main();
