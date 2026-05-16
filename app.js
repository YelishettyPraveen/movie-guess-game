const screens = {
  setup: document.querySelector('[data-screen="setup"]'),
  game: document.querySelector('[data-screen="game"]'),
  result: document.querySelector('[data-screen="result"]'),
};

const setupForm = document.getElementById("setup-form");
const movieInput = document.getElementById("movie-input");
const attemptsInput = document.getElementById("attempts-input");
const movieVisibilityBtn = document.getElementById("movie-visibility-btn");
const setupError = document.getElementById("setup-error");
const quitBtn = document.getElementById("quit-btn");
const newGameBtn = document.getElementById("new-game-btn");
const timerDisplay = document.getElementById("timer-display");
const movieDisplay = document.getElementById("movie-display");
const attemptsDisplay = document.getElementById("attempts-display");
const attemptsProgress = document.getElementById("attempts-progress");
const gameMessage = document.getElementById("game-message");
const letterGrid = document.getElementById("letter-grid");
const resultSubtitle = document.getElementById("result-subtitle");
const resultBadge = document.getElementById("result-badge");
const resultMovie = document.getElementById("result-movie");
const resultAttempts = document.getElementById("result-attempts");
const resultTime = document.getElementById("result-time");
const confirmModal = document.getElementById("confirm-modal");
const confirmResetBtn = document.getElementById("confirm-reset-btn");
const cancelResetBtn = document.getElementById("cancel-reset-btn");

const MOVIE_ALLOWED = /[A-Z ]/;
const ATTEMPTS_ALLOWED = /[A-Z0-9]/;
const WARNING_SECONDS = [30, 60, 90];

const state = {
  movie: "",
  attemptsWord: "",
  revealed: [],
  guessed: new Set(),
  wrongGuesses: 0,
  currentScreen: "setup",
  timerStart: null,
  timerId: null,
  elapsedSeconds: 0,
  triggeredWarnings: new Set(),
  phase: "idle",
  audioUnlocked: false,
  result: null,
};

buildKeyboard();
render();

movieInput.addEventListener("input", (event) => {
  const cleaned = filterWithRules(event.target.value, MOVIE_ALLOWED, true);
  if (cleaned !== event.target.value) {
    event.target.value = cleaned;
  }
});

attemptsInput.addEventListener("input", (event) => {
  const cleaned = filterWithRules(event.target.value, ATTEMPTS_ALLOWED, false);
  if (cleaned !== event.target.value) {
    event.target.value = cleaned;
  }
});

movieVisibilityBtn.addEventListener("click", () => {
  const isHidden = movieInput.type === "password";
  movieInput.type = isHidden ? "text" : "password";
  movieVisibilityBtn.textContent = isHidden ? "Hide" : "Show";
  movieVisibilityBtn.setAttribute("aria-pressed", String(isHidden));
});

setupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const movie = movieInput.value.toUpperCase();
  const attemptsWord = attemptsInput.value.toUpperCase();
  const error = validateSetup(movie, attemptsWord);

  if (error) {
    setupError.textContent = error;
    return;
  }

  unlockAudio();
  setupError.textContent = "";
  state.movie = movie;
  state.attemptsWord = attemptsWord;
  state.revealed = [...movie].map((char) => char === " ");
  state.guessed = new Set();
  state.wrongGuesses = 0;
  state.elapsedSeconds = 0;
  state.triggeredWarnings = new Set();
  state.phase = "playing";
  state.result = null;
  state.timerStart = Date.now();
  startTimer();
  switchScreen("game");
  render();
});

quitBtn.addEventListener("click", () => {
  confirmModal.classList.remove("hidden");
});

confirmResetBtn.addEventListener("click", () => {
  confirmModal.classList.add("hidden");
  resetToSetup();
});

cancelResetBtn.addEventListener("click", () => {
  confirmModal.classList.add("hidden");
});

newGameBtn.addEventListener("click", () => {
  resetToSetup();
});

document.addEventListener("keydown", (event) => {
  if (state.currentScreen !== "game" || state.phase !== "playing") {
    return;
  }

  const key = event.key.toUpperCase();
  if (!/^[A-Z]$/.test(key)) {
    return;
  }

  submitGuess(key);
});

