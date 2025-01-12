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

        // Take just the first row for testing
        const singleRowData = [documents[0]];
        
        console.log('\nSearching for document:', {
            name: singleRowData[0]['Document Name'],
            title: singleRowData[0]['Title']
        });

        // Initialize AFDocManager with BOTH API keys
        const manager = new AFDocManager({
            firecrawlApiKey: process.env.FIRECRAWL_API_KEY,
            braveApiKey: process.env.BRAVE_API_KEY,
            batchSize: 1,
            retryAttempts: 3
        });

        // Add URL format comparison logging
        console.log('\nURL Format Comparison:');
        console.log('Known working URL format:', 'https://www.e-publishing.af.mil/Portals/1/Documents/TQ%20Template%20User%20Guide%20v20201208.1.pdf');
        
        // Process the single document - ignore Excel's URL
        const result = await manager._processBatch(singleRowData.map(doc => ({
            ...doc,
            'Link ': undefined
        })));
        
        // Log the URL that Brave found
        if (result && result.length > 0) {
            try {
                // Let AFDocManager handle all Excel operations
                const outputPath = 'test-output.xlsx';
                const updatedData = manager._prepareExcelUpdate(singleRowData, result);
                await ExcelHandler.writeExcelFile(updatedData, outputPath);
                
                console.log(`\n✅ Excel file saved to ${outputPath}`);
                console.log('\nColumns in output:', Object.keys(updatedData[0]));
            } catch (error) {
                console.error('\n❌ Excel Save Error:', error);
            }
        }
        
        console.log('\nProcessing Result:', JSON.stringify(result, null, 2));
        
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