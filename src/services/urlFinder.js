import FirecrawlApp from '@mendable/firecrawl-js';

export class UrlFinder {
    constructor(firecrawlApiKey, braveApiKey) {
        this.app = new FirecrawlApp({ apiKey: firecrawlApiKey });
        this.braveApiKey = braveApiKey;
        this.BRAVE_SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
        this.lastBraveCallTime = 0;  // Track last API call time
        
        console.log('UrlFinder initialized with API keys:', {
            firecrawl: !!firecrawlApiKey,
            brave: !!braveApiKey
        });
    }

    /**
     * Ensure minimum delay between Brave API calls
     * @private
     */
    async _rateLimitBraveCall() {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastBraveCallTime;
        const minDelay = 1000; // 1 second minimum between calls

        if (timeSinceLastCall < minDelay) {
            const waitTime = minDelay - timeSinceLastCall;
            console.log(`Rate limiting: waiting ${waitTime}ms before next Brave API call`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastBraveCallTime = Date.now();
    }

    /**
     * Find URL for document using Brave Search
     * @param {Object} doc - Document object from Excel
     * @returns {Promise<string|null>} Found URL or null
     */
    async findUrlAndExtractContent(doc) {
        try {
            console.log('\nSearching for document:', {
                name: doc['Document Name'],
                title: doc['Title']
            });

            const url = await this.findDocumentUrl(doc['Document Name'], doc['Title']);
            if (!url) {
                return {
                    success: false,
                    error: 'No valid URL found'
                };
            }

            // Get the content
            const content = await this._validateDocumentContent(url, doc);
            if (!content) {
                return {
                    success: false,
                    error: 'Content extraction or validation failed',
                    url: url  // Include the URL even if content extraction failed
                };
            }

            // Return success with all data
            return {
                success: true,
                url: url,
                newUrl: url,  // To match the Excel structure
                content: content.content,
                metadata: content.metadata,
                title: content.title
            };
        } catch (error) {
            console.error('Error finding URL and extracting content:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async findDocumentUrl(docNumber, title) {
        try {
            await this._rateLimitBraveCall();

            const searchQuery = `"${docNumber}" filetype:pdf site:doctrine.af.mil`;
            console.log('\nBrave search details:', {
                docNumber,
                title,
                fullQuery: searchQuery
            });

            const searchResponse = await fetch(`${this.BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(searchQuery)}`, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': this.braveApiKey
                }
            });

            const results = await searchResponse.json();
            
            // Get all PDF URLs - NO version parameter
            const pdfUrls = results.web?.results
                ?.filter(r => 
                    r.url.endsWith('.pdf') && 
                    this._isValidDomain(r.url)
                )
                .map(r => ({
                    url: r.url,  // Use raw URL
                    title: r.title
                })) || [];
            
            console.log('Found PDF URLs:', pdfUrls);

            if (pdfUrls.length > 0) {
                console.log('Using first PDF found:', pdfUrls[0].url);
                return pdfUrls[0].url;
            }

            console.log('No PDF URLs found');
            return null;

        } catch (error) {
            console.error(`Error searching for document ${docNumber}:`, error);
            return null;
        }
    }

    _isValidDomain(url) {
        try {
            const urlObj = new URL(url);
            const validDomains = [
                'e-publishing.af.mil',
                'static.e-publishing.af.mil',
                'doctrine.af.mil',
                'www.af.mil',
                'www.airforce.com',
                'www.afpc.af.mil'
            ];
            return validDomains.some(domain => urlObj.hostname.endsWith(domain));
        } catch {
            return false;
        }
    }

    _addVersionParameter(url) {
        try {
            const urlObj = new URL(url);
            if (!urlObj.searchParams.has('ver')) {
                urlObj.searchParams.append('ver', 'current');
            }
            return urlObj.toString();
        } catch {
            return `${url}?ver=current`;
        }
    }

    async _validateDocumentContent(url, doc) {
        try {
            console.log('Starting Firecrawl extraction for:', url);
            
            const result = await this.app.scrapeUrl(url, {
                formats: ['markdown']
            });

            if (!result.success || !result.markdown) {
                console.error(`Failed to scrape ${url}:`, result.error);
                return null;
            }

            // Clean and structure the markdown
            let cleanContent = result.markdown
                .replace(/!\[.*?\]\(.*?\)/g, '')
                .replace(/\n\s*\n/g, '\n')
                .replace(/\$\^.*?\$/g, '')
                .trim();

            // Create structured content - exactly like test-firecrawl.js
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

            // Only validate after we have the content
            const docNumber = doc['Document Name'].toLowerCase();
            const docTitle = doc['Title'].toLowerCase();
            const isValid = cleanContent.toLowerCase().includes(docNumber) || 
                           cleanContent.toLowerCase().includes(docTitle);

            return isValid ? structuredContent : null;

        } catch (error) {
            console.error(`Error processing ${url}:`, error.message);
            return null;
        }
    }
}
