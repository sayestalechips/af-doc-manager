import * as XLSX from 'xlsx';
import { writeFile, readFile } from 'fs/promises';
import { EXCEL_SCHEMA, CONSTANTS } from '../constants.js';

export class ExcelHandler {
    /**
     * Read Excel file and convert to JSON
     * @param {Buffer|Uint8Array} fileContent - The Excel file content
     * @returns {Object[]} Array of row objects
     */
    static readExcelFile(fileContent) {
        try {
            const workbook = XLSX.read(fileContent, { type: 'buffer' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            return XLSX.utils.sheet_to_json(firstSheet);
        } catch (error) {
            throw new Error(`Error reading Excel file: ${error.message}`);
        }
    }

    /**
     * Write data back to Excel file
     * @param {Object[]} data - Array of row objects to write
     * @param {string} outputPath - Path to write the Excel file
     */
    static async writeExcelFile(data, outputPath) {
        try {
            // Validate input data
            if (!data || data.length === 0) {
                throw new Error('No input data provided to Excel writer');
            }

            // Process and validate content chunks
            const processedData = data.map(row => {
                // Ensure each content part stays within Excel limits
                EXCEL_SCHEMA.CONTENT_PARTS.forEach(part => {
                    if (row[part] && row[part].length > CONSTANTS.MAX_CHUNK_SIZE) {
                        console.warn(`⚠️ Content in ${part} exceeds Excel cell limit for document ${row[EXCEL_SCHEMA.DOCUMENT_NAME]}`);
                        row[part] = row[part].substring(0, CONSTANTS.MAX_CHUNK_SIZE - 100) + '... [truncated]';
                    }
                });

                // Calculate actual total length from chunks
                const actualLength = EXCEL_SCHEMA.CONTENT_PARTS.reduce((total, part) => {
                    return total + (row[part]?.length || 0);
                }, 0);

                return {
                    ...row,
                    [EXCEL_SCHEMA.TOTAL_LENGTH]: actualLength,
                    [EXCEL_SCHEMA.HAS_CONTENT]: actualLength > 0 ? 'Yes' : 'No'
                };
            });

            console.log('📊 Writing to Excel:', {
                rowCount: processedData.length,
                sampleRow: {
                    document: processedData[0][EXCEL_SCHEMA.DOCUMENT_NAME],
                    hasContent: !!processedData[0][EXCEL_SCHEMA.CONTENT_PARTS[0]],
                    totalLength: processedData[0][EXCEL_SCHEMA.TOTAL_LENGTH],
                    chunks: EXCEL_SCHEMA.CONTENT_PARTS.map(part => ({
                        part,
                        length: processedData[0][part]?.length || 0
                    }))
                }
            });

            // Create workbook and write
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(processedData);
            XLSX.utils.book_append_sheet(wb, ws, 'Updated Documents');
            
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            await writeFile(outputPath, buffer);
            
            console.log(`✅ Successfully wrote ${processedData.length} rows to Excel`);
            return true;
        } catch (error) {
            console.error('Excel Write Error:', error);
            throw new Error(`Error writing Excel file: ${error.message}`);
        }
    }

    /**
     * Test method to write sample data to Excel
     * @param {Object} sampleData - Known good data from URL finder
     * @param {string} outputPath - Where to write the test file
     */
    static async writeTestFile(sampleData, outputPath = 'test_output.xlsx') {
        try {
            console.log('\n🍌 Writing test Excel file with sample data');
            
            // Check if file exists and read existing data
            let existingData = [];
            try {
                const fileContent = await readFile(outputPath);
                const workbook = XLSX.read(fileContent, { type: 'buffer' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                existingData = XLSX.utils.sheet_to_json(firstSheet);
            } catch (error) {
                console.log('🍌 No existing file, starting fresh');
            }

            // Create a new row with our data
            const newRow = {
                [EXCEL_SCHEMA.DOCUMENT_NAME]: sampleData[EXCEL_SCHEMA.DOCUMENT_NAME],
                [EXCEL_SCHEMA.TITLE]: sampleData[EXCEL_SCHEMA.TITLE],
                [EXCEL_SCHEMA.URL]: sampleData[EXCEL_SCHEMA.URL],
                [EXCEL_SCHEMA.STATUS]: sampleData[EXCEL_SCHEMA.STATUS],
                [EXCEL_SCHEMA.TOTAL_LENGTH]: sampleData[EXCEL_SCHEMA.TOTAL_LENGTH],
                [EXCEL_SCHEMA.LANGUAGE]: sampleData[EXCEL_SCHEMA.LANGUAGE],
                [EXCEL_SCHEMA.SOURCE_URL]: sampleData[EXCEL_SCHEMA.SOURCE_URL],
                [EXCEL_SCHEMA.LAST_UPDATED]: new Date().toISOString(),
            };

            // Add content parts
            EXCEL_SCHEMA.CONTENT_PARTS.forEach(part => {
                newRow[part] = sampleData[part] || '';
            });

            // Append the new row to existing data
            existingData.push(newRow);

            // Write back to Excel
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(existingData);
            XLSX.utils.book_append_sheet(wb, ws, 'Updated Documents');
            
            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            await writeFile(outputPath, buffer);
            
            console.log('🍌 Test file updated successfully:', {
                totalRows: existingData.length,
                lastDocument: newRow[EXCEL_SCHEMA.DOCUMENT_NAME],
                contentSizes: EXCEL_SCHEMA.CONTENT_PARTS.map(part => ({
                    part,
                    length: newRow[part]?.length || 0
                }))
            });

            return true;
        } catch (error) {
            console.error('🍌 Error writing test file:', error);
            throw error;
        }
    }
}
