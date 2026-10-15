// ==========================================
// MEMORY GALAXY — TIMED CHALLENGE
// Countdown + 3 Lives + Progressive Levels
// ==========================================

const board = document.getElementById("game-board");
const timerDisplay = document.getElementById("timer");
const movesDisplay = document.getElementById("moves");
const pairsDisplay = document.getElementById("pairs");
const message = document.getElementById("game-message");
const levelDisplay = document.getElementById("current-level");
const bestScoreDisplay = document.getElementById("best-score");
const winModal = document.getElementById("win-modal");
const winStats = document.getElementById("win-stats");

const themes = {
  animals: ["🐱", "🐼", "🦊", "🐧", "🐸", "🦋", "🐰", "🐨", "🦁", "🐯", "🐙", "🦄"],
  fruits: ["🍓", "🍉", "🍊", "🍍", "🍇", "🍒", "🥝", "🥑", "🍑", "🍋", "🥥", "🍌"],
  space: ["🌙", "🪐", "⭐", "🚀", "☄️", "👽", "🌍", "🌌", "🛰️", "🌞", "🌠", "🌟"],
  nature: ["🌿", "🌸", "🌻", "🍄", "🌳", "🌵", "🍀", "🌷", "🌴", "🌼", "🌱", "🍁"]
};

// Each level adds more cards.
// Pair counts: 4, 6, 8, 10, 12.
const levels = {
  easy:   { pairs: 4, columns: 4, time: 60 },
  medium: { pairs: 6, columns: 4, time: 75 },
  hard:   { pairs: 8, columns: 4, time: 90 },
  expert: { pairs: 10, columns: 5, time: 100 },
  master: { pairs: 12, columns: 6, time: 120 }
};

const levelOrder = ["easy", "medium", "hard", "expert", "master"];

let currentLevel = "easy";
let currentTheme = "animals";

let cards = [];
let firstCard = null;
let secondCard = null;
locked = false;

let moves = 0;
let matchedPairs = 0;
let seconds = 0;
let timeLeft = levels.easy.time;
let lives = 3;

let timerInterval = null;
let gameStarted = false;
let gameEnded = false;

let soundEnabled = true;
let lightMode = false;
let mismatchTimeout = null;
let previewTimeout = null;
let combo = 0;
let score = 0;

// ------------------------------------------
// UTILITIES
// ------------------------------------------

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function playSound(frequency = 500, duration = 0.1) {
  if (!soundEnabled) return;

  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.value = 0.05;

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration
    );

    oscillator.stop(audioContext.currentTime + duration);
    oscillator.onended = () => audioContext.close();
  } catch (error) {
    console.warn("Audio is unavailable.", error);
  }
}

// ------------------------------------------
// LIVES
// ------------------------------------------

function renderLives() {
  const livesDisplay = document.getElementById("lives");

  if (!livesDisplay) return;

  livesDisplay.textContent =
    "❤️".repeat(lives) + "🖤".repeat(3 - lives);

  livesDisplay.setAttribute(
    "aria-label",
    `${lives} of 3 lives remaining`
  );
}

// ------------------------------------------
// COUNTDOWN TIMER
// ------------------------------------------

function updateTimerDisplay() {
  timerDisplay.textContent = formatTime(timeLeft);

  timerDisplay.classList.toggle("timer-warning", timeLeft <= 10);
}

