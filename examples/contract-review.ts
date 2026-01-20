/**
 * Contract Review Example
 *
 * Demonstrates RLM's ability to analyze contracts for:
 * - Identifying key clauses
 * - Flagging risky terms
 * - Extracting obligations and deadlines
 * - Comparing against standard terms
 * - Generating clause summaries
 *
 * Note: This is for demonstration purposes only and does not constitute legal advice.
 *
 * Run with: npx tsx examples/contract-review.ts [--type saas|nda|employment]
 */

import { RLM, analyzeTemplate, render } from '../src/index.js';
import * as fs from 'fs';

interface ClauseAnalysis {
  title: string;
  section: string;
  summary: string;
  riskLevel: 'high' | 'medium' | 'low' | 'standard';
  concerns?: string[];
  recommendations?: string[];
}

interface Obligation {
  party: string;
  obligation: string;
  deadline?: string;
  consequences?: string;
  clause: string;
}

interface RiskyTerm {
  term: string;
  clause: string;
  risk: string;
  riskLevel: 'high' | 'medium' | 'low';
  mitigation: string;
}

interface ContractReviewResult {
  summary: string;
  contractType: string;
  parties: string[];
  effectiveDate?: string;
  termLength?: string;
  keyClauses: ClauseAnalysis[];
  obligations: Obligation[];
  riskyTerms: RiskyTerm[];
  missingClauses: string[];
  overallRisk: 'high' | 'medium' | 'low';
  recommendations: string[];
}

/**
 * Sample contracts for demonstration.
 */
