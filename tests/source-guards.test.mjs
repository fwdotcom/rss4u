import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, "..");
const scriptSource = fs.readFileSync(path.join(rootDir, "js", "index.js"), "utf8");
const rssSource = fs.readFileSync(path.join(rootDir, "js", "rss.js"), "utf8");

test("race-condition guard exists for feed loading", () => {
	assert.match(scriptSource, /let\s+latestFeedRequestId\s*=\s*0\s*;/, "missing request id state");
	assert.match(scriptSource, /const\s+requestId\s*=\s*\+\+latestFeedRequestId\s*;/, "missing request id increment");
	assert.match(scriptSource, /requestId\s*!==\s*latestFeedRequestId/, "missing stale request guard");
});

test("date localization uses locale file configuration", () => {
	assert.match(scriptSource, /function\s+getDateLocaleTag\s*\(/, "missing date locale resolver");
	assert.match(scriptSource, /formats\.dateLocale/, "script does not read formats.dateLocale");
	assert.match(scriptSource, /return\s+"en-US"\s*;/, "missing date locale fallback");
});

test("rss parser sanitizes non-http links and localizes untitled items", () => {
	assert.match(rssSource, /untitledItem\s*:\s*"/m, "missing untitledItem default message");
	assert.match(rssSource, /\|\|\s*rssMessages\.untitledItem\s*;/, "parser does not use localized untitled item fallback");
	assert.match(rssSource, /const\s+safeArticleLink\s*=\s*resolveHttpUrl\(link,\s*baseUrl\)\s*;/, "article link is not sanitized");
});

test("feed URL normalization allows only http(s) schemes", () => {
	assert.match(rssSource, /const\s+hasExplicitScheme\s*=\s*\/\^\[a-z\]\[a-z\\d\+\\-\.\]\*:/, "missing explicit scheme detection");
	assert.match(rssSource, /if\s*\(!isHttp\)/, "missing unsupported scheme rejection");
});

test("atom entry links prefer rel=alternate", () => {
	assert.match(rssSource, /function\s+extractEntryLink\s*\(/, "missing atom entry link helper");
	assert.match(rssSource, /rel\s*===\s*"alternate"/, "missing rel=alternate preference");
	assert.match(rssSource, /const\s+link\s*=\s*extractEntryLink\(itemNode\)\s*;/, "parser does not use atom link helper");
});
