/**
 * Centralized proxy strategy used when a direct RSS request is blocked by CORS.
 *
 * The first request always targets the original URL directly. These proxy factories
 * are only used as fallback attempts and keep the fetch layer configurable.
 */
export const DEFAULT_PROXIES = [
	(url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
	(url) => `https://corsproxy.io/?${encodeURIComponent(url)}`
];

/**
 * Validates and normalizes user input into an absolute feed URL.
 *
 * Behaviour:
 * - trims whitespace
 * - auto-adds https:// if protocol is missing
 * - throws a localized error for empty or invalid input
 */
export function normalizeFeedUrl(rawUrl) {
	const candidate = (rawUrl || "").trim();
	if (!candidate) {
		throw new Error("Bitte eine Feed-URL eingeben.");
	}

	const withProtocol = /^https?:\/\//i.test(candidate)
		? candidate
		: `https://${candidate}`;

	try {
		return new URL(withProtocol).toString();
	} catch {
		throw new Error("Ungueltige URL. Beispiel: https://example.com/feed.xml");
	}
}

/**
 * Converts an HTML fragment to readable plain text.
 *
 * Many feeds place HTML markup in description/content fields. Parsing through a
 * temporary DOM node gives a predictable text output for rendering previews.
 */
function plainTextFromHtml(html) {
	const temp = document.createElement("div");
	temp.innerHTML = html || "";
	return (temp.textContent || "").trim();
}

/**
 * Checks if a value is a valid HTTP(S) URL.
 */
function isHttpUrl(value) {
	if (!value) return false;
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Produces a normalized URL string for loose equality checks.
 *
 * We remove hash fragments and trailing slashes to avoid false negatives when
 * comparing URLs that point to the same resource but use slightly different forms.
 */
function normalizeUrlForCompare(value) {
	if (!isHttpUrl(value)) return "";
	const parsed = new URL(value);
	parsed.hash = "";
	const normalizedPath = parsed.pathname.replace(/\/+$/, "");
	return `${parsed.origin}${normalizedPath}${parsed.search}`.toLowerCase();
}

/**
 * Detects whether a URL points to a Hacker News discussion page.
 */
function isHackerNewsCommentsUrl(value) {
	if (!isHttpUrl(value)) return false;
	const parsed = new URL(value);
	return parsed.hostname === "news.ycombinator.com" && parsed.pathname === "/item";
}

/**
 * Extracts the first http(s) URL from a text fragment.
 */
function extractFirstUrl(value) {
	const match = (value || "").match(/https?:\/\/[^\s<>")]+/i);
	return match ? match[0] : "";
}

/**
 * Returns true when a description is essentially only a reference URL.
 *
 * Some feeds (notably HN aggregations) put only a URL in the content field.
 * In that case we suppress the preview text and let the UI show a generic fallback.
 */
function isReferenceOnlyDescription(description, articleLink, commentsLink) {
	const compact = (description || "").trim().replace(/\s+/g, " ");
	if (!compact) return true;

	const withoutLabel = compact.replace(/^(article\s*)?(url|link|source|comments?)\s*:\s*/i, "");
	if (/^(https?:\/\/|www\.)\S+$/i.test(withoutLabel)) {
		return true;
	}

	const normalizedDescriptionUrl = normalizeUrlForCompare(extractFirstUrl(withoutLabel));
	const normalizedArticle = normalizeUrlForCompare(articleLink);
	const normalizedComments = normalizeUrlForCompare(commentsLink);

	if (
		normalizedDescriptionUrl &&
		(normalizedDescriptionUrl === normalizedArticle || normalizedDescriptionUrl === normalizedComments)
	) {
		return true;
	}

	return false;
}

/**
 * Attempts to discover a Hacker News comments URL from multiple RSS sources.
 */
function extractCommentsLink(itemNode, rawDescription, currentLink) {
	const candidates = [
		itemNode.querySelector("comments")?.textContent?.trim() || "",
		itemNode.querySelector('link[rel="replies"]')?.getAttribute("href") || "",
		currentLink
	];

	const fromDescription =
		rawDescription.match(/https?:\/\/news\.ycombinator\.com\/item\?id=\d+/i)?.[0] || "";
	if (fromDescription) {
		candidates.push(fromDescription);
	}

	return candidates.find((candidate) => isHackerNewsCommentsUrl(candidate)) || "";
}

/**
 * Reads a channel-level website URL from RSS or Atom metadata.
 */
function extractChannelLink(doc) {
	const rssLink = doc.querySelector("channel > link")?.textContent?.trim() || "";
	if (isHttpUrl(rssLink)) {
		return rssLink;
	}

	const atomLinks = [...doc.querySelectorAll("feed > link")];
	const preferredAtomLink = atomLinks.find((linkEl) => {
		const rel = (linkEl.getAttribute("rel") || "alternate").toLowerCase();
		const href = (linkEl.getAttribute("href") || "").trim();
		return rel === "alternate" && isHttpUrl(href);
	});

	if (preferredAtomLink) {
		return preferredAtomLink.getAttribute("href")?.trim() || "";
	}

	const fallbackAtomLink = atomLinks.find((linkEl) => {
		const href = (linkEl.getAttribute("href") || "").trim();
		return isHttpUrl(href);
	});

	return fallbackAtomLink?.getAttribute("href")?.trim() || "";
}

/**
 * Parses RSS or Atom XML into the UI-facing data structure.
 *
 * Output shape:
 * {
 *   channelTitle: string,
 *   channelDescription: string,
 *   items: Array<{ title, link, description, pubDate, mediaUrl }>
 * }
 */
export function parseFeed(xmlText) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xmlText, "application/xml");
	const parserError = doc.querySelector("parsererror");

	if (parserError) {
		throw new Error("Feed konnte nicht als XML gelesen werden.");
	}

	const channelTitle =
		doc.querySelector("channel > title")?.textContent?.trim() ||
		doc.querySelector("feed > title")?.textContent?.trim() ||
		"Unbenannter Feed";

	const channelDescription =
		doc.querySelector("channel > description")?.textContent?.trim() ||
		doc.querySelector("feed > subtitle")?.textContent?.trim() ||
		"";

	const channelLink = extractChannelLink(doc);

	const rssItems = [...doc.querySelectorAll("item")];
	const atomEntries = [...doc.querySelectorAll("entry")];
	const rawItems = rssItems.length ? rssItems : atomEntries;

	const items = rawItems
		.map((itemNode) => {
			const title = itemNode.querySelector("title")?.textContent?.trim() || "Ohne Titel";

			let link = itemNode.querySelector("link")?.textContent?.trim() || "";
			if (!link) {
				link =
					itemNode.querySelector("link")?.getAttribute("href") ||
					itemNode.querySelector("id")?.textContent?.trim() ||
					"";
			}

			const rawDescription =
				itemNode.querySelector("description")?.textContent ||
				itemNode.querySelector("content")?.textContent ||
				itemNode.querySelector("summary")?.textContent ||
				"";

			const plainDescription = plainTextFromHtml(rawDescription);
			const firstDescriptionUrl = extractFirstUrl(plainDescription);
			let commentsLink = extractCommentsLink(itemNode, rawDescription, link);

			// HN feeds can invert links: "link" points to discussion, while
			// description carries the outbound article URL.
			if (
				isHackerNewsCommentsUrl(link) &&
				isHttpUrl(firstDescriptionUrl) &&
				!isHackerNewsCommentsUrl(firstDescriptionUrl)
			) {
				commentsLink = link;
				link = firstDescriptionUrl;
			}

			const description = isReferenceOnlyDescription(plainDescription, link, commentsLink)
				? ""
				: plainDescription;

			const pubDate =
				itemNode.querySelector("pubDate")?.textContent ||
				itemNode.querySelector("published")?.textContent ||
				itemNode.querySelector("updated")?.textContent ||
				"";

			const mediaUrl =
				itemNode.querySelector("media\\:content")?.getAttribute("url") ||
				itemNode.querySelector("media\\:thumbnail")?.getAttribute("url") ||
				itemNode.querySelector("enclosure")?.getAttribute("url") ||
				"";

			return {
				title,
				link,
				description,
				pubDate,
				mediaUrl
			};
		})
		.filter((item) => item.link || item.title);

	return {
		channelTitle,
		channelDescription,
		channelLink,
		items
	};
}

/**
 * Fetches raw XML from the feed URL using direct request + proxy fallbacks.
 *
 * Throws a single error that combines a few unique failure reasons to make
 * troubleshooting easier in the UI.
 */
export async function fetchFeedXml(url, proxyFactories = DEFAULT_PROXIES) {
	const attempts = [url, ...proxyFactories.map((proxy) => proxy(url))];
	const attemptErrors = [];

	for (const attempt of attempts) {
		try {
			const response = await fetch(attempt, {
				headers: {
					Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml"
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const text = await response.text();
			if (!text.trim()) {
				throw new Error("Leere Antwort erhalten.");
			}

			return text;
		} catch (error) {
			attemptErrors.push(error?.message || "Unbekannter Fehler");
		}
	}

	const compactErrors = [...new Set(attemptErrors)].slice(0, 3).join(" | ");
	throw new Error(
		`Feed konnte nicht geladen werden. Details: ${compactErrors || "Keine Rueckmeldung vom Server."}`
	);
}

/**
 * High-level helper that performs network fetch + XML parsing in one call.
 */
export async function loadFeed(url, options = {}) {
	const xmlText = await fetchFeedXml(url, options.proxies || DEFAULT_PROXIES);
	return parseFeed(xmlText);
}
