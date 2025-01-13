import OpenAI from 'openai';

export class OpenAIHandler {
    constructor(apiKey) {
        this.openai = new OpenAI({ apiKey });
    }

    async selectBestUrl(docNumber, title, urlList) {
        const today = new Date().toISOString().split('T')[0];  // YYYY-MM-DD format

        const prompt = `Document being searched: ${docNumber} - ${title}
Current date: ${today}

List of URLs found:
${urlList.map(u => `URL: ${u.url}\nTitle: ${u.title}`).join('\n\n')}

You are an Air Force document expert. Select the single most authoritative and information-rich URL from the list above.

Key Selection Rules:
1. For official publications (AFI, AFMAN, AFDP):
   - ALWAYS prefer PDF versions over web pages
   - URLs must be exact - pay attention to document numbering format:
     CORRECT: "AFDP1-1" or "AFDP_1-1" (no spaces)
     INCORRECT: "AFDP 1-1" (has spaces)
   - e-publishing.af.mil PDFs are best for AFI/AFMAN
   - doctrine.af.mil PDFs are best for AFDP
   - Choose most recent version based on current date: ${today}
2. For other content (Core Values, Songs):
   - Official military websites are preferred
   - Complete content over summaries
   - Prefer current/maintained pages over archived versions

Respond ONLY with the full URL. No other text.`;

        try {
            const completion = await this.openai.chat.completions.create({
                model: "gpt-4",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.2,
                max_tokens: 100
            });

            return completion.choices[0].message.content.trim();
        } catch (error) {
            console.error('OpenAI API error:', error);
            return null;
        }
    }
} 