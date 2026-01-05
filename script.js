// ============================================
// FIREBASE CONFIGURATION
// ============================================
// PENTING: Ganti dengan konfigurasi Firebase Anda sendiri!

// Import the functions you need from the SDKs you need

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAeaSeJXjD8MRwqndNLrj0pTnisPZm_TLA",
    authDomain: "timerapp-7faab.firebaseapp.com",
    databaseURL: "https://timerapp-7faab-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "timerapp-7faab",
    storageBucket: "timerapp-7faab.appspot.com",
    messagingSenderId: "351900413922",
    appId: "1:351900413922:web:d5d135cc50bbdd42ded3bb"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const timerRef = database.ref('timer');

// ============================================
// ROLE DETECTION (HOST vs VIEWER)
// ============================================
const SECRET_KEY = "RAHASIA123"; // Ganti dengan key rahasia Anda
const urlParams = new URLSearchParams(window.location.search);
const userRole = urlParams.get('role');
const userKey = urlParams.get('key');
const isHost = (userRole === 'host' && userKey === SECRET_KEY);

// ============================================
// STATE VARIABLES
// ============================================
let timerInterval = null;
let startTime = 0;
let isRunning = false;
let isPaused = false;
let countdownTime = 0;
let remainingTime = 0;
let serverTimeOffset = 0; // Offset untuk sinkronisasi waktu

// Audio state
let audioCtx = null;
let lastWarningState = 'normal';
let tickIntervalId = null;
let lastTickSecond = null;

// Input snapshot
let initialInputs = { h: null, m: null, s: null };

// DOM Elements
let timerDisplay, startBtn, pauseBtn, stopBtn, pauseText, pauseIcon;
let modeIndicator, timeInputSection, inputHours, inputMinutes, inputSeconds, modalOverlay;
let roleBadge, roleText, connectionStatus, statusText, shortcutsInfo;

// ============================================
// INITIALIZE DOM & APP
// ============================================
document.addEventListener('DOMContentLoaded', function () {
    // Get DOM elements
    timerDisplay = document.getElementById('timerDisplay');
    startBtn = document.getElementById('startBtn');
    pauseBtn = document.getElementById('pauseBtn');
    stopBtn = document.getElementById('stopBtn');
    pauseText = document.getElementById('pauseText');
    pauseIcon = document.getElementById('pauseIcon');
    modeIndicator = document.getElementById('modeIndicator');
    timeInputSection = document.getElementById('timeInputSection');
    inputHours = document.getElementById('inputHours');
    inputMinutes = document.getElementById('inputMinutes');
    inputSeconds = document.getElementById('inputSeconds');
    modalOverlay = document.getElementById('modalOverlay');
    roleBadge = document.getElementById('roleBadge');
    roleText = document.getElementById('roleText');
    connectionStatus = document.getElementById('connectionStatus');
    statusText = document.getElementById('statusText');
    shortcutsInfo = document.getElementById('shortcutsInfo');

    // Setup role-based UI
    setupRoleUI();

    // Sync server time offset
    syncServerTime();

    // Listen to Firebase changes
    setupFirebaseListener();

    // Monitor connection status
    setupConnectionMonitor();

    // Event listeners (only for host)
    if (isHost) {
        inputHours.addEventListener('input', updateCountdownDisplay);
        inputMinutes.addEventListener('input', updateCountdownDisplay);
        inputSeconds.addEventListener('input', updateCountdownDisplay);
        document.addEventListener('keydown', handleKeydown);
    }

    // Initialize
    initCountdownMode();
    updateCountdownDisplay();
});

// ============================================
// ROLE-BASED UI SETUP
// ============================================
function setupRoleUI() {
    if (isHost) {
        // HOST: Show all controls
        roleText.textContent = 'HOST';
        roleBadge.classList.add('host');
        startBtn.style.display = 'flex';

        // Enable inputs
        inputHours.disabled = false;
        inputMinutes.disabled = false;
        inputSeconds.disabled = false;
    } else {
        // VIEWER: Hide all controls
        roleText.textContent = 'VIEWER';
        roleBadge.classList.add('viewer');

        // Hide control buttons completely
        const buttonsContainer = document.querySelector('.buttons-container');
        if (buttonsContainer) {
            buttonsContainer.style.display = 'none';
        }

        // Hide keyboard shortcuts info
        if (shortcutsInfo) {
            shortcutsInfo.style.display = 'none';
        }

        // Disable inputs
        inputHours.disabled = true;
        inputMinutes.disabled = true;
        inputSeconds.disabled = true;

        // Make inputs look read-only
        inputHours.style.cursor = 'default';
        inputMinutes.style.cursor = 'default';
        inputSeconds.style.cursor = 'default';
    }
}

