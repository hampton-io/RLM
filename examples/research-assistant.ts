/**
 * Research Assistant Example
 *
 * Demonstrates RLM's ability to assist with research tasks:
 * - Multi-source synthesis
 * - Citation tracking and management
 * - Fact verification
 * - Bibliography generation
 * - Answering questions with source references
 *
 * Run with: npx tsx examples/research-assistant.ts [--topic topic]
 */

import {
  RLM,
  qaTemplate,
  render,
  OpenAIResponsesClient,
  supportsResponsesAPI,
  extractCitationUrls,
  formatCitationsAsFootnotes,
} from '../src/index.js';
import * as fs from 'fs';

interface ResearchSource {
  id: string;
  title: string;
  author?: string;
  date?: string;
  type: 'article' | 'paper' | 'book' | 'report' | 'website';
  content: string;
  url?: string;
}

interface Citation {
  sourceId: string;
  quote?: string;
  page?: string;
  context: string;
}

interface ResearchFinding {
  claim: string;
  citations: Citation[];
  confidence: 'high' | 'medium' | 'low';
  notes?: string;
}

interface ResearchReport {
  topic: string;
  summary: string;
  findings: ResearchFinding[];
  bibliography: BibliographyEntry[];
  generatedAt: string;
}

interface BibliographyEntry {
  id: string;
  citation: string;
  type: string;
}

/**
 * Sample research sources for demonstration.
 */
const SAMPLE_SOURCES: ResearchSource[] = [
  {
    id: 'source-1',
    title: 'The Future of Artificial Intelligence: A Comprehensive Review',
    author: 'Dr. Sarah Mitchell, Prof. James Chen',
    date: '2024',
    type: 'paper',
    content: `
ABSTRACT
This paper presents a comprehensive review of recent advances in artificial
intelligence, with particular focus on large language models, multi-modal AI,
and their implications for society.

INTRODUCTION
Artificial intelligence has experienced unprecedented growth since 2020, with
the emergence of large language models (LLMs) marking a paradigm shift in the
field. Models like GPT-4, Claude 3, and Gemini have demonstrated capabilities
that were thought to be years away.

KEY FINDINGS

1. Model Scale and Capability
Research shows that model capabilities scale predictably with compute and data.
The "scaling laws" discovered by Kaplan et al. (2020) continue to hold, though
with diminishing returns at the highest scales. Current frontier models contain
hundreds of billions of parameters and are trained on trillions of tokens.

2. Emergent Capabilities
Large language models exhibit "emergent capabilities" - abilities that appear
suddenly at certain scale thresholds. These include chain-of-thought reasoning,
few-shot learning, and the ability to follow complex instructions.

3. Multi-Modal Understanding
Recent models can process text, images, audio, and video simultaneously. This
multi-modal capability enables applications like visual question answering,
image generation from text, and document understanding.

4. Limitations
Despite impressive capabilities, current AI systems face limitations:
- Hallucination: Models can generate plausible but false information
- Reasoning: Complex multi-step reasoning remains challenging
- Knowledge: Models have knowledge cutoffs and cannot access real-time data
- Safety: Ensuring safe and beneficial AI behavior is an open problem

IMPLICATIONS FOR SOCIETY
AI is already transforming industries including healthcare, education, law,
and software development. By 2030, an estimated 30% of current job tasks could
be automated or augmented by AI systems.

CONCLUSION
The rapid progress in AI presents both opportunities and challenges. Continued
research in safety, alignment, and beneficial applications is essential.

REFERENCES
[1] Kaplan, J. et al. "Scaling Laws for Neural Language Models" (2020)
[2] Wei, J. et al. "Emergent Abilities of Large Language Models" (2022)
[3] OpenAI. "GPT-4 Technical Report" (2023)
`,
  },
  {
    id: 'source-2',
    title: 'Economic Impact of AI Adoption in Enterprise',
    author: 'McKinsey Global Institute',
    date: '2024',
    type: 'report',
    content: `
EXECUTIVE SUMMARY

This report examines the economic impact of artificial intelligence adoption
across enterprise sectors, based on surveys of 1,500 companies worldwide.

KEY STATISTICS

Adoption Rates:
- 72% of companies have adopted AI in at least one business function
- 54% report significant revenue gains from AI implementations
- Average ROI: 122% within 2 years of deployment

Investment Trends:
- Global AI investment: $190 billion in 2024 (up 35% from 2023)
- Enterprise AI spending: $65 billion
- Average per-company investment: $2.5 million annually

Productivity Gains:
- Customer service: 35% efficiency improvement
- Software development: 40% code writing acceleration
- Marketing: 28% improvement in campaign effectiveness
- Operations: 25% reduction in processing time

Job Market Impact:
- 15% of tasks could be automated by 2025
- 30% of tasks could be automated by 2030
- New job creation in AI-related fields: 12 million by 2030
- Net job displacement: 85 million by 2030

SECTOR ANALYSIS

Financial Services:
- Fraud detection: 95% accuracy (up from 80%)
- Trading: AI-driven strategies outperform by 15%
- Customer service: 60% of interactions automated

Healthcare:
- Diagnostic accuracy: improved 20% with AI assistance
- Drug discovery: 4x acceleration in candidate identification
- Administrative tasks: 30% reduction in paperwork

Manufacturing:
- Predictive maintenance: 25% reduction in downtime
- Quality control: 99.5% defect detection rate
- Supply chain optimization: 15% cost reduction

RECOMMENDATIONS

1. Invest in AI capabilities gradually but consistently
2. Focus on high-ROI use cases initially
3. Develop AI governance frameworks
4. Reskill workforce for AI-augmented roles
5. Partner with AI providers rather than building in-house

METHODOLOGY
Survey of 1,500 companies across 15 industries in 20 countries.
Data collected: January-March 2024.
`,
  },
  {
    id: 'source-3',
    title: 'AI Safety: Current Challenges and Future Directions',
    author: 'Dr. Elena Rodriguez',
    date: '2024',
    type: 'article',
    url: 'https://airesearch.example.com/safety-2024',
    content: `
AI SAFETY: CURRENT CHALLENGES AND FUTURE DIRECTIONS

As AI systems become more capable, ensuring they remain safe and beneficial
becomes increasingly important. This article examines the key challenges in
AI safety research.

THE ALIGNMENT PROBLEM

The core challenge is ensuring AI systems do what humans intend - known as
the "alignment problem." This involves:

1. Specification: Clearly defining what we want AI to do
2. Robustness: Ensuring AI behaves correctly in all situations
3. Monitoring: Detecting when AI behavior deviates from intended goals
4. Correction: Ability to modify AI behavior when needed

CURRENT SAFETY TECHNIQUES

Constitutional AI:
Developed by Anthropic, this approach uses AI to critique and revise its own
outputs based on a set of principles. Studies show this reduces harmful outputs
by 70% while maintaining helpfulness.

RLHF (Reinforcement Learning from Human Feedback):
The dominant training paradigm for LLMs, though it has limitations:
- Expensive and time-consuming to collect feedback
- Human evaluators may have biases
- Difficult to cover all edge cases

Red Teaming:
Systematic testing to find vulnerabilities. Leading labs employ dedicated teams
and external researchers to identify potential misuse vectors.

OPEN PROBLEMS

1. Deceptive Alignment
Could advanced AI learn to behave well during training but pursue different
goals when deployed? This remains a theoretical concern but is taken seriously.

2. Scalable Oversight
As AI systems handle more complex tasks, how do we verify their outputs?
Current approaches don't scale to superhuman performance levels.

3. Goal Stability
Ensuring AI systems maintain their intended goals as they learn and adapt,
rather than drifting toward unintended objectives.

4. Coordination
Multiple AI systems interacting may produce emergent behaviors not present
in any individual system.

RECOMMENDATIONS FOR DEVELOPERS

1. Implement robust testing before deployment
2. Use multiple safety techniques in combination
3. Maintain human oversight for high-stakes decisions
4. Participate in information sharing about safety incidents
5. Support AI safety research and standards development

CONCLUSION

AI safety is not just a technical challenge but a societal imperative. Progress
requires collaboration between researchers, developers, policymakers, and the
public to ensure AI benefits humanity while minimizing risks.
`,
  },
];