const SAMPLE_CONTRACTS = {
  saas: `
SOFTWARE AS A SERVICE AGREEMENT

This Software as a Service Agreement ("Agreement") is entered into as of
January 15, 2024 ("Effective Date") by and between:

CloudTech Solutions Inc., a Delaware corporation ("Provider")
and
Acme Corporation, a California corporation ("Customer")

RECITALS

WHEREAS, Provider offers cloud-based software services; and
WHEREAS, Customer desires to utilize such services;

NOW, THEREFORE, in consideration of the mutual covenants and agreements
hereinafter set forth, the parties agree as follows:

1. DEFINITIONS

1.1 "Services" means the cloud-based software platform and related services
described in Exhibit A, including all updates and modifications.

1.2 "Customer Data" means all data, content, and information submitted by
Customer or Customer's users to the Services.

1.3 "Confidential Information" means any non-public information disclosed by
either party that is designated as confidential or should reasonably be
understood to be confidential.

2. SERVICES AND LICENSE

2.1 Service Provision. Provider shall make the Services available to Customer
during the Term subject to the terms of this Agreement.

2.2 License Grant. Provider grants Customer a non-exclusive, non-transferable,
limited license to access and use the Services solely for Customer's internal
business purposes during the Term.

2.3 Restrictions. Customer shall not: (a) sublicense, sell, or transfer the
Services to any third party; (b) modify, copy, or create derivative works;
(c) reverse engineer, decompile, or disassemble the Services; (d) access the
Services in order to build a competitive product; (e) use the Services to
transmit malicious code or unlawful content.

3. FEES AND PAYMENT

3.1 Fees. Customer shall pay Provider the fees set forth in Exhibit B
("Subscription Fees"). All fees are in US Dollars.

3.2 Payment Terms. Invoices are due within thirty (30) days of invoice date.

3.3 Late Payment. Overdue amounts shall accrue interest at the rate of 1.5%
per month, or the maximum rate permitted by law, whichever is less.

3.4 Taxes. Customer is responsible for all taxes, excluding taxes based on
Provider's income.

3.5 Price Increases. Provider may increase Subscription Fees upon sixty (60)
days' written notice, effective at the start of any Renewal Term.

4. TERM AND TERMINATION

4.1 Initial Term. This Agreement commences on the Effective Date and continues
for twelve (12) months ("Initial Term").

4.2 Renewal. This Agreement shall automatically renew for successive one (1)
year periods ("Renewal Terms") unless either party provides written notice of
non-renewal at least sixty (60) days before the end of the then-current term.

4.3 Termination for Cause. Either party may terminate this Agreement upon
written notice if the other party: (a) materially breaches and fails to cure
within thirty (30) days of notice; or (b) becomes insolvent or files for
bankruptcy.

4.4 Termination for Convenience. Provider may terminate this Agreement for
any reason upon ninety (90) days' written notice.

4.5 Effect of Termination. Upon termination: (a) Customer's access to the
Services shall immediately cease; (b) Customer shall pay all unpaid fees;
(c) Provider shall delete Customer Data within sixty (60) days unless legally
prohibited or Customer requests data export within thirty (30) days.

5. DATA AND SECURITY

5.1 Data Ownership. Customer retains all ownership rights in Customer Data.

5.2 Data License. Customer grants Provider a non-exclusive license to use
Customer Data solely to provide the Services and improve Provider's products.

5.3 Security. Provider shall implement reasonable administrative, technical,
and physical security measures to protect Customer Data.

5.4 Data Processing. Provider may process Customer Data in the United States
and other jurisdictions where Provider operates. Customer consents to such
processing.

6. CONFIDENTIALITY

6.1 Obligations. Each party agrees to: (a) hold Confidential Information in
confidence using at least the same degree of care it uses to protect its own
confidential information; (b) not disclose Confidential Information to third
parties except as permitted herein; (c) use Confidential Information only for
purposes of this Agreement.

6.2 Exceptions. Confidential Information does not include information that:
(a) is or becomes publicly available through no fault of the receiving party;
(b) was known to the receiving party prior to disclosure; (c) is independently
developed without use of Confidential Information; (d) is rightfully obtained
from a third party.

7. INTELLECTUAL PROPERTY

7.1 Provider IP. Provider retains all rights in the Services, including all
intellectual property rights. No rights are granted except as expressly stated.

7.2 Feedback. Customer grants Provider a perpetual, irrevocable, royalty-free
license to use any feedback, suggestions, or ideas provided by Customer.

8. WARRANTIES AND DISCLAIMERS

8.1 Provider Warranties. Provider warrants that: (a) the Services will
substantially conform to the documentation; (b) Provider has the right to
grant the licenses herein.

8.2 DISCLAIMER. EXCEPT AS EXPRESSLY SET FORTH HEREIN, THE SERVICES ARE
PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. PROVIDER DISCLAIMS ALL OTHER
WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

9. LIMITATION OF LIABILITY

9.1 EXCLUSION OF DAMAGES. IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR ANY
INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, REGARDLESS
OF THE CAUSE OF ACTION OR WHETHER SUCH PARTY HAS BEEN ADVISED OF THE
POSSIBILITY OF SUCH DAMAGES.

9.2 LIABILITY CAP. PROVIDER'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT
SHALL NOT EXCEED THE FEES PAID BY CUSTOMER IN THE TWELVE (12) MONTHS PRECEDING
THE CLAIM.

9.3 EXCLUSIONS. THE LIMITATIONS IN THIS SECTION SHALL NOT APPLY TO: (a) BREACH
OF SECTION 6 (CONFIDENTIALITY); (b) CUSTOMER'S PAYMENT OBLIGATIONS; (c) EITHER
PARTY'S GROSS NEGLIGENCE OR WILLFUL MISCONDUCT.

10. INDEMNIFICATION

10.1 Provider Indemnification. Provider shall defend Customer against any
claim that the Services infringe any third party intellectual property right
and indemnify Customer for resulting damages.

10.2 Customer Indemnification. Customer shall defend and indemnify Provider
against any claim arising from: (a) Customer Data; (b) Customer's use of the
Services in violation of this Agreement; (c) Customer's breach of applicable
laws.

11. GENERAL PROVISIONS

11.1 Governing Law. This Agreement shall be governed by the laws of the State
of Delaware without regard to conflicts of law principles.

11.2 Dispute Resolution. Any dispute shall be resolved through binding
arbitration in San Francisco, California under AAA Commercial Arbitration Rules.

11.3 Force Majeure. Neither party shall be liable for delays due to causes
beyond its reasonable control.

11.4 Assignment. Customer may not assign this Agreement without Provider's
written consent. Provider may assign this Agreement to an affiliate or in
connection with a merger or acquisition.

11.5 Entire Agreement. This Agreement constitutes the entire agreement between
the parties and supersedes all prior agreements.

11.6 Amendments. This Agreement may only be amended by a written document
signed by both parties.

11.7 Severability. If any provision is held unenforceable, the remaining
provisions shall continue in effect.

11.8 Waiver. Failure to enforce any provision shall not constitute a waiver.

11.9 Notices. All notices shall be in writing and sent to the addresses set
forth in Exhibit C.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the
Effective Date.

CLOUDTECH SOLUTIONS INC.          ACME CORPORATION

By: _________________________     By: _________________________
Name: John Smith                  Name: Jane Doe
Title: CEO                        Title: VP Operations
Date: January 15, 2024            Date: January 15, 2024

EXHIBIT A: SERVICE DESCRIPTION
[To be attached]

EXHIBIT B: PRICING
Annual Subscription: $120,000/year
Users: Up to 100 users
Storage: 500 GB included
Support: Business hours email support

EXHIBIT C: NOTICE ADDRESSES
[To be attached]
`,

  nda: `
MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of
January 10, 2024 ("Effective Date") by and between:

TechVenture Labs LLC ("Party A")
Address: 100 Innovation Way, Austin, TX 78701

and

StartupCo Inc. ("Party B")
Address: 500 Founder Street, San Francisco, CA 94105

(each a "Party" and collectively the "Parties")

RECITALS

The Parties wish to explore a potential business relationship and, in
connection therewith, may disclose confidential information to each other.

AGREEMENT

1. DEFINITION OF CONFIDENTIAL INFORMATION

1.1 "Confidential Information" means any and all non-public technical,
business, financial, or other information disclosed by either Party ("Discloser")
to the other Party ("Recipient"), whether orally, in writing, or in any other
form, that: (a) is designated as confidential at the time of disclosure; or
(b) a reasonable person would understand to be confidential given the nature
of the information or circumstances of disclosure.

1.2 Confidential Information includes, but is not limited to: trade secrets,
proprietary data, inventions, processes, techniques, algorithms, software code,
designs, drawings, engineering, hardware configurations, marketing plans,
customer lists, financial information, business strategies, and personnel data.

2. OBLIGATIONS

2.1 The Recipient agrees to:
(a) Hold all Confidential Information in strict confidence;
(b) Not disclose Confidential Information to any third party without prior
    written consent of the Discloser;
(c) Use Confidential Information only for the Purpose defined in Section 3;
(d) Protect Confidential Information using at least the same degree of care
    used to protect its own confidential information, but no less than
    reasonable care;
(e) Limit access to Confidential Information to employees and contractors
    who have a need to know and who are bound by confidentiality obligations
    at least as protective as this Agreement.

2.2 The Recipient shall promptly notify the Discloser of any unauthorized
disclosure or use of Confidential Information.

3. PURPOSE

The Parties are disclosing Confidential Information solely for the purpose of
evaluating a potential technology partnership or joint venture ("Purpose").

4. EXCLUSIONS

4.1 This Agreement does not apply to information that:
(a) Is or becomes publicly available through no fault of the Recipient;
(b) Was in the Recipient's possession prior to disclosure without restriction;
(c) Is independently developed by the Recipient without use of Confidential
    Information;
(d) Is rightfully received from a third party without restriction;
(e) Is approved for release by written authorization of the Discloser.

4.2 Recipient may disclose Confidential Information if required by law,
regulation, or court order, provided that Recipient: (a) gives prompt written
notice to Discloser to allow Discloser to seek protective measures; and
(b) discloses only the minimum information required.

5. OWNERSHIP AND NO LICENSE

5.1 All Confidential Information remains the property of the Discloser. No
license or right is granted by this Agreement except the limited right to use
Confidential Information for the Purpose.

5.2 Nothing in this Agreement obligates either Party to enter into any
further agreement or business relationship.

6. TERM AND TERMINATION

6.1 This Agreement shall remain in effect for two (2) years from the
Effective Date unless earlier terminated by either Party upon thirty (30)
days' written notice.

6.2 The obligations regarding Confidential Information shall survive
termination of this Agreement for a period of five (5) years from the date
of disclosure, or until the information no longer qualifies as Confidential
Information under Section 4.1, whichever is earlier.

6.3 Trade secrets shall remain protected for as long as they qualify as trade
secrets under applicable law.

7. RETURN OF INFORMATION

7.1 Upon termination of this Agreement or upon request by the Discloser, the
Recipient shall promptly: (a) return all tangible materials containing
Confidential Information; (b) destroy all copies of Confidential Information
in its possession; and (c) certify in writing that it has complied with this
Section.

7.2 Notwithstanding the foregoing, Recipient may retain one copy of
Confidential Information in its legal files solely for compliance purposes,
subject to the ongoing confidentiality obligations of this Agreement.

8. NO WARRANTY

CONFIDENTIAL INFORMATION IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND.
NEITHER PARTY MAKES ANY REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED,
REGARDING THE ACCURACY, COMPLETENESS, OR PERFORMANCE OF ANY CONFIDENTIAL
INFORMATION.

9. REMEDIES

9.1 Each Party acknowledges that breach of this Agreement may cause
irreparable harm for which monetary damages would be inadequate. Therefore,
each Party shall be entitled to seek injunctive or other equitable relief
without the need to post bond, in addition to any other remedies available
at law or equity.

9.2 The prevailing party in any action to enforce this Agreement shall be
entitled to recover reasonable attorneys' fees and costs.

10. GENERAL PROVISIONS

10.1 Governing Law. This Agreement shall be governed by the laws of the
State of California without regard to conflicts of law principles.

10.2 Jurisdiction. Any dispute shall be resolved in the state or federal
courts located in San Francisco County, California.

10.3 Assignment. Neither Party may assign this Agreement without the prior
written consent of the other Party, except to an affiliate or in connection
with a merger or acquisition.

10.4 Entire Agreement. This Agreement constitutes the entire agreement
between the Parties regarding the subject matter hereof.

10.5 Amendments. This Agreement may only be amended by a written document
signed by both Parties.

10.6 Severability. If any provision is held unenforceable, the remaining
provisions shall continue in effect.

10.7 Counterparts. This Agreement may be executed in counterparts, each of
which shall be deemed an original.

10.8 Notices. All notices shall be in writing and delivered to the addresses
set forth above.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the
Effective Date.

TECHVENTURE LABS LLC              STARTUPCO INC.

By: _________________________     By: _________________________
Name: Robert Chen                 Name: Sarah Kim
Title: Managing Partner           Title: CEO
Date: January 10, 2024            Date: January 10, 2024
`,

  employment: `
EMPLOYMENT AGREEMENT

This Employment Agreement ("Agreement") is entered into as of February 1, 2024
("Effective Date") by and between:

TechCorp Inc., a Delaware corporation ("Company")
Address: 1000 Tech Boulevard, San Jose, CA 95110

and

Alex Johnson ("Employee")
Address: 456 Residential Lane, San Jose, CA 95112

RECITALS

The Company desires to employ Employee, and Employee desires to be employed by
the Company, on the terms and conditions set forth herein.

AGREEMENT

1. POSITION AND DUTIES

1.1 Position. Employee is employed as Senior Software Engineer, reporting to
the Director of Engineering.

1.2 Duties. Employee shall perform duties as assigned by the Company,
including but not limited to: software development, code review, technical
design, and mentoring junior engineers.

1.3 Full-Time Employment. Employee shall devote full business time and
attention to the affairs of the Company. Employee shall not engage in any
other employment or business activity without prior written consent.

1.4 Location. Employee's primary work location shall be the Company's San Jose
office, with flexibility for remote work up to two (2) days per week at
Company's discretion.

2. COMPENSATION

2.1 Base Salary. Company shall pay Employee an annual base salary of
One Hundred Eighty Thousand Dollars ($180,000), payable in accordance with
the Company's regular payroll practices, less applicable withholdings.

2.2 Signing Bonus. Employee shall receive a one-time signing bonus of
Twenty Thousand Dollars ($20,000), payable within thirty (30) days of the
Effective Date. If Employee voluntarily terminates employment or is terminated
for Cause within twelve (12) months, Employee shall repay the signing bonus
on a prorated basis.

2.3 Annual Bonus. Employee shall be eligible for an annual performance bonus
of up to 15% of base salary, based on individual and company performance
metrics as determined by Company in its sole discretion.

2.4 Equity. Subject to Board approval, Employee shall receive a stock option
grant of 10,000 shares of Company common stock under the Company's 2024 Stock
Option Plan, with a four (4) year vesting schedule and one (1) year cliff.

3. BENEFITS

3.1 Health Insurance. Employee shall be eligible to participate in the
Company's health, dental, and vision insurance plans, with premiums paid 80%
by Company and 20% by Employee.

3.2 401(k). Employee may participate in the Company's 401(k) plan with Company
matching contributions up to 4% of salary.

3.3 PTO. Employee shall receive twenty (20) days of paid time off per year,
accruing on a monthly basis.

3.4 Other Benefits. Employee shall be eligible for other benefits generally
made available to similarly situated employees.

4. EMPLOYMENT TERM

4.1 At-Will Employment. Employee's employment is "at-will," meaning either
party may terminate the employment relationship at any time, with or without
cause, and with or without notice.

4.2 Termination by Company. Company may terminate Employee's employment:
(a) For Cause, immediately upon notice; or
(b) Without Cause, upon two (2) weeks' notice or pay in lieu of notice.

4.3 Termination by Employee. Employee may terminate employment upon two (2)
weeks' written notice.

4.4 Definition of Cause. "Cause" means: (a) material breach of this Agreement;
(b) conviction of a felony or crime involving dishonesty; (c) willful
misconduct or gross negligence; (d) failure to perform duties after written
notice and opportunity to cure; (e) violation of Company policies.

5. SEVERANCE

5.1 If Company terminates Employee without Cause and Employee signs a general
release of claims, Company shall provide: (a) three (3) months of base salary
continuation; (b) COBRA premium payments for three (3) months; (c) accelerated
vesting of an additional six (6) months of equity.

5.2 No severance shall be provided if Employee is terminated for Cause,
resigns voluntarily, or is terminated during the first ninety (90) days of
employment.

6. CONFIDENTIALITY

6.1 Employee acknowledges access to Confidential Information including trade
secrets, customer data, financial information, and business strategies.

6.2 Employee agrees to hold all Confidential Information in strict confidence,
not disclose to third parties, and use only for Company business.

6.3 Confidentiality obligations survive termination of employment indefinitely
for trade secrets and five (5) years for other Confidential Information.

7. INTELLECTUAL PROPERTY

7.1 Work Product. All work product, inventions, and intellectual property
created by Employee within the scope of employment shall be the sole property
of Company ("Work Product").

7.2 Assignment. Employee hereby assigns to Company all rights in Work Product.
Employee shall execute any documents necessary to perfect Company's ownership.

7.3 Prior Inventions. Employee has disclosed in Exhibit A any prior inventions
that should be excluded from this Agreement.

8. NON-SOLICITATION

8.1 During employment and for twelve (12) months thereafter, Employee shall
not, directly or indirectly:
(a) Solicit, recruit, or hire any Company employee;
(b) Encourage any employee to leave Company employment;
(c) Solicit any Company customer or prospective customer with whom Employee
had material contact.

9. NON-COMPETITION

9.1 During employment and for twelve (12) months thereafter, Employee shall
not, within the United States, directly or indirectly engage in or be employed
by any business that competes with Company's primary business.

9.2 Employee acknowledges that this restriction is reasonable given Employee's
access to Confidential Information and customer relationships.

10. REPRESENTATIONS

10.1 Employee represents that: (a) Employee is not bound by any agreement
that would prevent performance under this Agreement; (b) Employee will not
bring any confidential information from prior employers; (c) all information
provided to Company is truthful and complete.

11. GENERAL PROVISIONS

11.1 Governing Law. This Agreement shall be governed by the laws of the
State of California.

11.2 Arbitration. Any dispute shall be resolved through binding arbitration
in Santa Clara County, California under JAMS Employment Arbitration Rules.

11.3 Entire Agreement. This Agreement, together with the Exhibits, constitutes
the entire agreement between the parties.

11.4 Amendments. This Agreement may only be modified in writing signed by
both parties.

11.5 Severability. If any provision is unenforceable, the remaining provisions
shall continue in effect.

11.6 Withholding. Company may withhold taxes and other amounts as required by
law.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the
Effective Date.

TECHCORP INC.                     EMPLOYEE

By: _________________________     _________________________
Name: Jennifer Lee                Alex Johnson
Title: VP Human Resources
Date: February 1, 2024            Date: February 1, 2024

EXHIBIT A: PRIOR INVENTIONS
None disclosed.
`,
};

