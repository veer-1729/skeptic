import ts from "typescript";
import type { NeighborFile } from "../../types.js";
import {
  buildProfile,
  isStrongConvention as isStrongProfile,
  MIN_RELEVANT_NEIGHBORS,
  STRONG_ADHERENCE,
  type ConventionProfile,
} from "./profile.js";

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

export type LoggingProfile = ConventionProfile<LoggingStyle>;

export { MIN_RELEVANT_NEIGHBORS, STRONG_ADHERENCE };

const LOGGING_PRECEDENCE: LoggingStyle[] = ["structured", "console", "print"];

/** Build a logging profile from a set of neighbor files. */
export function loggingProfile(neighbors: NeighborFile[]): LoggingProfile {
  return buildProfile(neighbors, fileLoggingStyle, LOGGING_PRECEDENCE, "none");
}

/** Does this profile constitute a strong-enough logging convention to flag drift against? */
export function isStrongConvention(profile: LoggingProfile): boolean {
  return isStrongProfile(profile, "none");
}

/** Console methods convention-drift treats as drift when the repo logs via a structured logger. */
export const DRIFT_CONSOLE_METHODS = new Set(["error", "warn", "info"]);

/**
 * If `node` is a drift-worthy logging call, return a label for it
 * (`console.error` / `print`); otherwise undefined.
 */
export function driftCallMethod(node: ts.Node): string | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  const callee = node.expression;

  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    if (callee.expression.text === "console" && DRIFT_CONSOLE_METHODS.has(callee.name.text)) {
      return `console.${callee.name.text}`;
    }
  }
  if (ts.isIdentifier(callee) && callee.text === "print") {
    return "print";
  }
  return undefined;
}

/** Find all drift-worthy logging call sites in a file. */
export function findLoggingDriftSites(content: string, fileName: string): { line: number; label: string }[] {
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const sites: { line: number; label: string }[] = [];

  const visit = (node: ts.Node) => {
    const method = driftCallMethod(node);
    if (method) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      sites.push({ line: line + 1, label: method });
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sites;
}
