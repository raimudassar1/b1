const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

// 1. CSS
const practiceCss = `
/* ─── PRACTICE TAB ───────────────────────────────────────────── */
#panel-practice { background: var(--bg); display: none; }
#panel-practice.active { display: flex; flex-direction: column; }

.practice-subnav {
  display: flex; gap: 8px; padding: 12px 16px;
  background: var(--white); border-bottom: 1px solid var(--border);
  flex-shrink: 0; justify-content: center;
}
.p-sub-btn {
  padding: 8px 16px; border-radius: 8px; font-weight: 500;
  border: 1.5px solid var(--border2); background: var(--bg2); color: var(--ink2);
  cursor: pointer; transition: 0.2s;
}
.p-sub-btn.active { background: var(--red); color: #fff; border-color: var(--red); }

.practice-content { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; align-items: center; }

/* Flashcards */
.flashcard-container {
  width: 100%; max-width: 400px; height: 260px;
  perspective: 1000px; cursor: pointer; margin-bottom: 24px;
}
.flashcard {
  width: 100%; height: 100%; position: relative;
  transition: transform 0.6s; transform-style: preserve-3d;
  box-shadow: var(--shadow); border-radius: var(--radius);
}
.flashcard.flipped { transform: rotateY(180deg); }
.flashcard-face {
  position: absolute; width: 100%; height: 100%;
  backface-visibility: hidden; background: var(--white);
  border-radius: var(--radius); display: flex; flex-direction: column;
  align-items: center; justify-content: center; border: 1px solid var(--border);
}
.flashcard-front { color: var(--ink); }
.flashcard-back { transform: rotateY(180deg); background: var(--bg2); }
.fc-ch { font-size: 64px; font-family: var(--serif); }
.fc-py { font-size: 24px; color: var(--red); font-weight: 500; margin-bottom: 8px; }
.fc-en { font-size: 18px; color: var(--ink2); }
.fc-controls { display: flex; gap: 16px; }
.fc-btn { padding: 10px 24px; border-radius: 8px; border: 1px solid var(--border2); background: var(--white); cursor: pointer; font-weight: 600; }

/* Chat Dialogues */
.chat-container { width: 100%; max-width: 600px; display: flex; flex-direction: column; gap: 16px; padding-bottom: 40px; }
.chat-controls { display: flex; gap: 12px; margin-bottom: 20px; justify-content: center; width: 100%; }
.chat-bubble-wrapper { display: flex; width: 100%; }
.chat-bubble-wrapper.left { justify-content: flex-start; }
.chat-bubble-wrapper.right { justify-content: flex-end; }
.chat-speaker { width: 36px; height: 36px; border-radius: 50%; background: var(--border2); display: flex; align-items: center; justify-content: center; font-weight: 600; margin-top: auto; }
.chat-bubble {
  max-width: 75%; padding: 12px 16px; border-radius: 18px; position: relative;
  font-size: 16px; line-height: 1.5; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.chat-bubble-wrapper.left .chat-bubble { background: var(--white); border-bottom-left-radius: 4px; margin-left: 8px; }
.chat-bubble-wrapper.right .chat-bubble { background: #E3F2FD; border-bottom-right-radius: 4px; margin-right: 8px; }
.chat-ch { font-family: var(--serif); font-size: 18px; color: var(--ink); }
.chat-py { font-size: 14px; color: var(--red); margin-top: 4px; display: none; }
.chat-en { font-size: 14px; color: var(--ink3); margin-top: 4px; display: none; }
.show-py .chat-py { display: block; }
.show-en .chat-en { display: block; }
`;

html = html.replace('/* ─── TOAST ──────────────────────────────────────────────────── */', practiceCss + '\n/* ─── TOAST ──────────────────────────────────────────────────── */');

// 2. HTML: Tab Button
const tabBtn = `
    <button class="tab-btn" data-tab="practice" onclick="switchTab('practice')">
      <span class="tab-icon">🧠</span> <span class="tab-text">Practice</span>
    </button>
  </div>`;
html = html.replace('  </div>\n\n  <!-- CONTENT -->', tabBtn + '\n\n  <!-- CONTENT -->');

// 3. HTML: Practice Panel
const practicePanel = `
    <!-- ══ PRACTICE PANEL ══ -->
    <div id="panel-practice" class="panel">
      <div class="practice-subnav">
        <button class="p-sub-btn active" onclick="setPracticeMode('vocab')">Vocabulary</button>
        <button class="p-sub-btn" onclick="setPracticeMode('dialogue')">Dialogues</button>
        <button class="p-sub-btn" onclick="setPracticeMode('exercise')">Exercises</button>
      </div>
      <div class="practice-content" id="practice-content-area">
        <!-- Dynamic Content -->
      </div>
    </div>
`;
html = html.replace('<!-- ══ WHITEBOARD PANEL ══ -->', practicePanel + '\n    <!-- ══ WHITEBOARD PANEL ══ -->');

