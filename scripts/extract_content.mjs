import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractLessonContent(lessonId) {
  const paddedId = String(lessonId).padStart(2, '0');
  const filePath = `Textbook PDFs/Textbook_Lesson${paddedId}.pdf`;
  
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return null;
  }

  const content = {
    id: lessonId,
    dialogues: [],
    vocabulary: [],
    exercises: []
  };

  try {
    const loadingTask = pdfjsLib.getDocument({url: filePath, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/'});
    const pdfDoc = await loadingTask.promise;
    
    // We're generating placeholder structured data for now.
    // Real extraction requires bounding box analysis for Pinyin/Chinese alignment.
    
    content.vocabulary.push({ ch: '你好', py: 'nǐ hǎo', en: 'Hello' });
    content.vocabulary.push({ ch: '臺灣', py: 'Táiwān', en: 'Taiwan' });
    content.vocabulary.push({ ch: '謝謝', py: 'xièxiè', en: 'Thank you' });
    content.vocabulary.push({ ch: '對不起', py: 'duìbùqǐ', en: 'Sorry' });
    
    content.dialogues.push({
      title: 'Dialogue 1',
      messages: [
        { speaker: 'A', ch: '你好嗎？', py: 'Nǐ hǎo ma?', en: 'How are you?' },
        { speaker: 'B', ch: '我很好，謝謝。', py: 'Wǒ hěn hǎo, xièxiè.', en: 'I am fine, thank you.' }
      ]
    });

    content.exercises.push({
      title: 'Speaking Practice',
      content: 'Read the dialogue above with a partner and focus on your tones.'
    });

    return content;
  } catch (err) {
    console.error(`Error processing ${filePath}:`, err.message);
    return null;
  }
}

async function main() {
  const allData = {};
  for (let i = 1; i <= 15; i++) {
    const data = await extractLessonContent(i);
    if (data) {
      allData[i] = data;
    }
  }
  
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data');
  }
  fs.writeFileSync('data/content.json', JSON.stringify(allData, null, 2));
  console.log('Extraction complete. Saved to data/content.json');
}

main();