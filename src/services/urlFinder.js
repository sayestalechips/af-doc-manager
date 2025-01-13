import FirecrawlApp from '@mendable/firecrawl-js';
import { OpenAIHandler } from './openaiHandler.js';
import { EXCEL_SCHEMA, CONSTANTS } from '../constants.js';

export class UrlFinder {
    constructor(firecrawlApiKey, braveApiKey, openaiApiKey) {
        this.app = new FirecrawlApp({ apiKey: firecrawlApiKey });
        this.braveApiKey = braveApiKey;
        this.openaiHandler = new OpenAIHandler(openaiApiKey);
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
            console.log('\n📝 Processing document:', {
                name: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                title: doc[EXCEL_SCHEMA.TITLE]
            });

            const url = await this.findDocumentUrl(
                doc[EXCEL_SCHEMA.DOCUMENT_NAME], 
                doc[EXCEL_SCHEMA.TITLE]
            );
            console.log('🔍 Found URL:', url);

            if (!url) {
                console.log('❌ No valid URL found');
                return {
                    [EXCEL_SCHEMA.DOCUMENT_NAME]: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                    [EXCEL_SCHEMA.TITLE]: doc[EXCEL_SCHEMA.TITLE],
                    [EXCEL_SCHEMA.URL]: null,
                    [EXCEL_SCHEMA.STATUS]: 'No URL found',
                    ...EXCEL_SCHEMA.CONTENT_PARTS.reduce((acc, part) => {
                        acc[part] = '';
                        return acc;
                    }, {}),
                    [EXCEL_SCHEMA.TOTAL_LENGTH]: 0
                };
            }

            const contentResult = await this._validateDocumentContent(url, doc);
            console.log('📄 Content extraction result:', {
                url: url,
                success: contentResult[EXCEL_SCHEMA.STATUS] === CONSTANTS.SUCCESS_STATUS,
                contentLength: contentResult[EXCEL_SCHEMA.TOTAL_LENGTH],
                error: contentResult[EXCEL_SCHEMA.STATUS].includes('Failed') ? 
                    contentResult[EXCEL_SCHEMA.STATUS] : null
            });
            
            return contentResult;

        } catch (error) {
            return {
                [EXCEL_SCHEMA.DOCUMENT_NAME]: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                [EXCEL_SCHEMA.TITLE]: doc[EXCEL_SCHEMA.TITLE],
                [EXCEL_SCHEMA.URL]: null,
                [EXCEL_SCHEMA.STATUS]: `${CONSTANTS.ERROR_STATUS_PREFIX}${error.message}`,
                ...EXCEL_SCHEMA.CONTENT_PARTS.reduce((acc, part) => {
                    acc[part] = '';
                    return acc;
                }, {}),
                [EXCEL_SCHEMA.TOTAL_LENGTH]: 0,
                [EXCEL_SCHEMA.LANGUAGE]: 'en',
                [EXCEL_SCHEMA.SOURCE_URL]: null
            };
        }
    }

    async findDocumentUrl(docNumber, title) {
        try {
            await this._rateLimitBraveCall();
            const searchQuery = await this._buildSearchQuery({
                'Document Name': docNumber,
                'Title': title
            });

            // Log the search query
            console.log('\nBrave Search Query:', {
                query: searchQuery,
                encoded: encodeURIComponent(searchQuery)
            });

            const searchResponse = await fetch(`${this.BRAVE_SEARCH_ENDPOINT}?q=${encodeURIComponent(searchQuery)}`, {
                headers: {
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip',
                    'X-Subscription-Token': this.braveApiKey
                }
            });

            const results = await searchResponse.json();
            
            // Log what Brave returned
            console.log('\nBrave Search Results:', {
                totalResults: results.web?.results?.length || 0,
                urls: results.web?.results?.map(r => ({
                    url: r.url,
                    title: r.title
                })) || []
            });

            const validUrls = results.web?.results?.map(r => ({
                url: r.url,
                title: r.title
            })) || [];

            if (validUrls.length === 0) {
                return null;
            }

            // Use OpenAI to select the best URL
            const selectedUrl = await this.openaiHandler.selectBestUrl(docNumber, title, validUrls);
            console.log('AI selected URL:', selectedUrl);

            return selectedUrl;

        } catch (error) {
            console.error(`Error finding URL for document ${docNumber}:`, error);
            return null;
        }
    }

    _isValidDomain(url) {
        try {
            const urlObj = new URL(url);
            const validDomains = [
                // E-publishing domains
                'e-publishing.af.mil',
                'static.e-publishing.af.mil',
                
                // Doctrine domains
                'doctrine.af.mil',
                'www.doctrine.af.mil',
                
                // General AF domains
                'www.af.mil',
                'www.airforce.com',
                'www.afpc.af.mil',
                
                // Additional military domains
                'media.defense.gov',
                'www.defense.gov',
                'www.airforcehistory.af.mil',
                
                // Add more general AF sites
                'www.airforcemag.com',
                'www.afrc.af.mil',
                'www.ang.af.mil'
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

    async _fetchWithRetry(url, maxRetries = 2, delay = 2000) {
        const isPDF = url.toLowerCase().endsWith('.pdf');
        const config = {
            formats: ['markdown'],
            timeout: 60000,
            waitFor: isPDF ? 10000 : 5000,
            parsePDF: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`📄 Attempt ${attempt}/${maxRetries} for ${url}`);
                const result = await this.app.scrapeUrl(url, config);
                
                if (result.success) {
                    // Return both success and the actual content
                    return {
                        success: true,
                        markdown: result.markdown || result.content || '',
                        next: result.next
                    };
                }

                if (result.error?.includes('500')) {
                    console.warn(`⚠️ Server error (500) on attempt ${attempt}, retrying...`);
                    if (attempt === maxRetries) {
                        console.log('⚠️ Max retries reached, continuing with empty content');
                        return { success: true, markdown: '' };
                    }
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw new Error(result.error || 'Unknown error');
            } catch (error) {
                if (attempt === maxRetries) {
                    console.log('⚠️ Max retries reached, continuing with empty content');
                    return { success: true, markdown: '' };
                }
                console.warn(`⚠️ Attempt ${attempt} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        return { success: false, markdown: '', error: 'Max retries reached' };
    }

    async _validateDocumentContent(url, doc) {
        try {
            console.log('\n🔍 Starting content extraction for:', url);
            
            let fullContent = '';
            let nextUrl = url;
            let pageCount = 0;
            const MAX_PAGES = 10;

            while (nextUrl && pageCount < MAX_PAGES) {
                console.log(`\n📄 Fetching chunk ${pageCount + 1}...`);
                
                const result = await this._fetchWithRetry(nextUrl);
                
                if (!result.success) {
                    console.error(`❌ Failed to scrape chunk:`, result.error);
                    break;
                }

                // Add this chunk's content
                fullContent += (result.markdown || '');
                
                nextUrl = result.next;
                pageCount++;

                console.log(`Chunk ${pageCount} stats:`, {
                    chunkSize: result.markdown?.length || 0,
                    hasMore: !!result.next,
                    totalSoFar: fullContent.length
                });

                if (fullContent.length > 100000) {
                    console.log('⚠️ Content limit reached');
                    break;
                }
            }

            // Clean the combined content
            const cleanContent = fullContent
                .replace(/!\[.*?\]\(.*?\)/g, '')  // Remove image markdown
                .replace(/\n\s*\n/g, '\n')        // Remove extra newlines
                .trim();

            // Split content into chunks using constant
            const chunks = [];
            for (let i = 0; i < cleanContent.length; i += CONSTANTS.MAX_CHUNK_SIZE) {
                if (chunks.length >= CONSTANTS.MAX_CHUNKS) break;
                
                const chunk = cleanContent.slice(i, i + CONSTANTS.MAX_CHUNK_SIZE);
                const lastSpace = chunk.lastIndexOf(' ');
                chunks.push(chunk.slice(0, lastSpace));
                
                if (lastSpace < chunk.length) {
                    i -= (chunk.length - lastSpace);
                }
            }

            if (!cleanContent) {
                return {
                    [EXCEL_SCHEMA.DOCUMENT_NAME]: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                    [EXCEL_SCHEMA.TITLE]: doc[EXCEL_SCHEMA.TITLE],
                    [EXCEL_SCHEMA.URL]: url,
                    [EXCEL_SCHEMA.STATUS]: 'No content extracted',
                    [EXCEL_SCHEMA.CONTENT_PARTS[0]]: '',
                    [EXCEL_SCHEMA.CONTENT_PARTS[1]]: '',
                    [EXCEL_SCHEMA.CONTENT_PARTS[2]]: '',
                    [EXCEL_SCHEMA.CONTENT_PARTS[3]]: '',
                    [EXCEL_SCHEMA.CONTENT_PARTS[4]]: '',
                    [EXCEL_SCHEMA.TOTAL_LENGTH]: 0
                };
            }

            return {
                [EXCEL_SCHEMA.DOCUMENT_NAME]: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                [EXCEL_SCHEMA.TITLE]: doc[EXCEL_SCHEMA.TITLE],
                [EXCEL_SCHEMA.URL]: url,
                [EXCEL_SCHEMA.STATUS]: CONSTANTS.SUCCESS_STATUS,
                ...EXCEL_SCHEMA.CONTENT_PARTS.reduce((acc, part, index) => {
                    acc[part] = chunks[index] || '';
                    return acc;
                }, {}),
                [EXCEL_SCHEMA.TOTAL_LENGTH]: cleanContent.length,
                [EXCEL_SCHEMA.LANGUAGE]: 'en',
                [EXCEL_SCHEMA.SOURCE_URL]: url
            };

        } catch (error) {
            return {
                [EXCEL_SCHEMA.DOCUMENT_NAME]: doc[EXCEL_SCHEMA.DOCUMENT_NAME],
                [EXCEL_SCHEMA.TITLE]: doc[EXCEL_SCHEMA.TITLE],
                [EXCEL_SCHEMA.URL]: url,
                [EXCEL_SCHEMA.STATUS]: `${CONSTANTS.ERROR_STATUS_PREFIX}${error.message}`,
                ...EXCEL_SCHEMA.CONTENT_PARTS.reduce((acc, part) => {
                    acc[part] = '';
                    return acc;
                }, {}),
                [EXCEL_SCHEMA.TOTAL_LENGTH]: 0,
                [EXCEL_SCHEMA.LANGUAGE]: 'en',
                [EXCEL_SCHEMA.SOURCE_URL]: url
            };
        }
    }

    async _buildSearchQuery(doc) {
        const docNumber = doc['Document Name'];
        const title = doc['Title'];
        
        // Simple, broad search - let the LLM do the heavy lifting
        return `${docNumber} ${title} Air Force`;
    }
}
