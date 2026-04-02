import process from "node:process";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

export function createProgressReporter({ enabled = true, stream = process.stderr } = {}) {
  if (!enabled) {
    return createNoopReporter();
  }

  let spinnerTimer = null;
  let stage = null;
  let stageStartedAt = 0;
  let frame = 0;

  function startStage(name, detail = "", estimate = null) {
    stopSpinner();
    stage = name;
    stageStartedAt = Date.now();
    frame = 0;
    const estimateText = estimate ? ` Estimated time: ${estimate}.` : "";
    stream.write(`\n${name}${detail ? `: ${detail}` : ""}.${estimateText}\n`);

    if (!stream.isTTY) {
      return;
    }

    spinnerTimer = setInterval(() => {
      const elapsed = formatElapsed(Date.now() - stageStartedAt);
      const prefix = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      frame += 1;
      stream.write(`\r${prefix} ${name}... ${elapsed}`);
    }, 125);
  }

  function info(message) {
    stopSpinner();
    stream.write(`${message}\n`);
  }

  function finishStage(message) {
    stopSpinner(true);
    if (message) {
      stream.write(`${message}\n`);
    }
  }

  function failStage(message) {
    stopSpinner(true);
    stream.write(`${message}\n`);
  }

  function stop() {
    stopSpinner(true);
  }

  function stopSpinner(clearLine = false) {
    if (spinnerTimer) {
      clearInterval(spinnerTimer);
      spinnerTimer = null;
    }

    if (stream.isTTY && clearLine && stage) {
      stream.write("\r\x1b[2K");
    }
  }

  return {
    startStage,
    info,
    finishStage,
    failStage,
    stop
  };
}

function createNoopReporter() {
  return {
    startStage() {},
    info() {},
    finishStage() {},
    failStage() {},
    stop() {}
  };
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${`${seconds}`.padStart(2, "0")}`;
}
