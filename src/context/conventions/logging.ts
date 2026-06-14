import ts from "typescript";
import type { NeighborFile } from "../../types.js";

/**
 * How a file does its logging. The convention-drift detector compares a changed
 * file's style against the dominant style of its neighbors.
 *  - `structured`: uses a logger (pino/winston/etc. or a local `logger` module)
 *  - `console`:    uses `console.error`/`.warn`/`.info`/`.log`/`.debug`
 *  - `print`:      uses a bare `print(...)` call
 *  - `none`:       no logging signal — not evidence about logging convention
 */
export type LoggingStyle = "structured" | "console" | "print" | "none";

/** Console methods that count as "logging done via console". */
const CONSOLE_METHODS = new Set(["error", "warn", "info", "log", "debug"]);

/** Identifiers that, when the receiver of a call, signal a structured logger. */
const LOGGER_RECEIVERS = new Set(["logger", "log"]);

/** Well-known structured-logging packages. */
const LOGGER_MODULES = new Set([
  "pino",
  "winston",
  "bunyan",
  "loglevel",
  "structlog",
  "@logtail/node",
]);

/** A module specifier that *is* a logger module or a local `.../logger` module. */
function isLoggerModule(spec: string): boolean {
  if (LOGGER_MODULES.has(spec)) return true;
  return /(^|\/)logger$/.test(spec);
}

interface LoggingSignals {
  structured: boolean;
  console: boolean;
  print: boolean;
}

function collectSignals(sourceFile: ts.SourceFile): LoggingSignals {
  const signals: LoggingSignals = { structured: false, console: false, print: false };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (isLoggerModule(node.moduleSpecifier.text)) signals.structured = true;
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      // X.method(...) — console.* vs logger.* / log.*
      if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
        const recv = callee.expression.text;
        if (recv === "console" && CONSOLE_METHODS.has(callee.name.text)) {
          signals.console = true;
        } else if (LOGGER_RECEIVERS.has(recv)) {
          signals.structured = true;
        }
      }
      // bare print(...)
      if (ts.isIdentifier(callee) && callee.text === "print") {
        signals.print = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return signals;
}

/**
 * Classify a single file's logging style. Precedence is
 * `structured > console > print > none`: a file that touches the structured
 * logger at all is counted as following that convention, even if it also has a
 * stray console call.
 */
export function fileLoggingStyle(content: string, fileName = "file.ts"): LoggingStyle {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const s = collectSignals(sourceFile);
  if (s.structured) return "structured";
  if (s.console) return "console";
  if (s.print) return "print";
  return "none";
}

export interface LoggingProfile {
  /** The most common style among neighbors that log at all; `none` if no convention. */
  dominant: LoggingStyle;
  /** Fraction of logging neighbors that follow `dominant` (0..1). */
  adherenceRatio: number;
  /** Number of neighbors that log at all (the denominator for adherence). */
  relevant: number;
  /** Paths of the neighbors that follow `dominant` — the cited comparison set. */
  sampleFiles: string[];
}

/**
 * Minimum number of neighbors that actually log before we'll claim a logging
 * convention exists. Below this the repo simply isn't evidence either way.
 */
export const MIN_RELEVANT_NEIGHBORS = 3;

/**
 * Adherence required to treat the dominant style as *the* convention. Tuned for
 * near-zero false positives (Principle: detector asserts presence, ranking
 * judges severity) — a 0.6-0.8 low-confidence band is a deferred refinement.
 */
export const STRONG_ADHERENCE = 0.8;

/**
 * Build a logging profile from a set of neighbor files. Considers only files
 * that log at all (`style !== none`); among those, finds the most common style,
 * its adherence ratio, and the files exhibiting it. Ties on count are broken by
 * the precedence order `structured > console > print` so the result is
 * deterministic.
 */
export function loggingProfile(neighbors: NeighborFile[]): LoggingProfile {
  const PRECEDENCE: LoggingStyle[] = ["structured", "console", "print"];
  const byStyle = new Map<LoggingStyle, string[]>();
  let relevant = 0;

  for (const n of neighbors) {
    const style = fileLoggingStyle(n.content, n.path);
    if (style === "none") continue;
    relevant++;
    const list = byStyle.get(style) ?? [];
    list.push(n.path);
    byStyle.set(style, list);
  }

  let dominant: LoggingStyle = "none";
  let dominantCount = 0;
  for (const style of PRECEDENCE) {
    const count = byStyle.get(style)?.length ?? 0;
    if (count > dominantCount) {
      dominant = style;
      dominantCount = count;
    }
  }

  const sampleFiles = (dominant === "none" ? [] : (byStyle.get(dominant) ?? [])).slice().sort();
  const adherenceRatio = relevant === 0 ? 0 : dominantCount / relevant;

  return { dominant, adherenceRatio, relevant, sampleFiles };
}

/**
 * Does this profile constitute a strong-enough convention to flag drift against?
 * Requires enough logging neighbors and high adherence to the dominant style.
 */
export function isStrongConvention(profile: LoggingProfile): boolean {
  return (
    profile.relevant >= MIN_RELEVANT_NEIGHBORS &&
    profile.adherenceRatio >= STRONG_ADHERENCE &&
    profile.dominant !== "none"
  );
}