function filterWithRules(value, allowedPattern, allowSpaces) {
  const upper = value.toUpperCase();
  const chars = [...upper].filter((char) => allowedPattern.test(char));
  if (!allowSpaces) {
    return chars.join("");
  }
  return chars.join("");
}

function validateSetup(movie, attemptsWord) {
  if (!movie) {
    return "Enter a movie name.";
  }
  if (movie.length > 50) {
    return "Movie name must be 50 characters or fewer.";
  }
  if (![...movie].every((char) => MOVIE_ALLOWED.test(char))) {
    return "Movie name can contain only letters and spaces.";
  }
  if (!/[A-Z]/.test(movie)) {
    return "Movie name must include at least one letter.";
  }
  if (!attemptsWord) {
    return "Enter an attempts word.";
  }
  if (![...attemptsWord].every((char) => ATTEMPTS_ALLOWED.test(char))) {
    return "Attempts word can contain only letters and numbers.";
  }
  return "";
}

function switchScreen(name) {
  state.currentScreen = name;
  Object.entries(screens).forEach(([screenName, element]) => {
    element.classList.toggle("active", screenName === name);
  });
}

function buildKeyboard() {
  letterGrid.innerHTML = "";
  const rows = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

  rows.forEach((row, index) => {
    const rowElement = document.createElement("div");
    rowElement.className = `keyboard-row${index === 1 ? " offset-1" : ""}${index === 2 ? " offset-2" : ""}`;

    [...row].forEach((letter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "letter-button";
      button.textContent = letter;
      button.dataset.letter = letter;
      button.addEventListener("click", () => submitGuess(letter));
      rowElement.appendChild(button);
    });

    letterGrid.appendChild(rowElement);
  });
}

function submitGuess(letter) {
  if (state.phase !== "playing") {
    return;
  }

  if (state.guessed.has(letter)) {
    gameMessage.textContent = "Already guessed.";
    return;
  }

  unlockAudio();
  state.guessed.add(letter);
  const movieChars = [...state.movie];
  let hit = false;

  movieChars.forEach((char, index) => {
    if (char === letter) {
      state.revealed[index] = true;
      hit = true;
    }
  });

  if (hit) {
    gameMessage.textContent = `Correct: ${letter}`;
    playToneSequence([
      { frequency: 620, duration: 0.08, type: "triangle" },
      { frequency: 760, duration: 0.1, type: "triangle" },
    ]);
  } else {
    state.wrongGuesses += 1;
    gameMessage.textContent = `Wrong: ${letter}`;
    playToneSequence([{ frequency: 240, duration: 0.18, type: "sawtooth" }]);
  }

  if (isMovieSolved()) {
    endRound("win");
  } else if (state.wrongGuesses >= state.attemptsWord.length) {
    endRound("lose");
  }

  render();
}

function isMovieSolved() {
  return state.revealed.every(Boolean);
}

function render() {
  renderMovie();
  renderAttempts();
  renderKeyboard();
  timerDisplay.textContent = formatTime(state.elapsedSeconds);
}

function renderMovie() {
  movieDisplay.innerHTML = "";
  [...state.movie].forEach((char, index) => {
    const tile = document.createElement("div");
    tile.className = "movie-tile";

    if (char === " ") {
      tile.classList.add("space");
      tile.innerHTML = "&nbsp;";
    } else if (state.revealed[index]) {
      tile.textContent = char;
    } else {
      tile.classList.add("hidden");
      tile.textContent = char;
    }

    movieDisplay.appendChild(tile);
  });
}

function renderAttempts() {
  attemptsDisplay.innerHTML = "";
  const total = state.attemptsWord.length;
  const remaining = Math.max(total - state.wrongGuesses, 0);
  attemptsProgress.textContent = `${remaining} left / ${total}`;

  [...state.attemptsWord].forEach((char, index) => {
    const tile = document.createElement("div");
    tile.className = "attempt-tile";
    tile.textContent = char;
    if (index < state.wrongGuesses) {
      tile.classList.add("spent");
    }
    attemptsDisplay.appendChild(tile);
  });
}