function startTimer() {
  if (timerInterval !== null || gameEnded) return;

  timerInterval = setInterval(() => {
    if (gameEnded) {
      stopTimer();
      return;
    }

    timeLeft--;
    seconds++;

    updateTimerDisplay();

    if (timeLeft <= 0) {
      timeLeft = 0;
      updateTimerDisplay();
      endGame(false, "⏰ Time's up!");
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ------------------------------------------
// BEST SCORES
// ------------------------------------------

function getBestScore() {
  try {
    const saved = localStorage.getItem(
      `memoryGalaxyBest_${currentLevel}`
    );

    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function renderBestScore() {
  const best = getBestScore();

  bestScoreDisplay.textContent = best
    ? `${formatTime(best.seconds)} · ${best.moves} moves`
    : "No record yet";
}

function saveBestScore() {
  const previous = getBestScore();

  const isBetter =
    !previous ||
    score > (previous.score || 0) ||
    (
      score === (previous.score || 0) &&
      moves < previous.moves
    );

  if (!isBetter) return false;

  try {
    localStorage.setItem(
      `memoryGalaxyBest_${currentLevel}`,
      JSON.stringify({
        seconds,
        moves,
        score
      })
    );

    renderBestScore();
    return true;
  } catch (error) {
    console.warn("Could not save the best score.", error);
    return false;
  }
}

// ------------------------------------------
// CARD CREATION
// ------------------------------------------

function createCard(emoji, index) {
  const card = document.createElement("button");

  card.type = "button";
  card.className = "memory-card";
  card.dataset.emoji = emoji;
  card.dataset.index = index;

  card.setAttribute("aria-label", `Hidden card ${index + 1}`);

  card.innerHTML = `
    <span class="card-face card-back" aria-hidden="true">✦</span>
    <span class="card-face card-front" aria-hidden="true">${emoji}</span>
  `;

  card.addEventListener("click", () => flipCard(card));

  return card;
}

// ------------------------------------------
// START OR RESTART A LEVEL
// ------------------------------------------

function startGame() {
  stopTimer();
clearTimeout(mismatchTimeout);
clearTimeout(previewTimeout);

  cards = [];
  firstCard = null;
  secondCard = null;

  locked = false;
  moves = 0;
  matchedPairs = 0;

  seconds = 0;
  timeLeft = levels[currentLevel].time;
  lives = 3;
  combo = 0;
  score = 0;

  gameStarted = false;
  gameEnded = false;

  timerDisplay.classList.remove("timer-warning");

  updateTimerDisplay();

  movesDisplay.textContent = "0";
  pairsDisplay.textContent = `0 / ${levels[currentLevel].pairs}`;

  levelDisplay.textContent = currentLevel.toUpperCase();

  message.textContent =
    "Find all matching pairs before time runs out!";

  winModal.hidden = true;

  renderLives();

  const pairCount = levels[currentLevel].pairs;

  const selectedEmojis = shuffle(themes[currentTheme])
    .slice(0, pairCount);

  const deck = shuffle([
    ...selectedEmojis,
    ...selectedEmojis
  ]);

  board.style.gridTemplateColumns =
    `repeat(${levels[currentLevel].columns}, minmax(0, 1fr))`;

  board.replaceChildren();


deck.forEach((emoji, index) => {
  const card = createCard(emoji, index);

  cards.push(card);
  board.appendChild(card);
});

// Show all cards during the preview.
cards.forEach(card => {
  card.classList.add("flipped");
  card.setAttribute("aria-label", card.dataset.emoji);
});

message.textContent = "👀 Memorize the cards! Starting in 3 seconds...";

previewTimeout = setTimeout(() => {
  if (gameEnded) return;

  cards.forEach(card => {
    if (!card.classList.contains("matched")) {
      card.classList.remove("flipped");
      card.setAttribute(
        "aria-label",
        `Hidden card ${Number(card.dataset.index) + 1}`
      );
    }
  });

  locked = false;
  gameStarted = true;

  message.textContent = "🚀 Go! Find all matching pairs!";

  startTimer();
}, 3000);

renderBestScore();

}

// ------------------------------------------
// FLIP CARDS
// ------------------------------------------

function flipCard(card) {
  if (
    locked ||
    gameEnded ||
    card.classList.contains("flipped") ||
    card.classList.contains("matched")
  ) {
    return;
  }

  if (!gameStarted) {
    gameStarted = true;
    startTimer();
  }

  card.classList.add("flipped");
  card.setAttribute("aria-label", card.dataset.emoji);

  playSound(450, 0.08);

  if (!firstCard) {
    firstCard = card;
    message.textContent = "Find the matching card!";
    return;
  }

  secondCard = card;

  moves++;
  movesDisplay.textContent = moves;

  if (firstCard.dataset.emoji === secondCard.dataset.emoji) {
    handleMatch();
  } else {
    handleMismatch();
  }
}

// ------------------------------------------
// MATCH FOUND
// ------------------------------------------

function handleMatch() {
  firstCard.classList.add("matched");
  secondCard.classList.add("matched");

  firstCard.disabled = true;
  secondCard.disabled = true;

  matchedPairs++;
  combo++;

  // Points increase for consecutive correct matches.
  score += 100 + Math.max(0, combo - 1) * 25;

  pairsDisplay.textContent =
    `${matchedPairs} / ${levels[currentLevel].pairs}`;

  message.textContent = combo >= 3
    ? `🔥 ${combo} matches in a row! +${100 + (combo - 1) * 25} points!`
    : "✨ Amazing! You found a pair!";

  playSound(750, 0.18);

  firstCard = null;
  secondCard = null;

  if (matchedPairs === levels[currentLevel].pairs) {
    endGame(true);
  }
}

// ------------------------------------------
// MISMATCH: LOSE ONE HEART
// ------------------------------------------

function handleMismatch() {
  locked = true;
  combo = 0;

  lives--;
  renderLives();

  if (lives <= 0) {
    message.textContent = "💔 No lives left!";

    // Briefly show the two incorrect cards, then end the game.
    mismatchTimeout = setTimeout(() => {
      if (!gameEnded) {
        endGame(false, "💔 You ran out of lives!");
      }
    }, 650);

    return;
  }

  message.textContent =
    `💫 Not a match! ${lives} ${lives === 1 ? "life" : "lives"} left.`;

  playSound(260, 0.15);

  mismatchTimeout = setTimeout(() => {
    if (gameEnded) return;

    firstCard.classList.remove("flipped");
    secondCard.classList.remove("flipped");

    firstCard.setAttribute("aria-label", "Hidden card");
    secondCard.setAttribute("aria-label", "Hidden card");

    firstCard = null;
    secondCard = null;
   locked = false;

    message.textContent = "Be careful! Find the next matching pair.";
  }, 850);
}

// ------------------------------------------
// WIN / LOSE
// ------------------------------------------

function endGame(won, reason = "") {
  if (gameEnded) return;

  gameEnded = true;
  locked = true;

  stopTimer();
  clearTimeout(mismatchTimeout);

  // Small time bonus for finishing quickly.
  if (won) {
    score += timeLeft * 10;
    score += lives * 50;
  }

  const newRecord = won ? saveBestScore() : false;

  const title = winModal.querySelector("h2");

  if (title) {
    title.textContent = won
      ? "🌟 Galaxy Conquered!"
      : "💔 Game Over!";
  }

  const nextIndex = levelOrder.indexOf(currentLevel);
  const hasNextLevel = nextIndex < levelOrder.length - 1;

  if (won) {
    message.textContent = hasNextLevel
      ? "🏆 Level complete! Your next challenge awaits!"
      : "👑 Incredible! You conquered every level!";

    winStats.innerHTML = `
      <div>⏱️ Time: <strong>${formatTime(seconds)}</strong></div>
      <div>🔄 Moves: <strong>${moves}</strong></div>
      <div>⭐ Pairs: <strong>${matchedPairs}</strong></div>
      <div>❤️ Lives remaining: <strong>${lives}/3</strong></div>
      <div>✨ Score: <strong>${score}</strong></div>
      ${newRecord ? "<div>🎉 New personal best!</div>" : ""}
      ${
        hasNextLevel
          ? `<div>🚀 Next level: <strong>${levelOrder[nextIndex + 1].toUpperCase()}</strong></div>`
          : "<div>🌌 You completed the Galaxy Adventure!</div>"
      }
    `;

    playSound(880, 0.35);
  } else {
    message.textContent = reason;

    winStats.innerHTML = `
      <div>💫 Result: <strong>${reason}</strong></div>
      <div>⏱️ Time played: <strong>${formatTime(seconds)}</strong></div>
      <div>🔄 Moves: <strong>${moves}</strong></div>
      <div>⭐ Pairs found: <strong>${matchedPairs}/${levels[currentLevel].pairs}</strong></div>
      <div>❤️ Lives remaining: <strong>${lives}/3</strong></div>
      <div>✨ Score: <strong>${score}</strong></div>
      <div>💪 Try again and beat this level!</div>
    `;

    playSound(200, 0.3);
  }

  // Change the existing Play Again button's behavior.
  const playAgainButton =
    document.getElementById("play-again-button");

  if (playAgainButton) {
    playAgainButton.textContent = won
      ? (hasNextLevel ? "Next Level 🚀" : "Play Again 🔄")
      : "Try Again 🔄";
  }

  winModal.hidden = false;
}

// ------------------------------------------
// BUTTONS
// ------------------------------------------

document.getElementById("restart-button")
  .addEventListener("click", startGame);

document.getElementById("play-again-button")
  .addEventListener("click", () => {
    if (!gameEnded) {
      startGame();
      return;
    }

    if (
      matchedPairs === levels[currentLevel].pairs &&
      levelOrder.indexOf(currentLevel) < levelOrder.length - 1
    ) {
      const nextIndex = levelOrder.indexOf(currentLevel) + 1;
      currentLevel = levelOrder[nextIndex];

      updateDifficultyButtons();
    }

    startGame();
  });

// Difficulty buttons also allow manual level selection.
document.querySelectorAll(".difficulty-button").forEach(button => {
  button.addEventListener("click", () => {
    const selectedLevel = button.dataset.level;

    if (!levels[selectedLevel]) return;

    currentLevel = selectedLevel;
    updateDifficultyButtons();
    startGame();
  });
});

function updateDifficultyButtons() {
  document.querySelectorAll(".difficulty-button").forEach(button => {
    button.classList.toggle(
      "selected",
      button.dataset.level === currentLevel
    );
  });
}

// ------------------------------------------
// THEMES
// ------------------------------------------

document.querySelectorAll(".theme-card").forEach(button => {
  button.addEventListener("click", () => {
    const selectedTheme = button.dataset.theme;

    if (!themes[selectedTheme]) return;

    currentTheme = selectedTheme;

    document.querySelectorAll(".theme-card").forEach(item => {
      item.classList.toggle("selected", item === button);
    });

    startGame();
  });
});

// ------------------------------------------
// SOUND & LIGHT MODE
// ------------------------------------------

document.getElementById("sound-toggle")
  .addEventListener("click", event => {
    soundEnabled = !soundEnabled;

    event.currentTarget.textContent =
      soundEnabled ? "🔊" : "🔇";

    event.currentTarget.setAttribute(
      "aria-label",
      soundEnabled ? "Mute sound" : "Enable sound"
    );

    if (soundEnabled) playSound();
  });

document.getElementById("theme-toggle")
  .addEventListener("click", event => {
    lightMode = !lightMode;

    document.body.classList.toggle("light-mode", lightMode);

    event.currentTarget.textContent =
      lightMode ? "🌙" : "☀️";
  });

// ------------------------------------------
// NAVIGATION
// ------------------------------------------

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    const view = button.dataset.view;

    document.querySelectorAll(".nav-link").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    if (view === "play") {
      message.textContent =
        "Find all matching pairs before time runs out!";
    } else if (view === "scores") {
      const best = getBestScore();

      message.textContent = best
        ? `🏆 ${currentLevel.toUpperCase()} best: ${formatTime(best.seconds)}, ${best.moves} moves.`
        : "Complete a game to earn your first high score!";
    } else if (view === "howto") {
      message.textContent =
        "Find matching pairs before time runs out. Each incorrect match costs one heart. You have three hearts!";
    }

    const gameView = document.getElementById("game-view");

    if (gameView) {
      gameView.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  });
});

// ------------------------------------------
// INITIALIZE
// ------------------------------------------

updateDifficultyButtons();
startGame();
