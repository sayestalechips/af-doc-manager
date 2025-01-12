import FirecrawlApp from '@mendable/firecrawl-js';
import dotenv from 'dotenv';

dotenv.config();

async function testFirecrawl() {
    const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
    
    // Test URLs
    const urls = [
        'https://www.doctrine.af.mil/Portals/61/documents/AFDP_1/AFDP-1.pdf',
        'https://www.stalechips.com/_files/ugd/46f139_b88439f9062b41c3bbe82b6c18fac781.pdf'
    ];

    for (const url of urls) {
        console.log(`\nProcessing URL: ${url}`);
        try {
            const result = await app.scrapeUrl(url, {
                formats: ['markdown']
            });

            if (!result.success) {
                console.error(`Failed to scrape ${url}:`, result.error);
                continue;
            }

            // Clean and structure the markdown
            let cleanContent = result.markdown
                // Remove image markdown
                .replace(/!\[.*?\]\(.*?\)/g, '')
                // Remove empty lines
                .replace(/\n\s*\n/g, '\n')
                // Remove special characters and formatting
                .replace(/\$\^.*?\$/g, '')
                // Clean up extra spaces
                .trim();

            // Create structured content
            const structuredContent = {
                url: url,
                title: result.metadata?.title || 'Untitled Document',
                type: url.endsWith('.pdf') ? 'PDF Document' : 'Web Page',
                content: cleanContent,
                metadata: {
                    source: result.metadata?.sourceURL,
                    language: result.metadata?.language || 'en',
                    lastScraped: new Date().toISOString()
                }
            };

            console.log('Structured Content:', JSON.stringify(structuredContent, null, 2));

        } catch (error) {
            console.error(`Error processing ${url}:`, error.message);
        }
    }
}

// Run the test
testFirecrawl().catch(console.error);