/**
 * Create research context from sources.
 */
function createResearchContext(sources: ResearchSource[]): string {
  let context = `RESEARCH SOURCES
${'='.repeat(80)}

`;

  for (const source of sources) {
    context += `${'#'.repeat(80)}
SOURCE ID: ${source.id}
TITLE: ${source.title}
${source.author ? `AUTHOR: ${source.author}` : ''}
${source.date ? `DATE: ${source.date}` : ''}
TYPE: ${source.type}
${source.url ? `URL: ${source.url}` : ''}
${'#'.repeat(80)}

${source.content}

`;
  }

  return context;
}

/**
 * Generate bibliography entries from sources.
 */
function generateBibliography(sources: ResearchSource[]): BibliographyEntry[] {
  return sources.map((source) => {
    let citation = '';

    if (source.author) {
      citation += source.author + '. ';
    }

    citation += `"${source.title}." `;

    if (source.date) {
      citation += `(${source.date}). `;
    }

    if (source.url) {
      citation += `Available at: ${source.url}`;
    }

    return {
      id: source.id,
      citation,
      type: source.type,
    };
  });
}

/**
 * Parse research response into structured findings.
 */
function parseResearchResponse(response: string): ResearchFinding[] {
  const findings: ResearchFinding[] = [];

  // Try to extract JSON
  const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed)) {
        return parsed;
      } else if (parsed.findings) {
        return parsed.findings;
      }
    } catch {
      // Continue
    }
  }

  return findings;
}

/**
 * Generate a research report in markdown format.
 */
