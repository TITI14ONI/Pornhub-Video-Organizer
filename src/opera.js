import puppeteer from "puppeteer-core";

export function launchOpera({ executablePath, userDataDir }) {
    return puppeteer.launch({
        executablePath,
        headless: false,
        userDataDir,
        defaultViewport: null,
        ignoreDefaultArgs: [
            "--enable-automation",
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages"
        ],
        args: ["--no-first-run", "--no-default-browser-check"]
    });
}

export async function navigateOperaPage(page, url, timeout = 30000) {
    const expectedViewkey = new URL(url).searchParams.get("viewkey");
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        return { timedOut: false };
    } catch (error) {
        if (error.name !== "TimeoutError") throw error;

        let currentUrl;
        try {
            currentUrl = new URL(page.url());
        } catch {
            throw error;
        }
        if (!expectedViewkey || currentUrl.searchParams.get("viewkey") !== expectedViewkey) throw error;
        return { timedOut: true };
    }
}

export async function evaluateAfterNavigation(page, evaluate, attempts = 3) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await page.evaluate(evaluate);
        } catch (error) {
            const navigationInterrupted =
                /execution context was destroyed|cannot find context with specified id|most likely because of a navigation/i
                    .test(error.message);
            if (!navigationInterrupted || attempt === attempts) throw error;

            await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
    }
}
