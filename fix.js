const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const newScript = `<script>
// ──────────────────────────────────────────────
// GLOBAL STATE & CONFIG
// ──────────────────────────────────────────────
let manifest = null;
let currentBook = 'textbook';
let audioSource = 'textbook';
let currentTrackIndex = -1;
let allTracks = [];
let videoType = 'dialogue';

// Whiteboard State
let wbTool = 'pen';
let wbColor = '#1a1a1a';
let wbSize = 3;
let wbStrokes = [];
let wbCurrentStroke = null;
let wbDrawing = false;
let wbCtx = null;

// PDF.js State
let pdfDoc = null;
let cachedPdfDocs = {}; // Cache to make switching books instant
let pdfScale = 1.5;
if (window.innerWidth < 800) pdfScale = 1.2; 

let annotating = false;
let annotTool = 'pen'; 
let annotColor = 'red';
let annotStrokes = {}; 
let annotDrawing = false;
let annotLastX = 0, annotLastY = 0;
let activeDrawingPage = null;
let renderedPages = new Set();
let pageObserver = null;

const GOOGLE_DRIVE_VIDEOS = {
  dialogues: {}, 
  lessons: {}    
};

// ──────────────────────────────────────────────
// INITIALIZATION
// ──────────────────────────────────────────────
async function init() {
  // Safe initialization of PDF.js
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  } else {
    console.error("PDF.js failed to load from CDN.");
    showToast("Warning: PDF Library failed to load.");
  }

  try {
    const res = await fetch('manifest.json');
    if (!res.ok) throw new Error('Manifest not found');
    manifest = await res.json();
  } catch(e) {
    console.error("Using fallback manifest:", e);
    manifest = {
      lessons: Array.from({length:15}, (_,i) => ({
        id: i+1,
        title: \`Lesson \${i+1}\`,
        tracks: [10,9,9,10,8,9,9,9,9,9,9,8,12,9,11][i]
      })),
      workbookTracks: {1:5,2:5,3:5,4:5,5:5,6:6,7:6,8:6,9:6,10:6,11:5,12:5,13:5,14:5,15:5},
      tests: [
        {id:'L4_5',label:'Lessons 4–5'},
        {id:'L6_7',label:'Lessons 6–7'},
        {id:'L8_9',label:'Lessons 8–9'},
        {id:'L10_11',label:'Lessons 10–11'},
        {id:'L12_13',label:'Lessons 12–13'},
        {id:'L14_15',label:'Lessons 14–15'}
      ]
    };
  }
  
  buildLessonSelect();
  buildAudioList();
  buildVideoGrid();
  buildTestsList();
  initWhiteboard();
  buildWaveformBars();
  
  // Load initial PDF
  loadPDF('Textbook.pdf');
  updateAudioDropdown();
}

// ──────────────────────────────────────────────
// NAVIGATION & TABS
// ──────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'whiteboard') setTimeout(resizeWbCanvas, 50);
}

function buildLessonSelect() {
  const sel = document.getElementById('lesson-select');
  sel.innerHTML = '<option value="">— Jump to lesson —</option>';
  manifest.lessons.forEach(l => {
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = \`L\${l.id}: \${l.title}\`;
    sel.appendChild(o);
  });
}

function jumpToLesson(id) {
  if (!id) return;
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab === 'audio') {
    const header = document.querySelector(\`[data-lesson="\${id}"]\`);
    if (header) {
      if (!header.classList.contains('open')) header.click();
      header.scrollIntoView({behavior:'smooth', block:'start'});
    }
  } else if (activeTab === 'videos') {
    const sec = document.querySelector(\`[data-vsec="\${id}"]\`);
    if (sec) sec.scrollIntoView({behavior:'smooth', block:'start'});
  }
  document.getElementById('lesson-select').value = '';
}

// ──────────────────────────────────────────────
// PDF VIEWER (High Performance Lazy Loading)
// ──────────────────────────────────────────────
async function loadPDF(url) {
  const viewer = document.getElementById('pdf-viewer');
  viewer.innerHTML = '<div style="color:var(--ink3); padding: 40px;">Loading PDF...</div>';
  renderedPages.clear();
  if (pageObserver) pageObserver.disconnect();
  
  if (typeof pdfjsLib === 'undefined') {
    viewer.innerHTML = '<div style="color:var(--red); padding: 40px;">Error: PDF Viewer engine not loaded. Check internet connection.</div>';
    return;
  }

  try {
    // Cache the document so switching books is instant
    if (cachedPdfDocs[url]) {
      pdfDoc = cachedPdfDocs[url];
    } else {
      const loadingTask = pdfjsLib.getDocument(url);
      pdfDoc = await loadingTask.promise;
      cachedPdfDocs[url] = pdfDoc;
    }
    
    document.getElementById('pdf-page-info').textContent = \`1 / \${pdfDoc.numPages}\`;
    viewer.innerHTML = ''; 
    
    const firstPage = await pdfDoc.getPage(1);
    const viewport = firstPage.getViewport({ scale: pdfScale });

    // Create lightweight placeholders for all pages
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'pdf-page-wrapper';
      pageWrapper.id = \`page-wrapper-\${i}\`;
      pageWrapper.dataset.pageNumber = i;
      pageWrapper.style.width = viewport.width + 'px';
      pageWrapper.style.height = viewport.height + 'px';
      pageWrapper.style.position = 'relative';
      pageWrapper.style.marginBottom = '20px';
      pageWrapper.style.background = '#fff';
      pageWrapper.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      viewer.appendChild(pageWrapper);
    }
    
    setupPageObserver();
  } catch (e) {
    console.error("Error loading PDF:", e);
    viewer.innerHTML = \`<div style="color:var(--red); padding: 40px;">Failed to load PDF (\${url}).</div>\`;
  }
}

function setupPageObserver() {
  const viewer = document.getElementById('pdf-viewer');
  const info = document.getElementById('pdf-page-info');
  
  pageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const pageNum = parseInt(entry.target.dataset.pageNumber);
      if (entry.isIntersecting) {
        info.textContent = \`Page \${pageNum} / \${pdfDoc.numPages}\`;
        renderPage(pageNum);
      } else {
        unrenderPage(pageNum);
      }
    });
  }, {
    root: viewer,
    threshold: 0,
    rootMargin: '600px' // Load 600px ahead/behind
  });
  
  document.querySelectorAll('.pdf-page-wrapper').forEach(p => pageObserver.observe(p));
}

async function renderPage(num) {
  if (renderedPages.has(num)) return;
  renderedPages.add(num);
  
  try {
    const pageWrapper = document.getElementById(\`page-wrapper-\${num}\`);
    if (!pageWrapper) return;
    
    pageWrapper.innerHTML = '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); color:var(--ink3);">Loading...</div>';

    const page = await pdfDoc.getPage(num);
    const viewport = page.getViewport({ scale: pdfScale });

    // Check if user scrolled away while we were awaiting
    if (!renderedPages.has(num)) return; 

    pageWrapper.innerHTML = ''; 

    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-page-canvas';
    const ctx = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    canvas.style.display = 'block';

    const annotCanvas = document.createElement('canvas');
    annotCanvas.className = 'annot-canvas';
    annotCanvas.width = viewport.width;
    annotCanvas.height = viewport.height;
    annotCanvas.style.position = 'absolute';
    annotCanvas.style.top = '0';
    annotCanvas.style.left = '0';
    annotCanvas.style.pointerEvents = annotating ? 'all' : 'none';
    annotCanvas.dataset.pageNumber = num;
    annotCanvas.style.touchAction = 'none'; 

    pageWrapper.appendChild(canvas);
    pageWrapper.appendChild(annotCanvas);

    const renderContext = { canvasContext: ctx, viewport: viewport };
    await page.render(renderContext).promise;
    
    if (!renderedPages.has(num)) return; 
    
    drawPageAnnotations(num, annotCanvas);

    annotCanvas.addEventListener('pointerdown', e => annotStart(e, num, annotCanvas));
    annotCanvas.addEventListener('pointermove', e => annotMove(e, num, annotCanvas));
    annotCanvas.addEventListener('pointerup', annotEnd);
    annotCanvas.addEventListener('pointercancel', annotEnd);
  } catch (e) {
    console.error(\`Error rendering page \${num}:\`, e);
  }
}

function unrenderPage(num) {
  if (!renderedPages.has(num)) return;
  renderedPages.delete(num);
  const pageWrapper = document.getElementById(\`page-wrapper-\${num}\`);
  if (pageWrapper) {
    pageWrapper.innerHTML = ''; // Destroys canvases to free memory instantly!
  }
}

function switchBook(book) {
  currentBook = book;
  document.querySelectorAll('.book-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(book)));
  const filename = book === 'textbook' ? 'Textbook.pdf' : 'Workbook.pdf';
  loadPDF(filename);
  updateAudioDropdown();
}

function openFullPDF() {
  const filename = currentBook === 'textbook' ? 'Textbook.pdf' : 'Workbook.pdf';
  window.open(filename, '_blank');
}

// ──────────────────────────────────────────────
// AUDIO CONTROLS
// ──────────────────────────────────────────────
function getAudioPath(book, lessonId, trackId) {
  const folderBase = book === 'textbook' ? 'Audio Textbook' : 'Audio Workbook';
  const folderSuffix = lessonId <= 7 ? ' 1' : ' 2';
  return \`\${folderBase}\${folderSuffix}/\${trackId}.mp3\`;
}

function togglePdfAudio() {
  const ap = document.getElementById('audio-player');
  const btn = document.getElementById('pdf-play-pause-btn');
  if (ap.paused) {
    if (!ap.src) return showToast('Select an audio track first');
    ap.play().then(() => btn.textContent = '⏸').catch(e => showToast('Error playing audio'));
  } else {
    ap.pause();
    btn.textContent = '▶';
  }
}

function changePdfAudioSpeed(val) {
  const ap = document.getElementById('audio-player');
  ap.playbackRate = parseFloat(val);
}

function playAudioFromDropdown(src) {
  if (!src) return;
  const ap = document.getElementById('audio-player');
  ap.src = src;
  ap.play().then(() => {
    document.getElementById('pdf-play-pause-btn').textContent = '⏸';
  }).catch(() => showToast('Audio file not found'));
  
  const idx = allTracks.findIndex(t => t.src === src);
  if (idx !== -1) {
    currentTrackIndex = idx;
    const track = allTracks[idx];
    document.getElementById('anp-lesson').textContent = \`Lesson \${track.lesson} · \${track.lessonTitle}\`;
    document.getElementById('anp-track').textContent = track.label;
  }
}

function updateAudioDropdown() {
  const sel = document.getElementById('pdf-audio-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Audio —</option>';
  
  if (currentBook === 'textbook') {
    manifest.lessons.forEach(l => {
      for (let t = 1; t <= l.tracks; t++) {
        const tid = String(l.id).padStart(2,'0') + '-' + String(t).padStart(2,'0');
        const o = document.createElement('option');
        o.value = getAudioPath('textbook', l.id, tid);
        o.textContent = \`L\${l.id} Trk \${t}\`;
        sel.appendChild(o);
      }
    });
  } else {
    manifest.lessons.forEach(l => {
      const count = manifest.workbookTracks[l.id] || 5;
      for (let t = 1; t <= count; t++) {
        const tid = String(l.id).padStart(2,'0') + '-' + t;
        const o = document.createElement('option');
        o.value = getAudioPath('workbook', l.id, tid);
        o.textContent = \`L\${l.id} WB \${t}\`;
        sel.appendChild(o);
      }
    });
  }
}

// ──────────────────────────────────────────────
// ANNOTATION SYSTEM
// ──────────────────────────────────────────────
function annotToggle() {
  annotating = !annotating;
  annotTool = 'pen';
  updateAnnotUI();
  document.querySelectorAll('.annot-canvas').forEach(c => c.style.pointerEvents = annotating ? 'all' : 'none');
  document.getElementById('pdf-viewer').style.overflow = annotating ? 'hidden' : 'auto'; 
  showToast(annotating ? 'Pen on — use Stylus' : 'Pen off');
}

function setAnnotTool(tool) {
  annotating = true;
  annotTool = tool;
  updateAnnotUI();
  document.querySelectorAll('.annot-canvas').forEach(c => c.style.pointerEvents = 'all');
  document.getElementById('pdf-viewer').style.overflow = 'hidden';
}

function updateAnnotUI() {
  document.getElementById('annot-btn').classList.toggle('active', annotating && annotTool === 'pen');
  document.getElementById('eraser-btn').classList.toggle('active', annotating && annotTool === 'eraser');
}

function setAnnotColor(c) { 
  annotating = true;
  annotTool = 'pen';
  annotColor = c; 
  updateAnnotUI();
}

function annotStart(e, pageNum, canvas) {
  // Allow pen or mouse. Ignore pure touch.
  if (!annotating || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
  e.preventDefault();
  annotDrawing = true;
  activeDrawingPage = pageNum;
  const r = canvas.getBoundingClientRect();
  annotLastX = (e.clientX - r.left) * (canvas.width / r.width);
  annotLastY = (e.clientY - r.top) * (canvas.height / r.height);
  
  if (!annotStrokes[pageNum]) annotStrokes[pageNum] = [];
  wbCurrentStroke = { tool: annotTool, color: annotColor, points: [{x: annotLastX, y: annotLastY}] };
}

function annotMove(e, pageNum, canvas) {
  if (!annotating || !annotDrawing || (e.pointerType !== 'pen' && e.pointerType !== 'mouse')) return;
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  const y = (e.clientY - r.top) * (canvas.height / r.height);
  
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  if (annotTool === 'eraser') {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 20;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = annotColor === 'red' ? '#C0392B' : annotColor === 'blue' ? '#1A73E8' : '#000000';
    ctx.lineWidth = 2.5;
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.moveTo(annotLastX, annotLastY);
  ctx.lineTo(x, y);
  ctx.stroke();
  
  annotLastX = x; annotLastY = y;
  if (wbCurrentStroke) wbCurrentStroke.points.push({x,y});
}

function annotEnd() {
  if (!annotDrawing) return;
  annotDrawing = false;
  if (wbCurrentStroke && activeDrawingPage !== null) {
    annotStrokes[activeDrawingPage].push(wbCurrentStroke);
    wbCurrentStroke = null;
    activeDrawingPage = null;
  }
}

function drawPageAnnotations(pageNum, canvas) {
  const strokes = annotStrokes[pageNum];
  if (!strokes) return;
  const ctx = canvas.getContext('2d');
  strokes.forEach(s => {
    if (s.points.length < 2) return;
    ctx.beginPath();
    if (s.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 20;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = s.color === 'red' ? '#C0392B' : s.color === 'blue' ? '#1A73E8' : '#000000';
      ctx.lineWidth = 2.5;
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.moveTo(s.points[0].x, s.points[0].y);
    s.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  });
  ctx.globalCompositeOperation = 'source-over';
}

function clearAnnotations() {
  if (!confirm('Clear all annotations in this book?')) return;
  annotStrokes = {};
  document.querySelectorAll('.annot-canvas').forEach(canvas => {
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
  });
}

// ──────────────────────────────────────────────
// AUDIO PANEL LOGIC
// ──────────────────────────────────────────────
function buildAudioList() {
  const list = document.getElementById('audio-lesson-list');
  list.innerHTML = '';
  allTracks = [];

  manifest.lessons.forEach(lesson => {
    const group = document.createElement('div');
    group.className = 'audio-lesson-group';

    const header = document.createElement('div');
    header.className = 'audio-lesson-header';
    header.innerHTML = \`<span>L\${String(lesson.id).padStart(2,'0')} · \${lesson.title}</span><span class="chevron">›</span>\`;
    header.onclick = () => header.classList.toggle('open');

    const trackList = document.createElement('div');
    trackList.className = 'audio-track-list';

    const count = (audioSource === 'textbook') ? lesson.tracks : (manifest.workbookTracks[lesson.id] || 5);
    for (let t = 1; t <= count; t++) {
      const trackId = (audioSource === 'textbook') ? \`\${String(lesson.id).padStart(2,'0')}-\${String(t).padStart(2,'0')}\` : \`\${String(lesson.id).padStart(2,'0')}-\${t}\`;
      const src = getAudioPath(audioSource, lesson.id, trackId);
      const idx = allTracks.length;
      allTracks.push({ src, label: \`\${audioSource === 'textbook' ? 'Trk' : 'WB'} \${trackId}\`, lesson: lesson.id, lessonTitle: lesson.title });

      const item = document.createElement('div');
      item.className = 'audio-track-item';
      item.innerHTML = \`<span class="track-num">\${trackId}</span><span>Track \${t}</span>\`;
      item.onclick = () => playTrack(idx);
      trackList.appendChild(item);
    }

    group.appendChild(header);
    group.appendChild(trackList);
    list.appendChild(group);
  });
}

function setAudioSource(src) {
  audioSource = src;
  document.getElementById('asrc-textbook').classList.toggle('active', src === 'textbook');
  document.getElementById('asrc-workbook').classList.toggle('active', src === 'workbook');
  buildAudioList();
}

function playTrack(idx) {
  currentTrackIndex = idx;
  const track = allTracks[idx];
  const ap = document.getElementById('audio-player');
  ap.src = track.src;
  ap.play().then(() => {
    document.getElementById('play-btn').textContent = '⏸';
  }).catch(() => showToast('Audio file not found'));
  
  document.getElementById('anp-lesson').textContent = \`Lesson \${track.lesson} · \${track.lessonTitle}\`;
  document.getElementById('anp-track').textContent = track.label;
  
  document.querySelectorAll('.audio-track-item').forEach(el => {
    el.classList.toggle('playing', parseInt(el.dataset.trackIdx) === idx);
  });
}

function audioPlayPause() {
  const ap = document.getElementById('audio-player');
  if (ap.paused) {
    if (currentTrackIndex === -1 && allTracks.length > 0) playTrack(0);
    else ap.play().then(() => document.getElementById('play-btn').textContent = '⏸');
  } else {
    ap.pause();
    document.getElementById('play-btn').textContent = '▶';
  }
}

function audioPrev() { if (currentTrackIndex > 0) playTrack(currentTrackIndex - 1); }
function audioNext() { if (currentTrackIndex < allTracks.length - 1) playTrack(currentTrackIndex + 1); }

// ──────────────────────────────────────────────
// VIDEO PANEL LOGIC
// ──────────────────────────────────────────────
function setVideoType(type) {
  videoType = type;
  document.querySelectorAll('.video-type-btn').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(type.slice(0,3))));
  buildVideoGrid();
}

function buildVideoGrid() {
  const grid = document.getElementById('video-grid');
  grid.innerHTML = '';
  manifest.lessons.forEach(lesson => {
    const sec = document.createElement('div');
    sec.className = 'lesson-section';
    sec.dataset.vsec = lesson.id;
    sec.innerHTML = \`<div class="lesson-section-title">Lesson \${lesson.id} · \${lesson.title}</div>\`;
    const cards = document.createElement('div');
    cards.className = 'video-cards';
    
    if (videoType === 'dialogue') {
      [1, 2].forEach(n => {
        const card = document.createElement('div');
        card.className = 'video-card';
        const key = \`\${lesson.id}.\${n}\`;
        const driveId = GOOGLE_DRIVE_VIDEOS.dialogues[key];
        card.innerHTML = \`<div class="video-thumb">🎬</div><div class="video-card-label">Dialogue \${lesson.id}.\${n}</div>\`;
        card.onclick = () => openVideo(driveId ? \`https://drive.google.com/file/d/\${driveId}/preview\` : \`videos/Dialogue \${lesson.id}.\${n}.mp4\`, \`Dialogue \${lesson.id}.\${n}\`);
        cards.appendChild(card);
      });
    } else {
      const card = document.createElement('div');
      card.className = 'video-card';
      const driveId = GOOGLE_DRIVE_VIDEOS.lessons[lesson.id];
      card.innerHTML = \`<div class="video-thumb">🎓</div><div class="video-card-label">Lesson Video</div>\`;
      card.onclick = () => openVideo(driveId ? \`https://drive.google.com/file/d/\${driveId}/preview\` : \`videos/\${lesson.id}-Lesson.mp4\`, \`Lesson \${lesson.id}\`);
      cards.appendChild(card);
    }
    sec.appendChild(cards);
    grid.appendChild(sec);
  });
}

function openVideo(src, title) {
  const modal = document.getElementById('video-modal');
  const inner = document.getElementById('video-modal-inner');
  const titleEl = document.getElementById('video-modal-title');
  const player = document.getElementById('video-player');
  
  titleEl.textContent = title;
  const oldIframe = inner.querySelector('iframe');
  if (oldIframe) oldIframe.remove();

  if (src.includes('drive.google.com')) {
    player.style.display = 'none';
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.width = "800"; iframe.height = "450";
    iframe.style.border = "none"; iframe.style.maxWidth = "80vw"; iframe.style.maxHeight = "76vh";
    inner.appendChild(iframe);
  } else {
    player.style.display = 'block';
    player.src = src;
    player.play().catch(() => {});
  }
  modal.classList.add('open');
}

function closeVideoForce() {
  const modal = document.getElementById('video-modal');
  const player = document.getElementById('video-player');
  const iframe = document.getElementById('video-modal-inner').querySelector('iframe');
  if (iframe) iframe.remove();
  modal.classList.remove('open');
  player.pause(); player.src = '';
}
function closeVideo(e) { if (e.target === document.getElementById('video-modal')) closeVideoForce(); }

// ──────────────────────────────────────────────
// TESTS, WHITEBOARD, WAVEFORM
// ──────────────────────────────────────────────
function buildTestsList() {
  const list = document.getElementById('tests-list');
  list.innerHTML = '';
  manifest.tests.forEach(test => {
    const card = document.createElement('div');
    card.className = 'test-card';
    card.innerHTML = \`<div class="test-card-label"><div class="tc-title">\${test.label}</div><div class="tc-sub">Blank sheet + answer key</div></div>
      <div class="test-btns">
        <a class="test-pdf-btn blank" href="tests/\${test.id}-blank.pdf" target="_blank">📄 Blank</a>
        <a class="test-pdf-btn ans" href="tests/\${test.id}-answers.pdf" target="_blank">✅ Answers</a>
      </div>\`;
    list.appendChild(card);
  });
}

function initWhiteboard() {
  const canvas = document.getElementById('wb-canvas');
  if (!canvas) return;
  wbCtx = canvas.getContext('2d');
  resizeWbCanvas();
  window.addEventListener('resize', resizeWbCanvas);
  canvas.addEventListener('pointerdown', wbDown);
  canvas.addEventListener('pointermove', wbMove);
  canvas.addEventListener('pointerup', wbUp);
  canvas.addEventListener('pointercancel', wbUp);
}

function resizeWbCanvas() {
  const canvas = document.getElementById('wb-canvas');
  const wrap = document.getElementById('wb-canvas-wrap');
  if (!canvas || !wrap) return;
  canvas.width = wrap.offsetWidth; canvas.height = wrap.offsetHeight;
  redrawWhiteboard();
}

function wbDown(e) { e.preventDefault(); wbDrawing = true; const pt = getWbPoint(e); wbCurrentStroke = {tool: wbTool, color: wbColor, size: wbSize, points: [pt]}; }
function wbMove(e) {
  if (!wbDrawing) return; e.preventDefault(); const pt = getWbPoint(e); wbCurrentStroke.points.push(pt);
  wbCtx.beginPath();
  const prev = wbCurrentStroke.points[wbCurrentStroke.points.length - 2];
  wbCtx.strokeStyle = wbTool === 'eraser' ? '#fff' : (wbTool === 'highlight' ? wbColor + '55' : wbColor);
  wbCtx.lineWidth = wbTool === 'eraser' ? wbSize * 5 : (wbTool === 'highlight' ? wbSize * 4 : wbSize);
  wbCtx.lineCap = 'round'; wbCtx.moveTo(prev.x, prev.y); wbCtx.lineTo(pt.x, pt.y); wbCtx.stroke();
}
function wbUp() { if (wbDrawing) { wbStrokes.push(wbCurrentStroke); wbDrawing = false; } }
function getWbPoint(e) { const r = document.getElementById('wb-canvas').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function redrawWhiteboard() {
  wbCtx.fillStyle = '#fff'; wbCtx.fillRect(0,0,wbCtx.canvas.width,wbCtx.canvas.height);
  wbStrokes.forEach(s => {
    wbCtx.beginPath(); wbCtx.strokeStyle = s.tool === 'eraser' ? '#fff' : (s.tool === 'highlight' ? s.color + '55' : s.color);
    wbCtx.lineWidth = s.tool === 'eraser' ? s.size * 5 : (s.tool === 'highlight' ? s.size * 4 : s.size);
    wbCtx.lineCap = 'round'; wbCtx.moveTo(s.points[0].x, s.points[0].y);
    s.points.slice(1).forEach(p => wbCtx.lineTo(p.x, p.y)); wbCtx.stroke();
  });
}
function setWbTool(t) { wbTool = t; document.querySelectorAll('.wb-btn').forEach(b => b.classList.toggle('active', b.id.includes(t.slice(0,2)))); }
function setWbColor(c) { wbColor = c; if (wbTool === 'eraser') setWbTool('pen'); }
function setWbSize(v) { wbSize = parseInt(v); }
function wbUndo() { wbStrokes.pop(); redrawWhiteboard(); }
function wbClear() { if (confirm('Clear whiteboard?')) { wbStrokes = []; redrawWhiteboard(); } }
function wbSave() { const a = document.createElement('a'); a.download = 'whiteboard.png'; a.href = document.getElementById('wb-canvas').toDataURL(); a.click(); }

function buildWaveformBars() {
  const wrap = document.getElementById('waveform-bars');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.height = (20 + Math.random() * 60) + '%';
    wrap.appendChild(bar);
  }
}
function updateWaveform(pct) {
  const bars = document.querySelectorAll('.waveform-bar');
  const played = Math.round((pct / 100) * bars.length);
  bars.forEach((b, i) => b.classList.toggle('played', i < played));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function fmtTime(s) { const m = Math.floor(s / 60); return \`\${m}:\${String(Math.floor(s % 60)).padStart(2,'0')}\`; }

document.addEventListener('DOMContentLoaded', () => {
  const ap = document.getElementById('audio-player');
  ap.addEventListener('timeupdate', () => {
    if (!ap.duration) return;
    const pct = (ap.currentTime / ap.duration) * 100;
    document.getElementById('audio-progress').value = pct;
    document.getElementById('audio-cur').textContent = fmtTime(ap.currentTime);
    updateWaveform(pct);
  });
  ap.addEventListener('durationchange', () => document.getElementById('audio-dur').textContent = fmtTime(ap.duration));
  ap.addEventListener('ended', () => { document.getElementById('play-btn').textContent = '▶'; audioNext(); });
  document.getElementById('audio-progress').addEventListener('input', e => { if (ap.duration) ap.currentTime = (e.target.value / 100) * ap.duration; });
});

// Start the app
init();
</script>`;

html = html.replace(/<script>[\s\S]*<\/script>/, newScript);
fs.writeFileSync('index.html', html);
console.log("Successfully rebuilt index.html script block.");
