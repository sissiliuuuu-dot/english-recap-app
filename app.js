// ===== Data =====
var articlesData = null;
var vocabWords = [];
var streakDays = 0;
var currentReviewIndex = 0;
var reviewQueue = [];
var revealedCard = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
  loadVocab();
  updateStreak();
  loadArticles();
  setupModal();
  setupDataButtons();
  updateStatsAll();
});

function loadArticles() {
  fetch('data/articles.json')
    .then(function(r){ return r.json(); })
    .then(function(data) {
      articlesData = data;
      renderArticle();
    })
    .catch(function() {
      document.getElementById('articleContent').innerHTML =
        '<p style="color:var(--text-muted)">无法加载文章数据。</p>';
    });
}

// ===== Article Render =====
function renderArticle() {
  if (!articlesData || !articlesData.articles.length) return;
  var today = articlesData.articles[articlesData.articles.length - 1];
  var el = document.getElementById('articleContent');
  if (!el) return;

  document.getElementById('headerDate').textContent = today.date;

  var exprMap = {};
  (today.expressions || []).forEach(function(e) { exprMap[e.word.toLowerCase()] = e; });

  var html = escapeHtml(today.passage);

  Object.keys(exprMap).forEach(function(key) {
    var e = exprMap[key];
    var regex = new RegExp('\\b(' + escapeRegex(key) + ')\\b', 'gi');
    html = html.replace(regex, '<span class="word-marked" data-word="' + e.word + '" data-ipa="' + (e.ipa||'') + '" data-zh="' + (e.zh||'') + '" data-example="' + (e.example||'') + '">$1</span>');
  });

  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  el.innerHTML =
    '<div class="card">' +
      '<p class="article-date-label">&#128197; ' + today.dayLabel + '</p>' +
      '<div class="article-text" id="articleText">' + html + '</div>' +
    '</div>' +
    '<div class="card">' +
      '<p class="card-section-title">&#128218; Key Expressions</p>' +
      '<div class="expr-list">' +
        today.expressions.map(function(e) {
          return '<div class="expr-item">' +
            '<div class="expr-word">' + e.word + ' <span class="expr-ipa">' + (e.ipa||'') + '</span></div>' +
            '<div class="expr-zh">' + (e.zh||'') + '</div>' +
            '<div class="expr-example">' + (e.example||'') + '</div>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="card">' +
      '<p class="card-section-title">&#128316; Speaking Tip</p>' +
      '<div class="tip-card">' + today.speakingTip + '</div>' +
    '</div>';

  attachWordClicks();
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function attachWordClicks() {
  var spans = document.querySelectorAll('#articleText .word-marked');
  for (var i = 0; i < spans.length; i++) {
    spans[i].addEventListener('click', function() {
      openWordModal(this.dataset.word, this.dataset.ipa, this.dataset.zh, this.dataset.example);
    });
  }
}

function openWordModal(word, ipa, zh, example) {
  document.getElementById('modalWord').textContent = word;
  document.getElementById('modalIpa').textContent = ipa || '';
  document.getElementById('modalZh').textContent = zh || '';
  document.getElementById('modalExample').textContent = example || '';

  var isSaved = vocabWords.some(function(v) { return v.word.toLowerCase() === word.toLowerCase(); });
  var btn = document.getElementById('modalSaveBtn');
  btn.textContent = isSaved ? '✓ 已保存' : '+ 保存到生词本';
  btn.disabled = isSaved;
  btn.onclick = function() { saveWord(word, ipa, zh, example, isSaved); };

  document.getElementById('wordModal').classList.add('show');
}

function saveWord(word, ipa, zh, example, isSaved) {
  if (isSaved) return;
  vocabWords.push({
    word: word,
    ipa: ipa || '',
    zh: zh || '',
    example: example || '',
    articleId: '',
    date: new Date().toISOString().split('T')[0],
    nextReview: new Date().toISOString().split('T')[0],
    interval: 1,
    ease: 2.5,
    reps: 0,
    status: 'new'
  });
  saveVocab();
  var spans = document.querySelectorAll('#articleText .word-marked');
  for (var i = 0; i < spans.length; i++) {
    if (spans[i].dataset.word.toLowerCase() === word.toLowerCase()) {
      spans[i].classList.add('saved');
    }
  }
  document.getElementById('modalSaveBtn').textContent = '✓ 已保存';
  document.getElementById('modalSaveBtn').disabled = true;
  updateStatsAll();
}

// ===== Vocab Page =====
function renderVocabPage() {
  var el = document.getElementById('vocabList');
  if (!el) return;

  if (!vocabWords.length) {
    el.innerHTML = '<div class="vocab-empty"><div style="font-size:48px;margin-bottom:12px;">&#128218;</div><p>生词本空空如也<br>阅读时点击单词即可收藏</p></div>';
    var pg = document.getElementById('vocabPagination');
    if (pg) pg.style.display = 'none';
    return;
  }

  var pg = document.getElementById('vocabPagination');
  if (pg) pg.style.display = 'flex';

  var sorted = vocabWords.slice().sort(function(a, b) {
    var order = { new: 0, due: 1, learning: 2, mastered: 3 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });

  var pageSize = 10;
  var page = parseInt(sessionStorage.getItem('vocabPage') || '0');
  var slice = sorted.slice(page * pageSize, (page + 1) * pageSize);
  var total = Math.ceil(sorted.length / pageSize);

  el.innerHTML = slice.map(function(v) {
    var badge = '';
    if (v.status === 'new') badge = '<span class="badge badge-new">新</span>';
    else if (v.status === 'due') badge = '<span class="badge badge-due">待复习</span>';
    else if (v.status === 'learning') badge = '<span class="badge badge-new">学习中</span>';
    else badge = '<span class="badge badge-mastered">已掌握</span>';
    return '<div class="vocab-item" onclick="openVocabDetail(\'' + v.word.replace(/'/g, '\\\'') + '\')">' +
      '<div class="vocab-item-main">' +
        '<div class="vocab-word">' + v.word + ' <span class="vocab-ipa">' + (v.ipa||'') + '</span></div>' +
        '<div class="vocab-zh">' + (v.zh||'') + '</div>' +
        '<div class="vocab-date">收藏于 ' + (v.date||'') + '</div>' +
      '</div>' +
      '<div class="vocab-actions">' + badge +
        '<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();deleteWord(\'' + v.word.replace(/'/g, '\\\'') + '\')">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');

  var info = document.getElementById('vocabPageInfo');
  if (info) info.textContent = (page + 1) + ' / ' + (total || 1);
  var prevBtn = document.getElementById('vocabPrevBtn');
  var nextBtn = document.getElementById('vocabNextBtn');
  if (prevBtn) prevBtn.disabled = (page === 0);
  if (nextBtn) nextBtn.disabled = (page >= total - 1);
}

function openVocabDetail(word) {
  var v = vocabWords.find(function(x) { return x.word.toLowerCase() === word.toLowerCase(); });
  if (!v) return;
  document.getElementById('modalWord').textContent = v.word;
  document.getElementById('modalIpa').textContent = v.ipa || '';
  document.getElementById('modalZh').textContent = v.zh || '';
  document.getElementById('modalExample').textContent = v.example || '';
  document.getElementById('modalSaveBtn').style.display = 'none';
  document.getElementById('wordModal').classList.add('show');
}

function deleteWord(word) {
  vocabWords = vocabWords.filter(function(v) { return v.word.toLowerCase() !== word.toLowerCase(); });
  saveVocab();
  renderVocabPage();
  updateStatsAll();
}

// ===== Review (SM-2) =====
function prepareReview() {
  var today = new Date().toISOString().split('T')[0];
  reviewQueue = vocabWords.filter(function(v) { return v.nextReview <= today && v.status !== 'mastered'; });
  currentReviewIndex = 0;
  renderReviewCard();
}

function renderReviewCard() {
  var el = document.getElementById('reviewContent');
  if (!el) return;

  var counter = document.getElementById('reviewCounter');
  if (counter) counter.textContent = '待复习: ' + (currentReviewIndex + 1) + ' / ' + reviewQueue.length;

  if (currentReviewIndex >= reviewQueue.length) {
    el.innerHTML = '<div class="review-complete"><div style="font-size:56px;margin-bottom:12px;">&#127881;</div><h2>今日复习完成！</h2><p>所有单词都已复习完毕，记得明天再来。</p></div>';
    var rating = document.getElementById('reviewRating');
    if (rating) rating.style.display = 'none';
    return;
  }

  var rating = document.getElementById('reviewRating');
  if (rating) rating.style.display = 'flex';
  revealedCard = reviewQueue[currentReviewIndex];

  el.innerHTML = '<div class="flashcard" id="flashcard" onclick="revealCard()">' +
    '<div class="fc-word">' + revealedCard.word + '</div>' +
    '<div class="fc-ipa">' + (revealedCard.ipa||'') + '</div>' +
    '<div class="fc-zh">' + (revealedCard.zh||'') + '</div>' +
    '<div class="fc-example">' + (revealedCard.example||'') + '</div>' +
    '<div class="fc-hint">点击卡片查看释义</div>' +
  '</div>';

  var b0 = document.getElementById('ratingBtn0');
  var b1 = document.getElementById('ratingBtn1');
  var b2 = document.getElementById('ratingBtn2');
  if (b0) { b0.disabled = false; b0.onclick = function() { rateCard(0); }; }
  if (b1) { b1.disabled = false; b1.onclick = function() { rateCard(1); }; }
  if (b2) { b2.disabled = false; b2.onclick = function() { rateCard(2); }; }
}

function revealCard() {
  var fc = document.getElementById('flashcard');
  if (fc) fc.classList.add('revealed');
}

function rateCard(quality) {
  if (!revealedCard) return;
  if (quality < 1) {
    revealedCard.reps = 0;
    revealedCard.interval = 1;
    revealedCard.nextReview = addDays(new Date().toISOString().split('T')[0], 1);
    revealedCard.status = 'due';
  } else {
    if (revealedCard.reps === 0) { revealedCard.interval = 1; }
    else if (revealedCard.reps === 1) { revealedCard.interval = 3; }
    else { revealedCard.interval = Math.round(revealedCard.interval * revealedCard.ease); }
    revealedCard.reps++;
    revealedCard.nextReview = addDays(new Date().toISOString().split('T')[0], revealedCard.interval);
    revealedCard.status = (revealedCard.interval >= 21 && revealedCard.reps >= 3) ? 'mastered' : 'learning';
    revealedCard.ease = Math.max(1.3, revealedCard.ease + (0.1 - (2 - quality) * (0.08 + (2 - quality) * 0.02)));
  }
  saveVocab();
  currentReviewIndex++;
  renderReviewCard();
  updateStatsAll();
}

function addDays(dateStr, days) {
  var d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ===== Modal =====
function setupModal() {
  var modal = document.getElementById('wordModal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.classList.contains('modal-overlay')) closeModal();
    });
  }
}

function closeModal() {
  var modal = document.getElementById('wordModal');
  if (modal) modal.classList.remove('show');
  var saveBtn = document.getElementById('modalSaveBtn');
  if (saveBtn) saveBtn.style.display = '';
}

// ===== Nav =====
function switchView(view) {
  var views = document.querySelectorAll('.page-view');
  for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
  var tabs = document.querySelectorAll('.nav-tab');
  for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
  var target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  var activeTab = document.querySelector('.nav-tab[data-view="' + view + '"]');
  if (activeTab) activeTab.classList.add('active');
  sessionStorage.setItem('vocabPage', '0');
  if (view === 'vocab') renderVocabPage();
  if (view === 'review') prepareReview();
  if (view === 'article') attachWordClicks();
}

// ===== Stats =====
function updateStatsAll() {
  loadVocab();
  var today = new Date().toISOString().split('T')[0];
  var due = vocabWords.filter(function(v) { return v.nextReview <= today && v.status !== 'mastered'; }).length;
  var mastered = vocabWords.filter(function(v) { return v.status === 'mastered'; }).length;

  var ids = ['statDays','statVocab','statDue','statDays2','statVocab2','statDue2','statDays3','statVocab3','statDue3'];
  ids.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (id.indexOf('Days') >= 0) el.textContent = streakDays;
    else if (id.indexOf('Vocab') >= 0) el.textContent = vocabWords.length;
    else if (id.indexOf('Due') >= 0) el.textContent = due;
  });
}

function updateStreak() {
  var today = new Date().toISOString().split('T')[0];
  var last = localStorage.getItem('lastVisitDate');
  if (last === today) return;
  if (last) {
    var diff = Math.floor((new Date(today) - new Date(last)) / 86400000);
    if (diff === 1) streakDays++;
    else if (diff > 1) streakDays = 1;
  } else {
    streakDays = 1;
  }
  localStorage.setItem('lastVisitDate', today);
}

// ===== Data Import/Export =====
function setupDataButtons() {
  var exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.onclick = function() {
      var all = JSON.stringify({ vocabWords: vocabWords, exportDate: new Date().toISOString().split('T')[0] }, null, 2);
      var blob = new Blob([all], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'english-recap-vocab-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  var importBtn = document.getElementById('importBtn');
  var importInput = document.getElementById('importFileInput');
  if (importBtn && importInput) {
    importBtn.onclick = function() { importInput.click(); };
    importInput.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (data.vocabWords && Array.isArray(data.vocabWords)) {
            var existing = {};
            vocabWords.forEach(function(v) { existing[v.word.toLowerCase()] = true; });
            var added = 0;
            data.vocabWords.forEach(function(w) {
              if (!existing[w.word.toLowerCase()]) { vocabWords.push(w); added++; }
            });
            saveVocab();
            updateStatsAll();
            alert('导入成功！新增 ' + added + ' 个单词。');
            renderVocabPage();
          }
        } catch(err) { alert('导入失败，文件格式错误。'); }
      };
      reader.readAsText(file);
      e.target.value = '';
    };
  }
}

function loadVocab() {
  try {
    var raw = localStorage.getItem('vocabWords');
    vocabWords = raw ? JSON.parse(raw) : [];
  } catch(e) { vocabWords = []; }
}

function saveVocab() {
  localStorage.setItem('vocabWords', JSON.stringify(vocabWords));
}
