import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, "..");
const localeDir = path.join(rootDir, "locales");
const localeFiles = ["en", "de", "fr", "es", "it", "pl", "cs", "nl"];

function readLocale(code) {
	const filePath = path.join(localeDir, `${code}.json`);
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getNestedValue(obj, dottedPath) {
	return dottedPath.split(".").reduce((value, key) => {
		if (value && typeof value === "object") {
			return value[key];
		}
		return undefined;
	}, obj);
}

test("all locale files are valid JSON", () => {
	for (const code of localeFiles) {
		assert.doesNotThrow(() => readLocale(code), `Locale ${code}.json is invalid JSON`);
	}
});

test("aria import/export keys are present in all locales", () => {
	for (const code of localeFiles) {
		const locale = readLocale(code);
		assert.equal(typeof getNestedValue(locale, "aria.importFavorites"), "string", `${code}: missing aria.importFavorites`);
		assert.equal(typeof getNestedValue(locale, "aria.exportFavorites"), "string", `${code}: missing aria.exportFavorites`);
		assert.equal(typeof getNestedValue(locale, "aria.favoritesActions"), "string", `${code}: missing aria.favoritesActions`);
	}
});

test("import/export status keys are present in all locales", () => {
	for (const code of localeFiles) {
		const locale = readLocale(code);
		assert.equal(typeof getNestedValue(locale, "status.favoritesExported"), "string", `${code}: missing status.favoritesExported`);
		assert.equal(typeof getNestedValue(locale, "status.favoritesImported"), "string", `${code}: missing status.favoritesImported`);
		assert.equal(typeof getNestedValue(locale, "status.importInvalidJson"), "string", `${code}: missing status.importInvalidJson`);
		assert.equal(typeof getNestedValue(locale, "status.importInvalidFormat"), "string", `${code}: missing status.importInvalidFormat`);
		assert.equal(typeof getNestedValue(locale, "status.importNoValidEntries"), "string", `${code}: missing status.importNoValidEntries`);
	}
});

test("untitled item RSS key is present in all locales", () => {
	for (const code of localeFiles) {
		const locale = readLocale(code);
		assert.equal(typeof getNestedValue(locale, "rss.untitledItem"), "string", `${code}: missing rss.untitledItem`);
	}
});

test("feed noArticleLink key is present in all locales", () => {
	for (const code of localeFiles) {
		const locale = readLocale(code);
		assert.equal(typeof getNestedValue(locale, "feed.noArticleLink"), "string", `${code}: missing feed.noArticleLink`);
	}
});