/**
 * Create contract context for analysis.
 */
function createContractContext(contract: string, type: string): string {
  return `CONTRACT DOCUMENT FOR REVIEW
Contract Type: ${type}
${'='.repeat(80)}

${contract}

${'='.repeat(80)}`;
}

/**
 * Parse review response into structured result.
 */
function parseReviewResponse(response: string): Partial<ContractReviewResult> {
  const result: Partial<ContractReviewResult> = {
    keyClauses: [],
    obligations: [],
    riskyTerms: [],
    missingClauses: [],
    recommendations: [],
  };

  // Try to extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      Object.assign(result, parsed);
    } catch {
      result.summary = response.slice(0, 500);
    }
  } else {
    result.summary = response.slice(0, 500);
  }

  return result;
}

/**
 * Generate a markdown review report.
 */
function generateReviewReport(
  review: Partial<ContractReviewResult>,
  contractType: string
): string {
  let report = `# Contract Review Report\n\n`;
  report += `**Contract Type:** ${contractType}\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Disclaimer:** This analysis is for informational purposes only and does not constitute legal advice.\n\n`;

  // Overall Risk Assessment
  if (review.overallRisk) {
    const riskIcon =
      review.overallRisk === 'high' ? '🔴 HIGH' :
      review.overallRisk === 'medium' ? '🟡 MEDIUM' : '🟢 LOW';
    report += `## Overall Risk: ${riskIcon}\n\n`;
  }

  // Summary
  if (review.summary) {
    report += `## Executive Summary\n\n${review.summary}\n\n`;
  }

  // Parties
  if (review.parties && review.parties.length > 0) {
    report += `## Parties\n\n`;
    for (const party of review.parties) {
      report += `- ${party}\n`;
    }
    report += '\n';
  }

  // Key Terms
  if (review.effectiveDate || review.termLength) {
    report += `## Key Terms\n\n`;
    if (review.effectiveDate) report += `- **Effective Date:** ${review.effectiveDate}\n`;
    if (review.termLength) report += `- **Term:** ${review.termLength}\n`;
    report += '\n';
  }

  // Key Clauses
  if (review.keyClauses && review.keyClauses.length > 0) {
    report += `## Key Clauses Analysis\n\n`;
    for (const clause of review.keyClauses) {
      const riskIcon =
        clause.riskLevel === 'high' ? '🔴' :
        clause.riskLevel === 'medium' ? '🟡' :
        clause.riskLevel === 'low' ? '🟢' : '⚪';

      report += `### ${riskIcon} ${clause.title}\n\n`;
      report += `**Section:** ${clause.section}\n\n`;
      report += `${clause.summary}\n\n`;

      if (clause.concerns && clause.concerns.length > 0) {
        report += `**Concerns:**\n`;
        for (const concern of clause.concerns) {
          report += `- ${concern}\n`;
        }
        report += '\n';
      }

      if (clause.recommendations && clause.recommendations.length > 0) {
        report += `**Recommendations:**\n`;
        for (const rec of clause.recommendations) {
          report += `- ${rec}\n`;
        }
        report += '\n';
      }
    }
  }

  // Risky Terms
  if (review.riskyTerms && review.riskyTerms.length > 0) {
    report += `## Risky Terms\n\n`;
    report += `| Term | Clause | Risk Level | Risk | Mitigation |\n`;
    report += `|------|--------|------------|------|------------|\n`;
    for (const term of review.riskyTerms) {
      const riskIcon =
        term.riskLevel === 'high' ? '🔴' :
        term.riskLevel === 'medium' ? '🟡' : '🟢';
      report += `| ${term.term} | ${term.clause} | ${riskIcon} ${term.riskLevel} | ${term.risk} | ${term.mitigation} |\n`;
    }
    report += '\n';
  }

  // Obligations
  if (review.obligations && review.obligations.length > 0) {
    report += `## Obligations and Deadlines\n\n`;
    for (const obligation of review.obligations) {
      report += `### ${obligation.party}\n\n`;
      report += `- **Obligation:** ${obligation.obligation}\n`;
      if (obligation.deadline) report += `- **Deadline:** ${obligation.deadline}\n`;
      if (obligation.consequences) report += `- **Consequences:** ${obligation.consequences}\n`;
      report += `- **Reference:** ${obligation.clause}\n\n`;
    }
  }

  // Missing Clauses
  if (review.missingClauses && review.missingClauses.length > 0) {
    report += `## Missing or Weak Clauses\n\n`;
    for (const clause of review.missingClauses) {
      report += `- ${clause}\n`;
    }
    report += '\n';
  }

  // Recommendations
  if (review.recommendations && review.recommendations.length > 0) {
    report += `## Recommendations\n\n`;
    for (let i = 0; i < review.recommendations.length; i++) {
      report += `${i + 1}. ${review.recommendations[i]}\n`;
    }
    report += '\n';
  }

  return report;
}

