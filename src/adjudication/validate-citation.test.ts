import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isValidCitation,
  unitFilesForAdjudication,
  unitFilesFromInputs,
  validateVerdict,
} from "./validate-citation.js";

describe("unitFilesForAdjudication", () => {
  it("drops addedRanges so pre-existing lines are citable", () => {
    const unit = unitFilesForAdjudication([
      {
        file: "src/a.ts",
        content: "line1\nline2\nline3",
        addedRanges: [{ start: 3, end: 3 }],
      },
    ]);
    const entry = unit.files.get("src/a.ts");
    assert.equal(entry?.lineCount, 3);
    assert.equal(entry?.addedRanges, undefined);
  });
});

describe("isValidCitation with addedRanges", () => {
  const scoped = unitFilesFromInputs([
    {
      file: "src/a.ts",
      content: "guard\ncomment\nflagged\n",
      addedRanges: [{ start: 3, end: 3 }],
    },
  ]);

  it("rejects pre-existing lines when addedRanges are present (detector-scoped unit)", () => {
    assert.equal(
      isValidCitation({ file: "src/a.ts", lineStart: 1, lineEnd: 1 }, scoped),
      false,
    );
  });

  it("accepts added lines when addedRanges are present", () => {
    assert.equal(
      isValidCitation({ file: "src/a.ts", lineStart: 3, lineEnd: 3 }, scoped),
      true,
    );
  });
});

describe("isValidCitation for adjudication unit", () => {
  const adjudicationUnit = unitFilesForAdjudication([
    {
      file: "src/user.ts",
      content: "export function userId(user: User | null) {\n  if (!user) throw new Error();\n  return user!.id;\n}\n",
      addedRanges: [{ start: 3, end: 3 }],
    },
  ]);

  it("accepts citation to pre-existing guard line", () => {
    assert.equal(
      isValidCitation({ file: "src/user.ts", lineStart: 2, lineEnd: 2 }, adjudicationUnit),
      true,
    );
  });

  it("accepts citation to added finding line", () => {
    assert.equal(
      isValidCitation({ file: "src/user.ts", lineStart: 3, lineEnd: 3 }, adjudicationUnit),
      true,
    );
  });
});

describe("validateVerdict reject with pre-existing citation", () => {
  it("passes when adjudication unit omits addedRanges", () => {
    const unit = unitFilesForAdjudication([
      {
        file: "src/user.ts",
        content: "export function userId(user: User | null) {\n  if (!user) throw new Error();\n  return user!.id;\n}\n",
        addedRanges: [{ start: 3, end: 3 }],
      },
    ]);
    const errors = validateVerdict(
      {
        outcome: "rejected",
        citations: [{ file: "src/user.ts", lineStart: 2, lineEnd: 2 }],
      },
      unit,
    );
    assert.deepEqual(errors, []);
  });

  it("fails when detector-scoped unit retains addedRanges", () => {
    const unit = unitFilesFromInputs([
      {
        file: "src/user.ts",
        content: "export function userId(user: User | null) {\n  if (!user) throw new Error();\n  return user!.id;\n}\n",
        addedRanges: [{ start: 3, end: 3 }],
      },
    ]);
    const errors = validateVerdict(
      {
        outcome: "rejected",
        citations: [{ file: "src/user.ts", lineStart: 2, lineEnd: 2 }],
      },
      unit,
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0]!.message, /invalid citation/);
  });
});
