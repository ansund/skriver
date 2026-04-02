import process from "node:process";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m"
};

export function createTerminalUi({ color = supportsColor() } = {}) {
  const paint = (text, code) => color ? `${code}${text}${ANSI.reset}` : text;

  return {
    bold: (text) => paint(text, ANSI.bold),
    dim: (text) => paint(text, ANSI.dim),
    green: (text) => paint(text, ANSI.green),
    yellow: (text) => paint(text, ANSI.yellow),
    red: (text) => paint(text, ANSI.red),
    cyan: (text) => paint(text, ANSI.cyan),
    statusPill(status) {
      switch (status) {
        case "ok":
          return paint("[ OK ]", `${ANSI.bold}${ANSI.green}`);
        case "warn":
          return paint("[WARN]", `${ANSI.bold}${ANSI.yellow}`);
        case "fail":
          return paint("[FAIL]", `${ANSI.bold}${ANSI.red}`);
        default:
          return paint("[....]", `${ANSI.bold}${ANSI.cyan}`);
      }
    },
    box(title, lines = []) {
      const content = [title, ...lines].filter((line) => line !== null && line !== undefined);
      const width = Math.max(...content.map((line) => visibleLength(line)), 24) + 4;
      const top = `+${"-".repeat(width - 2)}+`;
      const rendered = [top];

      for (const line of content) {
        rendered.push(`| ${padRight(line, width - 4)} |`);
      }

      rendered.push(top);
      return rendered.join("\n");
    }
  };
}

function supportsColor(stream = process.stdout) {
  return Boolean(stream?.isTTY) && !process.env.NO_COLOR;
}

function padRight(text, width) {
  const raw = `${text}`;
  const padding = Math.max(0, width - visibleLength(raw));
  return `${raw}${" ".repeat(padding)}`;
}

function visibleLength(text) {
  return `${text}`.replace(/\x1b\[[0-9;]*m/g, "").length;
}
