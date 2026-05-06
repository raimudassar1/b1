import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function testExtraction() {
  const filePath = 'Textbook PDFs/Textbook_Lesson01.pdf';
  const loadingTask = pdfjsLib.getDocument({url: filePath, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/'});
  const pdfDoc = await loadingTask.promise;
  
  const page = await pdfDoc.getPage(4); // Page 4 is likely vocabulary
  const textContent = await page.getTextContent();
  const strings = textContent.items.map(item => item.str);
  
  console.log('--- Page 4 Text Dump ---');
  console.log(strings.join('\n'));
  console.log('------------------------');
}

testExtraction();