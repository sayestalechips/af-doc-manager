# AF Document Manager

This tool helps manage Air Force document URLs and content extraction.

## Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)
- API keys for:
  - Firecrawl
  - Brave Search

## Installation

1. Clone the repository or download the files

2. Install dependencies:
```bash
npm install
```

3. Create a .env file in the root directory with your API keys:
```env
FIRECRAWL_API_KEY=your_firecrawl_api_key_here
BRAVE_API_KEY=your_brave_api_key_here
```

## Required Dependencies

```bash
npm install xlsx lodash papaparse firecrawl dotenv
```

## Running Tests

To test with a single document:
```bash
npm run test-single
```

## Project Structure

```
af-doc-manager/
├── src/
│   ├── index.js              # Main application
│   ├── test-single.js        # Single row test
│   ├── utils/
│   │   └── excelHandler.js   # Excel operations
│   └── services/
│       ├── urlFinder.js      # URL search and validation
│       └── contentExtractor.js # Content extraction
├── .env                      # API keys (create this)
└── package.json             # Project configuration
```

## Usage

1. Place your Excel file in the project directory
2. Update the test-single.js with your file name if different
3. Run the test script
4. Check test-output.xlsx for results