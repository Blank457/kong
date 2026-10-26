(function() {
  'use strict';

  var isMusicPage = /music\.html/.test(location.pathname) || /music\.html/.test(location.href.split('?')[0]);

  // ===== IndexedDB =====
  var DB_NAME = 'blogMusicPlayer', DB_VER = 1, STORE = 'tracks', db = null;

  function initDB() {
    return new Promise(function(resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function(e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function() { db = req.result; resolve(); };
      req.onerror = function() { reject(req.error); };
    });
  }
  function dbPut(item) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve; tx.onerror = reject;
    });
  }
  function dbGetAll() {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction([STORE], 'readonly');
      var req = tx.objectStore(STORE).getAll();
      req.onsuccess = function() { resolve(req.result); }; req.onerror = reject;
    });
  }
  function dbGet(id) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction([STORE], 'readonly');
      var req = tx.objectStore(STORE).get(id);
      req.onsuccess = function() { resolve(req.result); }; req.onerror = reject;
    });
  }
  function dbDelete(id) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve; tx.onerror = reject;
    });
  }
  function dbClear() {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction([STORE], 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = resolve; tx.onerror = reject;
    });
  }

  // ===== Audio =====
  var audio = new Audio();
  var audioCtx = null, analyser = null, source = null, dataArr = null;

  // ===== State =====
  var tracks = [];
  var currentIdx = -1;
  var playMode = 0;
  var isShuffle = false;
  var repeatMode = 0;
  function syncPlayMode() {
    isShuffle = (playMode === 2);
    repeatMode = playMode === 1 ? 2 : (playMode === 2 ? 1 : 0);
  }
  var savedVol = 0.75;
  var wasPlaying = false;
  var savedTime = 0;

  try {
    var s = JSON.parse(localStorage.getItem('mpState') || '{}');
    if (s.volume !== undefined) { audio.volume = s.volume; savedVol = s.volume; }
    if (s.playMode !== undefined) { playMode = s.playMode; syncPlayMode(); }
    else if (s.shuffle) { playMode = 2; syncPlayMode(); }
    else if (s.repeat === 2) { playMode = 1; syncPlayMode(); }
    if (s.currentIdx !== undefined) currentIdx = s.currentIdx;
    if (s.wasPlaying) wasPlaying = true;
    if (s.currentTime) savedTime = s.currentTime;
  } catch(e) {}

  // ===== Events =====
  var listeners = {};
  function on(event, cb) { (listeners[event] || (listeners[event] = [])).push(cb); }
  function emit(event, data) { (listeners[event] || []).forEach(function(cb) { cb(data); }); }

  // ===== Helpers =====
  function formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return '0:00';
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  var lastSave = 0;
  function saveState() {
    try {
      localStorage.setItem('mpState', JSON.stringify({
        volume: audio.volume,
        playMode: playMode,
        shuffle: isShuffle,
        repeat: repeatMode,
        currentIdx: currentIdx,
        wasPlaying: !audio.paused,
        currentTime: audio.currentTime || 0
      }));
    } catch(e) {}
  }

  function initAudioCtx() {
    if (audioCtx) return;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      source = audioCtx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      dataArr = new Uint8Array(analyser.frequencyBinCount);
      emit('ctxready');
    } catch(e) {}
  }

  // ===== Track management =====
  function addFiles(files) {
    var added = 0;
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name)) {
        (function(file) {
          var id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          var name = file.name.replace(/\.[^/.]+$/, '');
          promises.push(dbPut({ id: id, name: name, size: file.size, blob: file }).then(function() {
            tracks.push({ id: id, name: name, size: file.size, url: URL.createObjectURL(file) });
            added++;
          }));
        })(f);
      }
    }
    return Promise.all(promises).then(function() {
      if (added > 0) {
        if (currentIdx === -1) currentIdx = 0;
        saveState();
        emit('playlistchange');
      }
      return added;
    });
  }

  function loadTracksFromDB() {
    return dbGetAll().then(function(dbTracks) {
      tracks = dbTracks.map(function(t) {
        return { id: t.id, name: t.name, size: t.size, url: URL.createObjectURL(t.blob) };
      });
      if (currentIdx >= tracks.length) currentIdx = -1;
      emit('playlistchange');

      if (currentIdx >= 0 && currentIdx < tracks.length) {
        audio.src = tracks[currentIdx].url;
        if (savedTime > 0) {
          audio.addEventListener('loadedmetadata', function restore() {
            audio.removeEventListener('loadedmetadata', restore);
            try { audio.currentTime = savedTime; } catch(e) {}
            savedTime = 0;
            if (wasPlaying) {
              initAudioCtx();
              if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
              audio.play().catch(function() {});
            }
          });
        }
      }
    });
  }

  function loadTrack(idx) {
    if (idx < 0 || idx >= tracks.length) return;
    currentIdx = idx;
    audio.src = tracks[idx].url;
    saveState();
    emit('trackchange');
    emit('playlistchange');
  }

  function delTrack(idx) {
    if (idx < 0 || idx >= tracks.length) return Promise.resolve();
    var id = tracks[idx].id;
    URL.revokeObjectURL(tracks[idx].url);
    tracks.splice(idx, 1);
    return dbDelete(id).then(function() {
      if (idx === currentIdx) {
        audio.pause();
        if (tracks.length > 0) {
          currentIdx = Math.min(idx, tracks.length - 1);
          loadTrack(currentIdx);
        } else {
          currentIdx = -1;
          audio.src = '';
          emit('trackchange');
        }
      } else if (idx < currentIdx) {
        currentIdx--;
      }
      saveState();
      emit('playlistchange');
    });
  }

  function clearPlaylist() {
    tracks.forEach(function(t) { URL.revokeObjectURL(t.url); });
    tracks = [];
    currentIdx = -1;
    audio.pause();
    audio.src = '';
    return dbClear().then(function() {
      saveState();
      emit('trackchange');
      emit('playlistchange');
    });
  }

  // ===== Playback =====
  function play() {
    if (tracks.length === 0) return;
    if (currentIdx === -1) loadTrack(0);
    initAudioCtx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    audio.play().catch(function() {});
  }
  function pause() { audio.pause(); }
  function togglePlay() {
    if (tracks.length === 0) return;
    if (currentIdx === -1) loadTrack(0);
    initAudioCtx();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audio.paused) audio.play().catch(function() {});
    else audio.pause();
  }
  function next() {
    if (tracks.length === 0) return;
    var idx = isShuffle ? Math.floor(Math.random() * tracks.length)
                        : (currentIdx >= tracks.length - 1 ? 0 : currentIdx + 1);
    loadTrack(idx); play();
  }
  function prev() {
    if (tracks.length === 0) return;
    var idx = isShuffle ? Math.floor(Math.random() * tracks.length)
                        : (currentIdx <= 0 ? tracks.length - 1 : currentIdx - 1);
    loadTrack(idx); play();
  }
  function seek(time) { if (audio.duration) audio.currentTime = time; }
  function setVolume(vol) { audio.muted = false; audio.volume = vol; savedVol = vol; saveState(); }
  function toggleMute() {
    if (audio.muted) { audio.muted = false; audio.volume = savedVol; }
    else { savedVol = audio.volume; audio.muted = true; }
    saveState();
  }
  function togglePlayMode() { playMode = (playMode + 1) % 3; syncPlayMode(); saveState(); emit('statechange'); }
  function toggleShuffle() { playMode = playMode === 2 ? 0 : 2; syncPlayMode(); saveState(); emit('statechange'); }
  function toggleRepeat() { playMode = (playMode + 1) % 3; syncPlayMode(); saveState(); emit('statechange'); }

  // ===== Audio events =====
  audio.addEventListener('play', function() { emit('play'); updateMiniPlayer(); });
  audio.addEventListener('pause', function() { emit('pause'); saveState(); updateMiniPlayer(); });
  audio.addEventListener('ended', function() {
    if (repeatMode === 2) { audio.currentTime = 0; audio.play().catch(function() {}); }
    else if (repeatMode === 1 || currentIdx < tracks.length - 1 || isShuffle) next();
    else { emit('pause'); updateMiniPlayer(); }
  });
  audio.addEventListener('timeupdate', function() {
    emit('timeupdate');
    updateMiniPlayer();
    var now = Date.now();
    if (now - lastSave > 1000) { lastSave = now; saveState(); }
  });
  audio.addEventListener('loadedmetadata', function() { emit('loadedmetadata'); });
  audio.addEventListener('volumechange', function() { emit('volumechange'); saveState(); });

  // ===== Mini-player UI =====
  function createMiniPlayer() {
    if (document.getElementById('miniPlayer')) return;
    var el = document.createElement('div');
    el.id = 'miniPlayer';
    el.className = 'mini-player';
    el.innerHTML =
      '<div class="mp-progress" id="mpProgress">' +
        '<div class="mp-progress-fill" id="mpProgressFill"></div>' +
      '</div>' +
      '<div class="mp-bar">' +
        '<div class="mp-info" id="mpInfo">' +
          '<div class="mp-icon" id="mpIcon">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>' +
          '</div>' +
          '<div class="mp-text">' +
            '<div class="mp-title" id="mpTitle">未播放</div>' +
            '<div class="mp-time" id="mpTime">0:00 / 0:00</div>' +
          '</div>' +
        '</div>' +
        '<div class="mp-controls">' +
          '<button class="mp-btn" id="mpPrev" title="上一首"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>' +
          '<button class="mp-btn play" id="mpPlay" title="播放/暂停">' +
            '<svg class="mp-play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
            '<svg class="mp-pause-icon" viewBox="0 0 24 24" fill="currentColor" style="display:none"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>' +
          '</button>' +
          '<button class="mp-btn" id="mpNext" title="下一首"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg></button>' +
        '</div>' +
        '<a href="music.html" class="mp-expand" title="打开播放器">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>' +
        '</a>' +
      '</div>';
    document.body.appendChild(el);

    document.getElementById('mpPlay').onclick = togglePlay;
    document.getElementById('mpPrev').onclick = prev;
    document.getElementById('mpNext').onclick = next;

    var mpProgress = document.getElementById('mpProgress');
    var seeking = false;
    function mpSeek(e) {
      var rect = mpProgress.getBoundingClientRect();
      var cx = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
      var pct = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      if (audio.duration) audio.currentTime = pct * audio.duration;
    }
    mpProgress.addEventListener('mousedown', function(e) { seeking = true; mpSeek(e); });
    window.addEventListener('mousemove', function(e) { if (seeking) mpSeek(e); });
    window.addEventListener('mouseup', function() { seeking = false; });

    updateMiniPlayer();
  }

  function updateMiniPlayer() {
    var mpTitle = document.getElementById('mpTitle');
    if (!mpTitle) return;
    var mpTime = document.getElementById('mpTime');
    var mpPlay = document.getElementById('mpPlay');
    var mpIcon = document.getElementById('mpIcon');
    var mpProgressFill = document.getElementById('mpProgressFill');
    var mpPlayer = document.getElementById('miniPlayer');

    var hasTrack = currentIdx >= 0 && tracks[currentIdx];
    if (hasTrack) {
      mpTitle.textContent = tracks[currentIdx].name;
      mpTime.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      mpIcon.classList.add('active');
      if (mpPlayer) { mpPlayer.classList.add('has-track'); document.body.classList.add('has-mini-player'); }
    } else {
      mpTitle.textContent = '未播放';
      mpTime.textContent = '0:00 / 0:00';
      mpIcon.classList.remove('active');
      if (mpPlayer) { mpPlayer.classList.remove('has-track'); document.body.classList.remove('has-mini-player'); }
    }

    var playIcon = mpPlay.querySelector('.mp-play-icon');
    var pauseIcon = mpPlay.querySelector('.mp-pause-icon');
    if (audio.paused) { playIcon.style.display = 'block'; pauseIcon.style.display = 'none'; }
    else { playIcon.style.display = 'none'; pauseIcon.style.display = 'block'; }

    if (audio.duration) mpProgressFill.style.width = (audio.currentTime / audio.duration * 100) + '%';
    else mpProgressFill.style.width = '0%';
  }

  // ===== Export / Import =====
  function blobToBase64(blob) {
    return new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result.split(',')[1]); };
      reader.readAsDataURL(blob);
    });
  }
  function base64ToBlob(base64, type) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }
  function exportData() {
    var result = { version: 1, tracks: [] };
    var promises = tracks.map(function(t) {
      return dbGet(t.id).then(function(item) {
        if (item && item.blob) return blobToBase64(item.blob).then(function(b64) {
          result.tracks.push({ name: t.name, size: t.size, type: item.blob.type, data: b64 });
        });
      });
    });
    return Promise.all(promises).then(function() { return result; });
  }
  function importData(data) {
    if (!data || !data.tracks) return Promise.resolve(0);
    var added = 0;
    var promises = data.tracks.map(function(t) {
      var blob = base64ToBlob(t.data, t.type || 'audio/mpeg');
      var id = 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      return dbPut({ id: id, name: t.name, size: t.size || blob.size, blob: blob }).then(function() {
        tracks.push({ id: id, name: t.name, size: t.size || blob.size, url: URL.createObjectURL(blob) });
        added++;
      });
    });
    return Promise.all(promises).then(function() {
      if (added > 0) { if (currentIdx === -1) currentIdx = 0; saveState(); emit('playlistchange'); }
      return added;
    });
  }

  // ===== Global API =====
  window.MusicPlayer = {
    audio: audio,
    get tracks() { return tracks; },
    get currentIdx() { return currentIdx; },
    get playMode() { return playMode; },
    get isShuffle() { return isShuffle; },
    get repeatMode() { return repeatMode; },
    get analyser() { return analyser; },
    get dataArr() { return dataArr; },
    get isPlaying() { return !audio.paused; },
    get volume() { return audio.volume; },
    get muted() { return audio.muted; },
    on: on, addFiles: addFiles, loadTrack: loadTrack, delTrack: delTrack, clearPlaylist: clearPlaylist,
    play: play, pause: pause, togglePlay: togglePlay, next: next, prev: prev,
    seek: seek, setVolume: setVolume, toggleMute: toggleMute,
    togglePlayMode: togglePlayMode, toggleShuffle: toggleShuffle, toggleRepeat: toggleRepeat,
    initAudioCtx: initAudioCtx, formatTime: formatTime, saveState: saveState,
    exportData: exportData, importData: importData
  };

  // ===== Init =====
  initDB().then(function() { return loadTracksFromDB(); }).then(function() {
    if (!isMusicPage) createMiniPlayer();
    emit('ready');
  }).catch(function(e) {
    console.warn('MusicPlayer init failed', e);
    if (!isMusicPage) createMiniPlayer();
    emit('ready');
  });

  window.addEventListener('beforeunload', saveState);
})();