async function main() {
  console.log('=== Contract Review Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let contractType: keyof typeof SAMPLE_CONTRACTS = 'saas';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      contractType = args[i + 1] as keyof typeof SAMPLE_CONTRACTS;
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

  const contract = SAMPLE_CONTRACTS[contractType];
  if (!contract) {
    console.error(`Unknown contract type: ${contractType}`);
    console.error(`Available: ${Object.keys(SAMPLE_CONTRACTS).join(', ')}`);
    process.exit(1);
  }

  console.log(`Contract Type: ${contractType.toUpperCase()}`);
  console.log(`Contract Size: ${contract.length.toLocaleString()} characters\n`);
  console.log('Note: This is for demonstration purposes only and does not constitute legal advice.\n');

  // Create context
  const context = createContractContext(contract, contractType);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 20,
  });

  console.log('=' .repeat(80) + '\n');

  // Review prompt
  const reviewPrompt = `Review this ${contractType} contract and provide a comprehensive analysis.

Your review should include:

1. **Summary**: Brief overview of the contract's purpose and key terms
2. **Parties**: Identify all parties involved
3. **Key Dates**: Effective date, term length, renewal terms
4. **Key Clauses**: Analyze significant clauses with risk assessment
5. **Risky Terms**: Identify terms that could be problematic
6. **Obligations**: Extract all obligations with deadlines
7. **Missing Clauses**: Note any standard clauses that are missing
8. **Overall Risk**: Assess overall risk level (high/medium/low)
9. **Recommendations**: Provide actionable recommendations

For each clause, assess risk level as:
- high: Significantly unfavorable or legally risky
- medium: Somewhat unfavorable or needs clarification
- low: Slightly unfavorable but acceptable
- standard: Industry standard language

Return your analysis in this JSON format:
\`\`\`json
{
  "summary": "Brief contract summary",
  "contractType": "${contractType}",
  "parties": ["Party A", "Party B"],
  "effectiveDate": "January 15, 2024",
  "termLength": "12 months with auto-renewal",
  "keyClauses": [
    {
      "title": "Limitation of Liability",
      "section": "Section 9",
      "summary": "Analysis of the clause",
      "riskLevel": "high",
      "concerns": ["Concern 1", "Concern 2"],
      "recommendations": ["Recommendation 1"]
    }
  ],
  "obligations": [
    {
      "party": "Customer",
      "obligation": "Pay fees",
      "deadline": "30 days from invoice",
      "consequences": "Interest charges",
      "clause": "Section 3.2"
    }
  ],
  "riskyTerms": [
    {
      "term": "Auto-renewal",
      "clause": "Section 4.2",
      "risk": "Risk description",
      "riskLevel": "medium",
      "mitigation": "Mitigation strategy"
    }
  ],
  "missingClauses": ["Data breach notification", "Service Level Agreement"],
  "overallRisk": "medium",
  "recommendations": ["Recommendation 1", "Recommendation 2"]
}
\`\`\`

Be thorough and focus on protecting the interests of a business reviewing this contract.`;

  console.log('Analyzing contract...\n');

  try {
    const startTime = Date.now();
    const result = await rlm.completion(reviewPrompt, context);
    const elapsed = Date.now() - startTime;

    // Parse the response
    const review = parseReviewResponse(result.response);

    // Generate report
    const report = generateReviewReport(review, contractType);

    // Output report
    console.log(report);

    // Save report
    const reportPath = `contract-review-${contractType}.md`;
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
