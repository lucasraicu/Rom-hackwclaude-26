import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs/promises";
import { inspectDocument, MAX_FILE_BYTES } from "./documentPreview";

const csv = (content: string, filename = "records.csv") =>
  new File([content], filename, { type: "text/csv" });

test("previews quoted CSV cells without changing their contents", async () => {
  const result = await inspectDocument(
    csv(
      'vendor,amount,description\nBooks,12.50,"Books, pens"\nOther,4,"Two\nlines"',
    ),
  );
  assert.equal(result.kind, "Transactions");
  assert.equal(result.csv?.rowCount, 2);
  assert.equal(result.csv?.rows[0][2], "Books, pens");
  assert.equal(result.csv?.rows[1][2], "Two\nlines");
});

test("accepts UTF-8 BOM, alternate delimiters and uppercase extensions", async () => {
  const result = await inspectDocument(
    csv("\uFEFFemployee_id;hours\nE-01;96", "work.CSV"),
  );
  assert.deepEqual(result.csv?.headers, ["employee_id", "hours"]);
  assert.equal(result.kind, "Timesheet");
});

test("limits preview rows without losing the total record count", async () => {
  const result = await inspectDocument(
    csv(
      "name,amount\n" +
        Array.from({ length: 15 }, (_, index) => `Cost ${index},10`).join("\n"),
    ),
  );
  assert.equal(result.csv?.rows.length, 10);
  assert.equal(result.csv?.rowCount, 15);
});

test("keeps unknown CSV document types unclassified", async () => {
  assert.equal(
    (await inspectDocument(csv("note\nApproval pending"))).kind,
    "Unclassified",
  );
});

test("extracts actual PDF pages and rejects invalid PDF content", async () => {
  const result = await inspectDocument(
    new File(
      [await fs.readFile("data/inputs/grant-fed-agreement.pdf")],
      "grant.pdf",
    ),
  );
  assert.equal(result.format, "PDF");
  assert.equal(result.kind, "Unclassified");
  assert.equal(result.csv, undefined);
  assert.equal(result.pages?.length, 2);
  assert(result.pages?.join(" ").includes("literacy"));
  await assert.rejects(
    inspectDocument(new File(["not a pdf"], "fake.pdf")),
    /PDF header/,
  );
});

test("rejects empty, header-only and unsupported files", async () => {
  await assert.rejects(inspectDocument(csv("")), /empty/);
  await assert.rejects(inspectDocument(csv(" \n\t")), /no data/);
  await assert.rejects(inspectDocument(csv("a,b")), /at least one data record/);
  await assert.rejects(
    inspectDocument(csv("a,b\n1,2", "records.xlsx")),
    /Unsupported format/,
  );
});

test("rejects malformed quotes, uneven rows and invalid headers", async () => {
  await assert.rejects(
    inspectDocument(csv('a,b\n"unfinished,2')),
    /parsing failed/,
  );
  await assert.rejects(inspectDocument(csv("a,b\n1,2,3")), /3 columns/);
  await assert.rejects(inspectDocument(csv("a,\n1,2")), /empty column heading/);
  await assert.rejects(
    inspectDocument(csv("Name, name\n1,2")),
    /duplicate column headings/,
  );
});

test("rejects binary content and non-UTF-8 encodings", async () => {
  await assert.rejects(inspectDocument(csv("a,b\n\u0000,2")), /binary/);
  await assert.rejects(
    inspectDocument(
      new File([new Uint8Array([0xff, 0xfe, 0x61, 0])], "utf16.csv"),
    ),
    /UTF-8/,
  );
});

test("rejects oversized files before reading them", async () => {
  const file = csv("a,b\n1,2");
  Object.defineProperty(file, "size", { value: MAX_FILE_BYTES + 1 });
  file.arrayBuffer = () => {
    throw new Error("Should not read oversized input");
  };
  await assert.rejects(inspectDocument(file), /10 MB/);
});

test("rejects files exceeding the record limit", async () => {
  await assert.rejects(
    inspectDocument(csv("a,b\n" + "1,2\n".repeat(20001))),
    /20,000-record/,
  );
});
