import { ExcelHandler } from './utils/excelHandler.js';
import { UrlFinder } from './services/urlFinder.js';

export default class AFDocManager {
    constructor(config) {
        this.urlFinder = new UrlFinder(config.firecrawlApiKey, config.braveApiKey);
        this.batchSize = config.batchSize || 10;
        this.retryAttempts = config.retryAttempts || 3;
    }

    /**
     * Process Excel file with document information
     * @param {string} inputPath - Path to input Excel file
     * @param {string} outputPath - Path for output Excel file
     */
    async processDocuments(inputPath, outputPath) {
        try {
            // Read Excel file
            console.log('Reading Excel file...');
            const fileContent = await window.fs.readFile(inputPath);
            const documents = ExcelHandler.readExcelFile(fileContent);
            
            // Validate Excel structure
            ExcelHandler.validateExcelStructure(documents);

            // Process in batches
            const results = [];
            for (let i = 0; i < documents.length; i += this.batchSize) {
                const batch = documents.slice(i, i + this.batchSize);
                const batchResults = await this._processBatch(batch);
                results.push(...batchResults);

                // Progress update
                console.log(`Processed ${i + batch.length}/${documents.length} documents`);
            }

            // Update Excel with results
            const updatedData = this._prepareExcelUpdate(documents, results);
            await ExcelHandler.writeExcelFile(updatedData, outputPath);

            return {
                success: true,
                totalProcessed: documents.length,
                results: this._generateSummary(results)
            };

        } catch (error) {
            console.error('Error processing documents:', error);
            throw error;
        }
    }

    /**
     * Process a batch of documents
     * @private
     */
    async _processBatch(documents) {
        const results = [];
        
        for (const doc of documents) {
            try {
                const result = await this.urlFinder.findUrlAndExtractContent(doc);
                
                results.push({
                    documentName: doc['Document Name'],
                    ...result  // This now includes success, error, url, content, metadata
                });
                
            } catch (error) {
                console.error(`Error processing document ${doc['Document Name']}:`, error);
                results.push({
                    documentName: doc['Document Name'],
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Prepare data for Excel update
     * @private
     */
    _prepareExcelUpdate(originalDocs, results) {
        return originalDocs.map(doc => {
            const result = results.find(r => r.documentName === doc['Document Name']);
            
            if (!result || !result.success) {
                return {
                    ...doc,
                    'Processing Status': 'Failed',
                    'Error': result?.error || 'Unknown error',
                    'Last Checked': new Date().toISOString()
                };
            }

            // Extract key sections from content
            const sections = this._extractSections(result.content);

            return {
                ...doc,
                'Link': result.newUrl,
                'Original Link': doc.Link,
                'Title': sections.title || result.metadata?.title || '',
                'Summary': sections.summary || '',
                'Key Points': sections.keyPoints || '',
                'Full Content': result.content,  // Keep full content but in separate column
                'Processing Status': 'Success',
                'Last Updated': new Date().toISOString(),
                'Content Length': result.content?.length || 0,
                'Language': result.metadata?.language || 'en',
                'Source': result.metadata?.source || '',
                'PDF Page Count': result.metadata?.pdfMetadata?.pageCount || ''
            };
        });
    }

    _extractSections(content) {
        if (!content) return {};

        try {
            // Find the title (first heading)
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1] : '';

            // Get first paragraph as summary
            const paragraphs = content.split('\n\n');
            const summary = paragraphs[0] || '';

            // Extract key points (bullet points or numbered lists)
            const keyPointsRegex = /(?:^\d+\.|^\*|\-)\s+(.+)$/gm;
            const keyPoints = [...content.matchAll(keyPointsRegex)]
                .map(match => match[1])
                .join('\n');

            return {
                title,
                summary,
                keyPoints
            };
        } catch (error) {
            console.error('Error extracting sections:', error);
            return {};
        }
    }

    /**
     * Generate processing summary
     * @private
     */
    _generateSummary(results) {
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        return {
            total: results.length,
            successful: successful.length,
            failed: failed.length,
            failureReasons: this._aggregateFailures(failed)
        };
    }

    /**
     * Aggregate failure reasons
     * @private
     */
    _aggregateFailures(failedResults) {
        return failedResults.reduce((acc, result) => {
            const reason = result.error || 'Unknown error';
            acc[reason] = (acc[reason] || 0) + 1;
            return acc;
        }, {});
    }
}

// Update the example usage to use ES modules
if (import.meta.url === `file://${process.argv[1]}`) {
    const manager = new AFDocManager({
        firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
        batchSize: 5,
        retryAttempts: 3
    });

    manager.processDocuments(
        'input.xlsx',
        'output.xlsx'
    ).then(result => {
        console.log('Processing complete:', result);
    }).catch(error => {
        console.error('Processing failed:', error);
    });
}