// ============================================
// SERVER TIME SYNCHRONIZATION
// ============================================
function syncServerTime() {
    const offsetRef = database.ref('.info/serverTimeOffset');
    offsetRef.on('value', (snapshot) => {
        serverTimeOffset = snapshot.val() || 0;
        console.log('Server time offset:', serverTimeOffset);
    });
}

function getServerTime() {
    return Date.now() + serverTimeOffset;
}

// ============================================
// CONNECTION MONITOR
// ============================================
function setupConnectionMonitor() {
    const connectedRef = database.ref('.info/connected');
    connectedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            connectionStatus.classList.add('connected');
            connectionStatus.classList.remove('disconnected');
            statusText.textContent = 'Connected';
        } else {
            connectionStatus.classList.remove('connected');
            connectionStatus.classList.add('disconnected');
            statusText.textContent = 'Reconnecting...';
        }
    });
}

// ============================================
// FIREBASE LISTENER (Real-time sync)
// ============================================
function setupFirebaseListener() {
    timerRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        console.log('Firebase data received:', data);

        // Handle different statuses
        switch (data.status) {
            case 'running':
                handleRunningState(data);
                break;
            case 'paused':
                handlePausedState(data);
                break;
            case 'reset':
            case 'stopped':
                handleResetState(data);
                break;
        }
    });
}

function handleRunningState(data) {
    // Calculate remaining time based on server start time
    const currentServerTime = getServerTime();
    const elapsed = currentServerTime - data.startTime;
    remainingTime = Math.max(0, data.duration - elapsed);

    if (remainingTime <= 0) {
        // Timer sudah selesai
        handleTimerComplete();
        return;
    }

    // Update state
    countdownTime = data.duration;
    startTime = data.startTime - serverTimeOffset; // Convert to local time
    isRunning = true;
    isPaused = false;

    // Start local timer for smooth display
    if (!timerInterval) {
        clearInterval(timerInterval);
        timerInterval = setInterval(updateCountdownDisplayRunning, 10);
        startTicking();
    }

    // Update UI
    timerDisplay.classList.add('running');
    updateButtonsForRunning();
    disableInputs();
}

function handlePausedState(data) {
    // Stop local timer
    clearInterval(timerInterval);
    timerInterval = null;
    stopTicking();

    // Update state
    remainingTime = data.remainingTime || data.duration;
    countdownTime = data.duration;
    isRunning = true;
    isPaused = true;

    // Update display
    updateDisplayFromRemaining(remainingTime);
    timerDisplay.classList.remove('running');
    updateButtonsForPaused();
    disableInputs();
}

function handleResetState(data) {
    // Stop everything
    clearInterval(timerInterval);
    timerInterval = null;
    stopTicking();

    // Reset state
    isRunning = false;
    isPaused = false;
    remainingTime = 0;
    countdownTime = 0;

    // Update display
    if (data.initialDuration) {
        const hrs = Math.floor(data.initialDuration / 3600000);
        const mins = Math.floor((data.initialDuration % 3600000) / 60000);
        const secs = Math.floor((data.initialDuration % 60000) / 1000);

        inputHours.value = String(hrs).padStart(2, '0');
        inputMinutes.value = String(mins).padStart(2, '0');
        inputSeconds.value = String(secs).padStart(2, '0');
    }

    // Reset UI
    timerDisplay.classList.remove('running', 'warning', 'danger', 'panic');
    lastWarningState = 'normal';
    updateButtonsForStopped();

    if (isHost) {
        enableInputs();
    }
}

function handleTimerComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    isPaused = false;

    timerDisplay.classList.remove('running', 'panic', 'danger', 'warning');
    lastWarningState = 'normal';
    stopTicking();

    // Show completion modal
    modalOverlay.classList.add('active');

    updateButtonsForStopped();

    if (isHost) {
        enableInputs();
    }
}

// ============================================
// FIREBASE SYNC FUNCTIONS (Host only)
// ============================================
function syncTimerToFirebase(status, additionalData = {}) {
    if (!isHost) return;

    const data = {
        status: status,
        lastUpdated: getServerTime(),
        ...additionalData
    };

    timerRef.set(data)
        .then(() => console.log('Timer synced to Firebase:', data))
        .catch((error) => console.error('Firebase sync error:', error));
}

// ============================================
// AUDIO & TICK FUNCTIONS
// ============================================
function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
    } catch (e) {
        audioCtx = null;
    }
    return audioCtx;
}

function playBeep(freq = 880, duration = 120, volume = 0.08, type = 'sine') {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(volume, now);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration / 1000);
    o.stop(now + duration / 1000 + 0.05);
}