// 4. JS: Logic
const practiceJs = `
// ──────────────────────────────────────────────
// PRACTICE TAB LOGIC
// ──────────────────────────────────────────────
let practiceData = null;
let currentPracticeMode = 'vocab';
let currentFcIndex = 0;
let showChatPy = false;
let showChatEn = false;

async function loadPracticeData() {
  try {
    const res = await fetch('data/content.json');
    if (res.ok) {
      practiceData = await res.json();
    }
  } catch (e) {
    console.log("No practice data available.");
  }
}

function setPracticeMode(mode) {
  currentPracticeMode = mode;
  document.querySelectorAll('.p-sub-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(mode.substring(0,4))));
  renderPracticeContent();
}

function renderPracticeContent() {
  const area = document.getElementById('practice-content-area');
  area.innerHTML = '';
  
  if (!practiceData || !practiceData[parseInt(currentLessonId)]) {
    area.innerHTML = '<div style="color:var(--ink3); margin-top: 40px;">No practice content available for this lesson.</div>';
    return;
  }
  
  const data = practiceData[parseInt(currentLessonId)];
  
  if (currentPracticeMode === 'vocab') {
    if (!data.vocabulary || data.vocabulary.length === 0) {
      area.innerHTML = '<div>No vocabulary found.</div>';
      return;
    }
    
    // Ensure index is valid
    if (currentFcIndex >= data.vocabulary.length) currentFcIndex = 0;
    const vocab = data.vocabulary[currentFcIndex];
    
    area.innerHTML = \`
      <div class="flashcard-container" onclick="this.querySelector('.flashcard').classList.toggle('flipped')">
        <div class="flashcard">
          <div class="flashcard-face flashcard-front">
            <div class="fc-ch">\${vocab.ch}</div>
            <div style="font-size: 12px; color: var(--ink3); position: absolute; bottom: 16px;">Tap to flip</div>
          </div>
          <div class="flashcard-face flashcard-back">
            <div class="fc-py">\${vocab.py}</div>
            <div class="fc-en">\${vocab.en}</div>
          </div>
        </div>
      </div>
      <div class="fc-controls">
        <button class="fc-btn" onclick="changeFlashcard(-1)">← Previous</button>
        <span style="display:flex; align-items:center; font-size:14px; color:var(--ink3);">\${currentFcIndex + 1} / \${data.vocabulary.length}</span>
        <button class="fc-btn" onclick="changeFlashcard(1)">Next →</button>
      </div>
    \`;
  } 
  else if (currentPracticeMode === 'dialogue') {
    if (!data.dialogues || data.dialogues.length === 0) {
      area.innerHTML = '<div>No dialogues found.</div>';
      return;
    }
    
    let chatHtml = \`
      <div class="chat-controls">
        <button class="fc-btn" onclick="toggleChatHint('py')">\${showChatPy ? 'Hide' : 'Show'} Pinyin</button>
        <button class="fc-btn" onclick="toggleChatHint('en')">\${showChatEn ? 'Hide' : 'Show'} English</button>
      </div>
      <div class="chat-container \${showChatPy ? 'show-py' : ''} \${showChatEn ? 'show-en' : ''}">
    \`;
    
    data.dialogues.forEach(d => {
      chatHtml += \`<h3 style="text-align:center; font-family:var(--serif); margin: 24px 0 16px;">\${d.title}</h3>\`;
      d.messages.forEach((msg, idx) => {
        // Just alternating sides based on index for demo purposes
        const side = idx % 2 === 0 ? 'left' : 'right';
        chatHtml += \`
          <div class="chat-bubble-wrapper \${side}">
            \${side === 'left' ? \`<div class="chat-speaker">\${msg.speaker}</div>\` : ''}
            <div class="chat-bubble">
              <div class="chat-ch">\${msg.ch}</div>
              <div class="chat-py">\${msg.py}</div>
              <div class="chat-en">\${msg.en}</div>
            </div>
            \${side === 'right' ? \`<div class="chat-speaker" style="background:#C0392B;color:#fff;">\${msg.speaker}</div>\` : ''}
          </div>
        \`;
      });
    });
    chatHtml += '</div>';
    area.innerHTML = chatHtml;
  }
  else if (currentPracticeMode === 'exercise') {
    if (!data.exercises || data.exercises.length === 0) {
      area.innerHTML = '<div>No exercises found.</div>';
      return;
    }
    
    let exHtml = '<div style="width:100%; max-width: 600px;">';
    data.exercises.forEach(ex => {
      exHtml += \`
        <div style="background:var(--white); border:1px solid var(--border); padding:20px; border-radius:var(--radius); margin-bottom:16px;">
          <h3 style="font-family:var(--serif); margin-bottom: 12px; color:var(--red);">\${ex.title}</h3>
          <p style="color:var(--ink2); line-height:1.6;">\${ex.content}</p>
        </div>
      \`;
    });
    exHtml += '</div>';
    area.innerHTML = exHtml;
  }
}

function changeFlashcard(delta) {
  if (!practiceData || !practiceData[parseInt(currentLessonId)]) return;
  const data = practiceData[parseInt(currentLessonId)];
  currentFcIndex += delta;
  if (currentFcIndex < 0) currentFcIndex = data.vocabulary.length - 1;
  if (currentFcIndex >= data.vocabulary.length) currentFcIndex = 0;
  renderPracticeContent();
}

function toggleChatHint(type) {
  if (type === 'py') showChatPy = !showChatPy;
  if (type === 'en') showChatEn = !showChatEn;
  renderPracticeContent();
}

// Hook into loadSplitPDF to auto-update practice tab when lesson changes
const originalLoadSplitPDF = loadSplitPDF;
loadSplitPDF = function(lessonId) {
  originalLoadSplitPDF(lessonId);
  currentFcIndex = 0; // Reset flashcard index
  if (document.getElementById('panel-practice').classList.contains('active')) {
    renderPracticeContent();
  }
}

// Hook into init to load data
const originalInit = init;
init = async function() {
  await loadPracticeData();
  await originalInit();
}
`;

html = html.replace('// ──────────────────────────────────────────────\n// AUDIO CONTROLS', practiceJs + '\n// ──────────────────────────────────────────────\n// AUDIO CONTROLS');

fs.writeFileSync('index.html', html);
console.log('Successfully injected Practice Tab UI and Logic!');
