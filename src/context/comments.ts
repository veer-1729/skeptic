import ts from "typescript";

export interface LineComment {
  /** The comment's source text, including the leading `//`. */
  text: string;
  /** 1-based line number where the comment starts. */
  line: number;
}

/**
 * Every single-line (`//`) comment in the file, with its 1-based line number.
 *
 * Uses the scanner with trivia preserved, so callers only ever match text
 * that is genuinely inside a comment — a `//` sequence inside a string literal
 * (e.g. a URL) or a regex is not a comment and is never returned. Block
 * comments are intentionally excluded; the rules that consume this
 * (TODO markers, commented-out-code) are line-comment concerns.
 */
export function getLineComments(sourceFile: ts.SourceFile): LineComment[] {
  const text = sourceFile.getFullText();
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    /* skipTrivia */ false,
    ts.LanguageVariant.Standard,
    text
  );
  const comments: LineComment[] = [];

  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (token === ts.SyntaxKind.SingleLineCommentTrivia) {
      const line = sourceFile.getLineAndCharacterOfPosition(scanner.getTokenPos()).line + 1;
      comments.push({ text: scanner.getTokenText(), line });
    }
    token = scanner.scan();
  }

  return comments;
}
