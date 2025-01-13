import { ExcelHandler } from './utils/excelHandler.js';
import { UrlFinder } from './services/urlFinder.js';
import { EXCEL_SCHEMA, CONSTANTS } from './constants.js';

export default class AFDocManager {
    constructor(config) {
        this.urlFinder = new UrlFinder(
            config.firecrawlApiKey, 
            config.braveApiKey,
            config.openaiApiKey
        );
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
            const updatedData = this._prepareExcelUpdate(results);
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
                console.log('\n🔄 Processing batch document:', doc[EXCEL_SCHEMA.DOCUMENT_NAME]);
                
                const result = await this.urlFinder.findUrlAndExtractContent(doc);
                console.log('📦 URL Finder returned:', {
                    document: result[EXCEL_SCHEMA.DOCUMENT_NAME],
                    url: result[EXCEL_SCHEMA.URL],
                    status: result[EXCEL_SCHEMA.STATUS],
                    contentLength: result[EXCEL_SCHEMA.TOTAL_LENGTH],
                    hasContent: !!result[EXCEL_SCHEMA.CONTENT_PARTS[0]]
                });

                // Test Excel writing with this result
                await ExcelHandler.writeTestFile(result, 'bananas.xlsx');
                
                results.push(result);
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Error processing document ${doc[EXCEL_SCHEMA.DOCUMENT_NAME]}:`, error);
                results.push({
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
                });
            }
        }

        console.log('\n📊 Batch Results Summary:', results.map(r => ({
            document: r[EXCEL_SCHEMA.DOCUMENT_NAME],
            status: r[EXCEL_SCHEMA.STATUS],
            contentLength: r[EXCEL_SCHEMA.TOTAL_LENGTH]
        })));

        return results;
    }

    /**
     * Prepare data for Excel update
     * @private
     */
    _prepareExcelUpdate(results) {
        console.log('\n🔍 Preparing Excel Update');
        
        return results.map(result => ({
            [EXCEL_SCHEMA.DOCUMENT_NAME]: result[EXCEL_SCHEMA.DOCUMENT_NAME],
            [EXCEL_SCHEMA.TITLE]: result[EXCEL_SCHEMA.TITLE],
            [EXCEL_SCHEMA.URL]: result[EXCEL_SCHEMA.URL],
            [EXCEL_SCHEMA.STATUS]: result[EXCEL_SCHEMA.STATUS],
            ...EXCEL_SCHEMA.CONTENT_PARTS.reduce((acc, part) => {
                acc[part] = result[part] || '';
                return acc;
            }, {}),
            [EXCEL_SCHEMA.TOTAL_LENGTH]: result[EXCEL_SCHEMA.TOTAL_LENGTH],
            [EXCEL_SCHEMA.LANGUAGE]: result[EXCEL_SCHEMA.LANGUAGE],
            [EXCEL_SCHEMA.SOURCE_URL]: result[EXCEL_SCHEMA.SOURCE_URL],
            [EXCEL_SCHEMA.LAST_UPDATED]: new Date().toISOString()
        }));
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
        const successful = results.filter(r => 
            r[EXCEL_SCHEMA.STATUS] === CONSTANTS.SUCCESS_STATUS
        );
        const failed = results.filter(r => 
            r[EXCEL_SCHEMA.STATUS] !== CONSTANTS.SUCCESS_STATUS
        );

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
            const reason = result[EXCEL_SCHEMA.STATUS].replace(CONSTANTS.ERROR_STATUS_PREFIX, '') || 'Unknown error';
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