function renderKeyboard() {
  const buttons = letterGrid.querySelectorAll(".letter-button");
  buttons.forEach((button) => {
    const letter = button.dataset.letter;
    const wasGuessed = state.guessed.has(letter);
    const isCorrect = state.movie.includes(letter);
    button.disabled = wasGuessed || state.phase === "ended";
    button.classList.toggle("correct", wasGuessed && isCorrect);
    button.classList.toggle("wrong", wasGuessed && !isCorrect);
  });
}

function startTimer() {
  stopTimer();
  state.timerId = window.setInterval(() => {
    state.elapsedSeconds = Math.floor((Date.now() - state.timerStart) / 1000);
    maybePlayWarning();
    timerDisplay.textContent = formatTime(state.elapsedSeconds);
  }, 250);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function maybePlayWarning() {
  WARNING_SECONDS.forEach((second) => {
    if (state.elapsedSeconds >= second && !state.triggeredWarnings.has(second)) {
      state.triggeredWarnings.add(second);
      gameMessage.textContent = `Time warning: ${second} seconds reached.`;
      playToneSequence([
        { frequency: 540, duration: 0.1, type: "square" },
        { frequency: 540, duration: 0.1, type: "square", gap: 0.08 },
      ]);
    }
  });
}

function endRound(result) {
  stopTimer();
  state.phase = "ended";
  state.result = result;
  gameMessage.textContent = result === "win" ? "You won." : "You lost.";
  render();
  renderResult();

  if (result === "win") {
    playToneSequence([
      { frequency: 523.25, duration: 0.12, type: "triangle" },
      { frequency: 659.25, duration: 0.12, type: "triangle", gap: 0.05 },
      { frequency: 783.99, duration: 0.2, type: "triangle", gap: 0.05 },
    ]);
  } else {
    playToneSequence([
      { frequency: 329.63, duration: 0.16, type: "sine" },
      { frequency: 261.63, duration: 0.22, type: "sine", gap: 0.05 },
    ]);
  }

  switchScreen("result");
}

function renderResult() {
  const didWin = state.result === "win";
  resultSubtitle.textContent = didWin
    ? "All letters were found before the attempts word ran out."
    : "The attempts word was exhausted before the movie was fully revealed.";
  resultBadge.textContent = didWin ? "Win" : "Lose";
  resultBadge.className = `result-badge ${didWin ? "win" : "lose"}`;
  resultMovie.textContent = state.movie;
  resultAttempts.textContent = state.attemptsWord;
  resultTime.textContent = formatTime(state.elapsedSeconds);
}

function resetToSetup() {
  stopTimer();
  confirmModal.classList.add("hidden");
  state.movie = "";
  state.attemptsWord = "";
  state.revealed = [];
  state.guessed = new Set();
  state.wrongGuesses = 0;
  state.currentScreen = "setup";
  state.timerStart = null;
  state.elapsedSeconds = 0;
  state.triggeredWarnings = new Set();
  state.phase = "idle";
  state.result = null;
  setupForm.reset();
  attemptsInput.value = "TOLLYWOOD";
  movieInput.type = "password";
  movieVisibilityBtn.textContent = "Show";
  movieVisibilityBtn.setAttribute("aria-pressed", "false");
  setupError.textContent = "";
  gameMessage.textContent = "Pick a letter from the board or use your keyboard.";
  switchScreen("setup");
  render();
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

let audioContext;

function unlockAudio() {
  if (state.audioUnlocked) {
    return;
  }
  try {
    audioContext = audioContext || new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.value = 0.0001;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.01);
    state.audioUnlocked = true;
  } catch {
    state.audioUnlocked = false;
  }
}

function playToneSequence(steps) {
  if (!audioContext) {
    return;
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  let cursor = audioContext.currentTime;
  steps.forEach((step) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = step.type || "sine";
    oscillator.frequency.value = step.frequency;
    gain.gain.setValueAtTime(0.0001, cursor);
    gain.gain.exponentialRampToValueAtTime(0.06, cursor + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, cursor + step.duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(cursor);
    oscillator.stop(cursor + step.duration);
    cursor += step.duration + (step.gap || 0.04);
  });
}