function startTicking() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    stopTicking();
    lastTickSecond = null;
    tickIntervalId = setInterval(() => {
        if (!isRunning || isPaused) return;
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, countdownTime - elapsed);
        const secs = Math.ceil(remaining / 1000);

        if (remaining > 30000) return;

        if (lastTickSecond === null || secs !== lastTickSecond) {
            playTickForRemaining(remaining);
            lastTickSecond = secs;
        }
    }, 50);
}

function stopTicking() {
    if (tickIntervalId) {
        clearInterval(tickIntervalId);
        tickIntervalId = null;
    }
    lastTickSecond = null;
}

function playTickForRemaining(remainingMs) {
    if (remainingMs <= 4000) {
        playBeep(800, 100, 0.8, 'sawtooth');
        setTimeout(() => playBeep(600, 80, 0.6, 'square'), 250);
        setTimeout(() => playBeep(800, 100, 0.8, 'sawtooth'), 500);
        setTimeout(() => playBeep(600, 80, 0.6, 'square'), 750);
    }
    else if (remainingMs <= 11000) {
        playBeep(660, 90, 0.2, 'sawtooth');
    }
    else if (remainingMs <= 31000) {
        playBeep(880, 70, 0.08, 'sine');
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function validateInput(input, max) {
    let value = parseInt(input.value) || 0;
    if (value < 0) value = 0;
    if (value > max) value = max;
    input.value = String(value).padStart(2, '0');
}

function initCountdownMode() {
    modeIndicator.textContent = 'Countdown Mode';
    modeIndicator.classList.add('countdown');
    timerDisplay.classList.add('countdown-mode');
    timeInputSection.classList.add('active');
}

function updateCountdownDisplay() {
    const hours = parseInt(inputHours.value) || 0;
    const minutes = parseInt(inputMinutes.value) || 0;
    const seconds = parseInt(inputSeconds.value) || 0;

    inputHours.value = String(hours).padStart(2, '0');
    inputMinutes.value = String(minutes).padStart(2, '0');
    inputSeconds.value = String(seconds).padStart(2, '0');
}

function getCountdownTime() {
    const hours = parseInt(inputHours.value) || 0;
    const minutes = parseInt(inputMinutes.value) || 0;
    const seconds = parseInt(inputSeconds.value) || 0;
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function updateDisplayFromRemaining(remaining) {
    const hrs = Math.floor(remaining / 3600000);
    const mins = Math.floor((remaining % 3600000) / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);

    inputHours.value = String(hrs).padStart(2, '0');
    inputMinutes.value = String(mins).padStart(2, '0');
    inputSeconds.value = String(secs).padStart(2, '0');
}

function updateCountdownDisplayRunning() {
    const elapsed = Date.now() - startTime;
    remainingTime = countdownTime - elapsed;

    if (remainingTime <= 0) {
        remainingTime = 0;
        inputHours.value = '00';
        inputMinutes.value = '00';
        inputSeconds.value = '00';
        countdownComplete();
        return;
    }

    const hrs = Math.floor(remainingTime / 3600000);
    const mins = Math.floor((remainingTime % 3600000) / 60000);
    const secs = Math.floor((remainingTime % 60000) / 1000);

    inputHours.value = String(hrs).padStart(2, '0');
    inputMinutes.value = String(mins).padStart(2, '0');
    inputSeconds.value = String(secs).padStart(2, '0');

    // Warning states
    let desiredState = 'normal';
    if (remainingTime <= 4000) desiredState = 'panic';
    else if (remainingTime <= 11000) desiredState = 'danger';
    else if (remainingTime <= 31000) desiredState = 'warning';

    timerDisplay.classList.remove('warning', 'danger', 'panic');
    if (desiredState !== 'normal') timerDisplay.classList.add(desiredState);

    if (desiredState !== lastWarningState) {
        try { ensureAudioContext(); } catch (e) { }
        lastWarningState = desiredState;
    }
}

function countdownComplete() {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    isPaused = false;
    timerDisplay.classList.remove('running', 'panic', 'danger', 'warning');
    lastWarningState = 'normal';
    stopTicking();

    modalOverlay.classList.add('active');

    updateButtonsForStopped();

    if (initialInputs.h !== null) {
        inputHours.value = String(initialInputs.h).padStart(2, '0');
        inputMinutes.value = String(initialInputs.m).padStart(2, '0');
        inputSeconds.value = String(initialInputs.s).padStart(2, '0');
    }

    if (isHost) {
        enableInputs();
    }
}

function closeModal() {
    modalOverlay.classList.remove('active');
    timerDisplay.classList.remove('danger', 'warning', 'panic');
    lastWarningState = 'normal';
    stopTicking();
    updateCountdownDisplay();
}

// ============================================
// UI UPDATE HELPERS
// ============================================
function updateButtonsForRunning() {
    if (!isHost) return;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    stopBtn.style.display = 'flex';
    updatePauseButton();
}

function updateButtonsForPaused() {
    if (!isHost) return;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'flex';
    stopBtn.style.display = 'flex';
    updatePauseButton();
}

function updateButtonsForStopped() {
    if (!isHost) return;
    startBtn.style.display = 'flex';
    pauseBtn.style.display = 'none';
    stopBtn.style.display = 'none';
}

function disableInputs() {
    inputHours.disabled = true;
    inputMinutes.disabled = true;
    inputSeconds.disabled = true;
}

function enableInputs() {
    if (!isHost) return;
    inputHours.disabled = false;
    inputMinutes.disabled = false;
    inputSeconds.disabled = false;
}

// ============================================
// TIMER CONTROL FUNCTIONS (Host only)
// ============================================
function startTimer() {
    if (!isHost) return;
    if (isRunning) return;

    const ctx = ensureAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume();
    }

    initialInputs.h = parseInt(inputHours.value) || 0;
    initialInputs.m = parseInt(inputMinutes.value) || 0;
    initialInputs.s = parseInt(inputSeconds.value) || 0;

    countdownTime = getCountdownTime();
    if (countdownTime <= 0) {
        alert('Please set a valid countdown time!');
        return;
    }

    remainingTime = countdownTime;
    startTime = Date.now();

    // Sync to Firebase
    syncTimerToFirebase('running', {
        startTime: getServerTime(),
        duration: countdownTime,
        initialDuration: countdownTime
    });

    // Local timer will be started by Firebase listener
    isRunning = true;
    isPaused = false;
    timerDisplay.classList.add('running');

    disableInputs();
    updateButtonsForRunning();
}

function togglePause() {
    if (!isHost) return;
    if (!isRunning) return;

    if (!isPaused) {
        // Pause
        clearInterval(timerInterval);
        timerInterval = null;
        stopTicking();
        isPaused = true;

        // Calculate remaining time
        const elapsed = Date.now() - startTime;
        remainingTime = Math.max(0, countdownTime - elapsed);

        timerDisplay.classList.remove('running');

        // Sync to Firebase
        syncTimerToFirebase('paused', {
            remainingTime: remainingTime,
            duration: countdownTime,
            initialDuration: initialInputs.h * 3600000 + initialInputs.m * 60000 + initialInputs.s * 1000
        });
    } else {
        // Resume
        const ctx = ensureAudioContext();
        if (ctx && ctx.state === 'suspended') ctx.resume();

        countdownTime = remainingTime;
        startTime = Date.now();
        isPaused = false;
        timerDisplay.classList.add('running');

        // Sync to Firebase
        syncTimerToFirebase('running', {
            startTime: getServerTime(),
            duration: remainingTime,
            initialDuration: initialInputs.h * 3600000 + initialInputs.m * 60000 + initialInputs.s * 1000
        });
    }

    updatePauseButton();
}

function updatePauseButton() {
    if (isPaused) {
        pauseText.textContent = 'Resume';
        pauseIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        pauseBtn.style.background = 'linear-gradient(135deg, #00c853, #00e676)';
        pauseBtn.style.boxShadow = '0 6px 25px rgba(0, 200, 83, 0.45)';
    } else {
        pauseText.textContent = 'Pause';
        pauseIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        pauseBtn.style.background = 'linear-gradient(135deg, #ff9800, #ffa726)';
        pauseBtn.style.boxShadow = '0 6px 25px rgba(255, 152, 0, 0.45)';
    }
}

function stopTimer() {
    if (!isHost) return;

    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    isPaused = false;
    countdownTime = 0;
    remainingTime = 0;

    timerDisplay.classList.remove('running', 'warning', 'danger', 'panic');
    lastWarningState = 'normal';
    stopTicking();

    enableInputs();

    if (initialInputs.h !== null) {
        inputHours.value = String(initialInputs.h).padStart(2, '0');
        inputMinutes.value = String(initialInputs.m).padStart(2, '0');
        inputSeconds.value = String(initialInputs.s).padStart(2, '0');
    } else {
        updateCountdownDisplay();
    }

    // Sync to Firebase
    syncTimerToFirebase('reset', {
        initialDuration: initialInputs.h * 3600000 + initialInputs.m * 60000 + initialInputs.s * 1000
    });

    updateButtonsForStopped();
}

function handleKeydown(e) {
    if (!isHost) return;
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            if (!isRunning) startTimer();
            else togglePause();
            break;
        case 'Escape':
            if (modalOverlay.classList.contains('active')) closeModal();
            else if (isRunning) stopTimer();
            break;
    }
}

// Expose validateInput to global scope for inline onchange
window.validateInput = validateInput;
window.startTimer = startTimer;
window.togglePause = togglePause;
window.stopTimer = stopTimer;
window.closeModal = closeModal;
