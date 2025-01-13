import { readFile } from 'fs/promises';
import AFDocManager from './index.js';
import { ExcelHandler } from './utils/excelHandler.js';
import dotenv from 'dotenv';

// Make sure this runs first
dotenv.config();

async function testSingleRow() {
    try {
        // Debug: Check API keys are loaded
        console.log('Environment check:', {
            hasBraveKey: !!process.env.BRAVE_API_KEY,
            hasFirecrawlKey: !!process.env.FIRECRAWL_API_KEY
        });

        console.log('Starting file read test...');
        
        // Read the original Excel file
        const fileContent = await readFile('RAMJET CLIN 12.xlsx');
        const documents = ExcelHandler.readExcelFile(fileContent);

        // Take first 5 rows for testing
        const testRows = documents.slice(0, 5);

        console.log('\nSearching for documents:', testRows.map(doc => ({
            name: doc['Document Name'],
            title: doc['Title']
        })));

        // Initialize AFDocManager with BOTH API keys
        const manager = new AFDocManager({
            firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
            braveApiKey: process.env.BRAVE_API_KEY,
            batchSize: 5,
            retryAttempts: 3
        });

        // Add URL format comparison logging
        console.log('\nURL Format Comparison:');
        console.log('Known working URL format:', 'https://www.e-publishing.af.mil/Portals/1/Documents/TQ%20Template%20User%20Guide%20v20201208.1.pdf');
        
        // Process the single document - ignore Excel's URL
        const results = await manager._processBatch(testRows.map(doc => ({
            ...doc,
            'Link ': undefined
        })));
        
        // Analyze results
        const analysis = results.reduce((acc, result, index) => {
            const docName = testRows[index]['Document Name'];
            
            if (result.success) {
                acc.successful.push({
                    docName,
                    url: result.url,
                    hasContent: !!result.content
                });
            } else {
                acc.failed.push({
                    docName,
                    error: result.error
                });
            }
            return acc;
        }, { successful: [], failed: [] });

        // Log analysis
        console.log('\n📊 Results Analysis:');
        console.log(`Total documents processed: ${results.length}`);
        console.log(`✅ Successful URL finds: ${analysis.successful.length}`);
        console.log(`❌ Failed attempts: ${analysis.failed.length}`);
        
        console.log('\nSuccessful documents:');
        analysis.successful.forEach(doc => {
            console.log(`- ${doc.docName}: ${doc.url} (Content extracted: ${doc.hasContent})`);
        });

        console.log('\nFailed documents:');
        analysis.failed.forEach(doc => {
            console.log(`- ${doc.docName}: ${doc.error}`);
        });

        // Prepare Excel data - now including URLs even without content
        const updatedData = testRows.map((row, index) => {
            const result = results[index];
            return {
                'Document Name': row['Document Name'],
                'Title': row['Title'],
                'Attempted URL': result.url || '',
                'Final URL': result.newUrl || result.url || '',
                'Status': result.error ? `Error: ${result.error}` : (result.success ? 'Success' : 'Unknown'),
                'Content': result.content || '',
                'Total Content Length': result.content?.length || 0,
                'Scrape Timestamp': new Date().toISOString(),
                'Metadata': JSON.stringify(result.metadata || {}),
                
                // Debug info
                'Success': result.success ? 'Yes' : 'No',
                'Error': result.error || '',
                'Content Parts': result.metadata?.chunks || 0
            };
        });

        // Add debug logging
        console.log('\n📝 Data being sent to Excel:', 
            updatedData.map(row => ({
                document: row['Document Name'],
                attemptedUrl: row['Attempted URL'],
                finalUrl: row['Final URL'],
                contentLength: row['Total Content Length'],
                status: row['Status']
            }))
        );

        // Save to Excel
        await ExcelHandler.writeExcelFile(updatedData, 'test-output.xlsx');
        console.log('\n✅ Excel file saved with URLs and status updates');

    } catch (error) {
        console.error('Test failed:', error);
        if (error.code === 'ENOENT') {
            console.error('\nError: Excel file not found. Please ensure "RAMJET CLIN 12.xlsx" is in the project root directory.');
        } else {
            console.error('\nError details:', error);
        }
    }
}

// Run the test
testSingleRow();