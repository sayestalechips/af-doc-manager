import * as XLSX from 'xlsx';
import { writeFile } from 'fs/promises';

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
            // No content processing here - it's already done in index.js
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, 'Updated Documents');

            const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
            await writeFile(outputPath, buffer);
            
            return true;
        } catch (error) {
            console.error('Excel Write Error:', error);
            throw new Error(`Error writing Excel file: ${error.message}`);
        }
    }
}