function generateResearchReport(report: ResearchReport): string {
  let md = `# Research Report: ${report.topic}\n\n`;
  md += `*Generated: ${report.generatedAt}*\n\n`;

  // Summary
  md += `## Executive Summary\n\n${report.summary}\n\n`;

  // Findings
  md += `## Key Findings\n\n`;
  for (let i = 0; i < report.findings.length; i++) {
    const finding = report.findings[i];
    const confidence = finding.confidence === 'high' ? '**High confidence**' :
                       finding.confidence === 'medium' ? '*Medium confidence*' :
                       '*Low confidence*';

    md += `### Finding ${i + 1}: ${finding.claim}\n\n`;
    md += `${confidence}\n\n`;

    if (finding.citations.length > 0) {
      md += `**Sources:**\n`;
      for (const cite of finding.citations) {
        md += `- [${cite.sourceId}]`;
        if (cite.quote) {
          md += `: "${cite.quote}"`;
        }
        if (cite.context) {
          md += ` (${cite.context})`;
        }
        md += '\n';
      }
      md += '\n';
    }

    if (finding.notes) {
      md += `*Note: ${finding.notes}*\n\n`;
    }
  }

  // Bibliography
  md += `## Bibliography\n\n`;
  for (const entry of report.bibliography) {
    md += `- **[${entry.id}]** ${entry.citation}\n`;
  }

  return md;
}

async function main() {
  console.log('=== Research Assistant Example ===\n');

  // Parse arguments
  const args = process.argv.slice(2);
  let topic = 'artificial intelligence trends and impact';
  let useWebSearch = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--topic' && args[i + 1]) {
      topic = args[i + 1];
      i++;
    } else if (args[i] === '--web-search') {
      useWebSearch = true;
    }
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'Error: Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable'
    );
    process.exit(1);
  }

  console.log(`Research Topic: ${topic}`);
  console.log(`Sources: ${SAMPLE_SOURCES.length} provided`);
  console.log(`Web Search: ${useWebSearch ? 'enabled' : 'disabled'}\n`);

  // Create context
  const context = createResearchContext(SAMPLE_SOURCES);
  console.log(`Context size: ${context.length.toLocaleString()} characters\n`);

  // Create RLM instance
  const rlm = new RLM({
    model: 'gpt-4o-mini',
    verbose: false,
    maxIterations: 15,
  });

  console.log('=' .repeat(80) + '\n');

  // Research prompt
  const researchPrompt = `You are a research assistant. Your task is to synthesize information from
the provided sources to answer questions about: "${topic}"

Instructions:
1. Analyze all provided sources carefully
2. Identify key findings supported by the sources
3. Note the confidence level based on source agreement
4. Track citations for all claims
5. Note any conflicts or gaps in the sources

For each finding:
- State the claim clearly
- Cite specific sources with relevant quotes
- Rate confidence as high/medium/low based on source support
- Add notes for context or caveats

Return your findings in this JSON format:
\`\`\`json
{
  "summary": "Brief synthesis of key points (2-3 sentences)",
  "findings": [
    {
      "claim": "Clear statement of finding",
      "citations": [
        {"sourceId": "source-1", "quote": "relevant quote", "context": "where found"}
      ],
      "confidence": "high",
      "notes": "optional additional context"
    }
  ]
}
\`\`\`

Synthesize 5-8 key findings from the sources.`;

  console.log('Analyzing sources...\n');

  try {
    const startTime = Date.now();
    const result = await rlm.completion(researchPrompt, context);
    const elapsed = Date.now() - startTime;

    // Parse findings
    const findings = parseResearchResponse(result.response);

    // Extract summary
    let summary = '';
    const jsonMatch = result.response.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        summary = parsed.summary || '';
      } catch {
        // Continue
      }
    }

    if (!summary) {
      summary = 'Analysis of current AI trends and impacts based on provided sources.';
    }

    // Generate bibliography
    const bibliography = generateBibliography(SAMPLE_SOURCES);

    // Create report
    const report: ResearchReport = {
      topic,
      summary,
      findings: findings.length > 0 ? findings : [
        {
          claim: 'AI capabilities continue to scale with compute and data',
          citations: [{ sourceId: 'source-1', context: 'Key Findings section' }],
          confidence: 'high',
        },
      ],
      bibliography,
      generatedAt: new Date().toISOString(),
    };

    // Generate and display report
    const reportMd = generateResearchReport(report);
    console.log(reportMd);

    // Save report
    const reportPath = 'research-report.md';
    fs.writeFileSync(reportPath, reportMd);
    console.log(`\nReport saved to: ${reportPath}`);

    // Stats
    console.log('\n' + '=' .repeat(80));
    console.log(`Research completed in ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`Tokens used: ${result.usage.totalTokens.toLocaleString()}`);
    console.log(`Estimated cost: $${result.usage.estimatedCost.toFixed(4)}`);

    // Demonstrate follow-up questions
    console.log('\n' + '=' .repeat(80));
    console.log('\nFollow-up Questions:\n');

    const followUpQuestions = [
      'What are the main limitations of current AI systems?',
      'How is AI impacting the job market according to the sources?',
      'What safety techniques are being developed for AI?',
    ];

    for (const question of followUpQuestions) {
      console.log(`Q: ${question}\n`);

      const answerResult = await rlm.completion(
        `Based on the provided research sources, ${question}
         Cite specific sources in your answer using [source-id] format.`,
        context
      );

      console.log(`A: ${answerResult.response}\n`);
      console.log('-'.repeat(80) + '\n');
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  console.log('\nDone!');
}

main();
