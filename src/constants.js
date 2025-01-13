// New file to establish shared constants and types
export const EXCEL_SCHEMA = {
    // Required fields
    DOCUMENT_NAME: 'Document Name',
    TITLE: 'Title',
    URL: 'Link',
    STATUS: 'Status',
    
    // Content fields
    CONTENT_PARTS: [
        'Content_Part1',
        'Content_Part2',
        'Content_Part3',
        'Content_Part4',
        'Content_Part5'
    ],
    
    // Metadata fields
    TOTAL_LENGTH: 'Total Length',
    LANGUAGE: 'Language',
    SOURCE_URL: 'Source',
    LAST_UPDATED: 'Last Updated',
    HAS_CONTENT: 'Has Content'
};

export const CONSTANTS = {
    MAX_CHUNK_SIZE: 32000,
    MAX_CHUNKS: 5,
    SUCCESS_STATUS: 'Success',
    ERROR_STATUS_PREFIX: 'Error: '
}; 