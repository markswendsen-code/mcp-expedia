/**
 * Strider Labs - Expedia Browser Automation
 *
 * Playwright-based browser automation for Expedia travel booking operations.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import {
  saveCookies,
  loadCookies,
  saveSessionInfo,
  type SessionInfo,
} from "./auth.js";

const EXPEDIA_BASE_URL = "https://www.expedia.com";
const DEFAULT_TIMEOUT = 30000;

// Singleton browser instance
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface FlightResult {
  id: string;
  airline: string;
  flightNumber?: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration?: string;
  stops?: number;
  stopCities?: string[];
  price?: string;
  pricePerPerson?: string;
  cabinClass?: string;
  url?: string;
}

export interface FlightDetails extends FlightResult {
  aircraft?: string;
  baggage?: string;
  refundable?: boolean;
  changeable?: boolean;
  amenities?: string[];
  layovers?: Array<{ city: string; duration: string }>;
}

export interface HotelResult {
  id: string;
  name: string;
  url?: string;
  starRating?: number;
  guestRating?: string;
  reviewCount?: number;
  location?: string;
  address?: string;
  pricePerNight?: string;
  totalPrice?: string;
  imageUrl?: string;
  freeCancellation?: boolean;
  breakfast?: boolean;
}

export interface HotelDetails extends HotelResult {
  description?: string;
  amenities?: string[];
  roomTypes?: Array<{ name: string; price: string; features: string[] }>;
  checkInTime?: string;
  checkOutTime?: string;
  policies?: string[];
  lat?: number;
  lng?: number;
}

export interface CarResult {
  id: string;
  carType: string;
  carModel?: string;
  vendor: string;
  seats?: number;
  bags?: number;
  transmission?: string;
  pricePerDay?: string;
  totalPrice?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  imageUrl?: string;
  url?: string;
  freeCancellation?: boolean;
}

export interface PackageResult {
  id: string;
  title: string;
  destination: string;
  duration?: string;
  price?: string;
  pricePerPerson?: string;
  includes?: string[];
  imageUrl?: string;
  url?: string;
  rating?: string;
}

export interface TripItem {
  type: "flight" | "hotel" | "car" | "package";
  id: string;
  title: string;
  price?: string;
  dates?: string;
  details?: string;
}

export interface SavedTrip {
  id: string;
  name: string;
  createdAt?: string;
  items?: TripItem[];
}

export interface Itinerary {
  confirmationNumber: string;
  status: string;
  items: Array<{
    type: string;
    title: string;
    dates: string;
    confirmationCode?: string;
    price?: string;
  }>;
  totalPrice?: string;
  travelerName?: string;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

async function randomDelay(min = 500, max = 2000): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Browser Lifecycle ────────────────────────────────────────────────────────

async function initBrowser(): Promise<{
  browser: Browser;
  context: BrowserContext;
  page: Page;
}> {
  if (browser && context && page) {
    return { browser, context, page };
  }

  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const cookiesLoaded = await loadCookies(context);
  if (cookiesLoaded) {
    console.error("Loaded saved Expedia cookies");
  }

  page = await context.newPage();

  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    // @ts-ignore
    window.chrome = { runtime: {} };
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
  });

  return { browser, context, page };
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await saveCookies(context);
  }
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function checkLoginStatus(): Promise<SessionInfo> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(EXPEDIA_BASE_URL, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    const captcha = await page.$(
      'iframe[src*="captcha"], [class*="captcha"], #captcha'
    );
    if (captcha) {
      return { isLoggedIn: false, lastUpdated: new Date().toISOString() };
    }

    // Expedia shows user greeting or Sign In button
    const userGreeting = await page.$(
      '[data-testid="header-account-menu-button"], [aria-label*="Account"], [class*="uitk-menu-trigger"]'
    );
    const signInButton = await page.$(
      'a[href*="signin"], button:has-text("Sign in"), [data-testid="header-signin-button"]'
    );

    const isLoggedIn = userGreeting !== null && signInButton === null;

    let userName: string | undefined;

    if (isLoggedIn && userGreeting) {
      try {
        const nameEl = await page.$(
          '[data-testid="header-account-name"], [class*="AccountName"]'
        );
        if (nameEl) {
          userName = (await nameEl.textContent()) || undefined;
        }
      } catch {
        // ignore
      }
    }

    const sessionInfo: SessionInfo = {
      isLoggedIn,
      userName: userName?.trim(),
      lastUpdated: new Date().toISOString(),
    };

    saveSessionInfo(sessionInfo);
    await saveCookies(context);

    return sessionInfo;
  } catch (error) {
    throw new Error(
      `Failed to check login status: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function initiateLogin(): Promise<{
  loginUrl: string;
  instructions: string;
}> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${EXPEDIA_BASE_URL}/user/signin`, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await saveCookies(context);

    return {
      loginUrl: `${EXPEDIA_BASE_URL}/user/signin`,
      instructions:
        "Please log in to Expedia manually:\n" +
        "1. Open the URL in your browser\n" +
        "2. Log in with your Expedia account (email/password, Google, Facebook, or Apple)\n" +
        "3. Complete any 2FA or verification steps\n" +
        "4. Once logged in, run 'status' to verify the session\n\n" +
        "Note: For headless operation, log in using a visible browser first — " +
        "session cookies will be saved for future use.",
    };
  } catch (error) {
    throw new Error(
      `Failed to initiate login: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Flights ──────────────────────────────────────────────────────────────────

export async function searchFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  cabinClass?: string;
  maxResults?: number;
}): Promise<FlightResult[]> {
  const { page, context } = await initBrowser();

  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults = 1,
      children = 0,
      cabinClass = "coach",
      maxResults = 10,
    } = params;

    const tripType = returnDate ? "roundtrip" : "oneway";
    const searchParams = new URLSearchParams({
      trip: tripType,
      leg1: `from:${origin},to:${destination},departure:${departureDate}TANYT`,
      passengers: `adults:${adults},children:${children}`,
      options: `cabinclass:${cabinClass}`,
      mode: "search",
    });
    if (returnDate) {
      searchParams.set(
        "leg2",
        `from:${destination},to:${origin},departure:${returnDate}TANYT`
      );
    }

    const searchUrl = `${EXPEDIA_BASE_URL}/Flights-Search?${searchParams.toString()}`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay(1000, 2000);

    const captcha = await page.$(
      'iframe[src*="captcha"], [class*="captcha"], #captcha'
    );
    if (captcha) {
      return [];
    }

    await page
      .waitForSelector(
        '[data-test-id="listing-container"], [class*="FlightCard"], [class*="flightCard"]',
        { timeout: 15000 }
      )
      .catch(() => {});

    await randomDelay();

    const flights = await page.evaluate(
      (max: number) => {
        const cards = document.querySelectorAll(
          '[data-test-id="listing-container"], [class*="FlightListing"], [class*="ResultsContainer"] > div'
        );

        const results: Array<{
          id: string;
          airline: string;
          flightNumber?: string;
          origin: string;
          destination: string;
          departureTime: string;
          arrivalTime: string;
          duration?: string;
          stops?: number;
          price?: string;
          pricePerPerson?: string;
          cabinClass?: string;
          url?: string;
        }> = [];

        cards.forEach((card, idx) => {
          if (idx >= max) return;

          const airlineEl = card.querySelector(
            '[class*="airline-name"], [class*="AirlineName"], [data-test-id="carrier-name"]'
          );
          const airline = airlineEl?.textContent?.trim() || "Unknown Airline";

          const flightNumEl = card.querySelector(
            '[class*="flight-number"], [data-test-id="flight-number"]'
          );
          const flightNumber = flightNumEl?.textContent?.trim() || undefined;

          const timeEls = card.querySelectorAll(
            '[class*="departure-time"], [class*="arrival-time"], [data-test-id*="time"]'
          );
          const departureTime =
            timeEls[0]?.textContent?.trim() || "Unknown";
          const arrivalTime = timeEls[1]?.textContent?.trim() || "Unknown";

          const durationEl = card.querySelector(
            '[class*="duration"], [data-test-id="duration"]'
          );
          const duration = durationEl?.textContent?.trim() || undefined;

          const stopsEl = card.querySelector(
            '[class*="stop-count"], [data-test-id="stops-count"], [class*="stops"]'
          );
          const stopsText = stopsEl?.textContent?.trim() || "";
          const stopsMatch = stopsText.match(/(\d+)\s*stop/i);
          const stops = stopsMatch
            ? parseInt(stopsMatch[1])
            : stopsText.toLowerCase().includes("nonstop")
            ? 0
            : undefined;

          const priceEl = card.querySelector(
            '[class*="price-text"], [data-test-id="price-text"], [class*="Price"]'
          );
          const priceText = priceEl?.textContent?.trim() || "";
          const priceMatch = priceText.match(/\$[\d,]+/);
          const price = priceMatch ? priceMatch[0] : undefined;

          const linkEl = card.querySelector("a[href*='Flights']");
          const href = linkEl?.getAttribute("href") || "";
          const url = href.startsWith("http")
            ? href
            : href
            ? `https://www.expedia.com${href}`
            : undefined;

          results.push({
            id: String(idx),
            airline,
            flightNumber,
            origin: "",
            destination: "",
            departureTime,
            arrivalTime,
            duration,
            stops,
            price,
            url,
          });
        });

        return results;
      },
      Math.min(maxResults, 50)
    );

    // Annotate origin/destination from params
    const annotated = flights.map((f) => ({
      ...f,
      origin,
      destination,
    }));

    await saveCookies(context);
    return annotated;
  } catch (error) {
    throw new Error(
      `Failed to search flights: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function getFlightDetails(
  flightId: string
): Promise<FlightDetails> {
  const { page, context } = await initBrowser();

  try {
    // Navigate to flight details — Expedia uses a session-based URL, so we
    // reload the search page or use the stored URL if available.
    await page.goto(EXPEDIA_BASE_URL, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    const details = await page.evaluate(
      (id: string) => {
        // Attempt to locate a flight card by index identifier
        const cards = document.querySelectorAll(
          '[data-test-id="listing-container"], [class*="FlightListing"]'
        );
        const card = cards[parseInt(id)] || cards[0];
        if (!card) return null;

        const airlineEl = card.querySelector('[class*="airline-name"]');
        const airline = airlineEl?.textContent?.trim() || "Unknown Airline";

        const timeEls = card.querySelectorAll('[class*="time"]');
        const departureTime = timeEls[0]?.textContent?.trim() || "Unknown";
        const arrivalTime = timeEls[1]?.textContent?.trim() || "Unknown";

        const durationEl = card.querySelector('[class*="duration"]');
        const duration = durationEl?.textContent?.trim() || undefined;

        const priceEl = card.querySelector('[class*="price-text"]');
        const priceText = priceEl?.textContent?.trim() || "";
        const priceMatch = priceText.match(/\$[\d,]+/);
        const price = priceMatch ? priceMatch[0] : undefined;

        return {
          id,
          airline,
          origin: "",
          destination: "",
          departureTime,
          arrivalTime,
          duration,
          price,
        };
      },
      flightId
    );

    await saveCookies(context);

    return (
      details || {
        id: flightId,
        airline: "Unknown",
        origin: "",
        destination: "",
        departureTime: "Unknown",
        arrivalTime: "Unknown",
      }
    );
  } catch (error) {
    throw new Error(
      `Failed to get flight details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Hotels ───────────────────────────────────────────────────────────────────

export async function searchHotels(params: {
  destination: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  rooms?: number;
  maxResults?: number;
}): Promise<HotelResult[]> {
  const { page, context } = await initBrowser();

  try {
    const {
      destination,
      checkIn,
      checkOut,
      adults = 1,
      rooms = 1,
      maxResults = 10,
    } = params;

    const searchParams = new URLSearchParams({
      destination,
      startDate: checkIn,
      endDate: checkOut,
      adults: String(adults),
      rooms: String(rooms),
    });

    const searchUrl = `${EXPEDIA_BASE_URL}/Hotel-Search?${searchParams.toString()}`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay(1000, 2000);

    const captcha = await page.$(
      'iframe[src*="captcha"], [class*="captcha"], #captcha'
    );
    if (captcha) {
      return [];
    }

    await page
      .waitForSelector(
        '[data-stid="property-listing"], [class*="HotelCard"], [class*="hotelCard"]',
        { timeout: 15000 }
      )
      .catch(() => {});

    await randomDelay();

    const hotels = await page.evaluate(
      (max: number) => {
        const cards = document.querySelectorAll(
          '[data-stid="property-listing"], [class*="PropertyCard"], section[class*="hotel"]'
        );

        const results: Array<{
          id: string;
          name: string;
          url?: string;
          starRating?: number;
          guestRating?: string;
          reviewCount?: number;
          location?: string;
          pricePerNight?: string;
          totalPrice?: string;
          imageUrl?: string;
          freeCancellation?: boolean;
        }> = [];

        cards.forEach((card, idx) => {
          if (idx >= max) return;

          const nameEl = card.querySelector(
            '[data-stid="content-hotel-title"], [class*="hotel-name"], h3'
          );
          const name = nameEl?.textContent?.trim() || "Hotel";

          const linkEl = card.querySelector(
            "a[href*='/Hotel-Search/'], a[href*='/h/'], a[data-stid*='open-hotel-information']"
          );
          const href = linkEl?.getAttribute("href") || "";
          const url = href.startsWith("http")
            ? href
            : href
            ? `https://www.expedia.com${href}`
            : undefined;
          const idMatch = href.match(/\/h\/([^/?]+)/);

          const ratingEl = card.querySelector(
            '[class*="star-rating"], [aria-label*="star"]'
          );
          const ratingText =
            ratingEl?.getAttribute("aria-label") ||
            ratingEl?.textContent ||
            "";
          const starMatch = ratingText.match(/(\d+(?:\.\d+)?)\s*star/i);
          const starRating = starMatch ? parseFloat(starMatch[1]) : undefined;

          const guestRatingEl = card.querySelector(
            '[data-stid="content-hotel-rating-score"], [class*="guest-rating"], [class*="score"]'
          );
          const guestRating =
            guestRatingEl?.textContent?.trim() || undefined;

          const reviewEl = card.querySelector(
            '[class*="review-count"], [data-stid="content-hotel-reviews-count"]'
          );
          const reviewText = reviewEl?.textContent?.trim() || "";
          const reviewMatch = reviewText.match(/(\d[\d,]*)/);
          const reviewCount = reviewMatch
            ? parseInt(reviewMatch[1].replace(",", ""))
            : undefined;

          const locationEl = card.querySelector(
            '[data-stid="content-hotel-neighborhood"], [class*="neighborhood"]'
          );
          const location = locationEl?.textContent?.trim() || undefined;

          const priceEl = card.querySelector(
            '[data-stid="content-hotel-lead-price-formatted"], [class*="price-summary"], [class*="rate"]'
          );
          const priceText = priceEl?.textContent?.trim() || "";
          const priceMatch = priceText.match(/\$[\d,]+/);
          const pricePerNight = priceMatch ? priceMatch[0] : undefined;

          const imageEl = card.querySelector("img");
          const imageUrl = imageEl?.src || undefined;

          const freeCancelEl = card.querySelector(
            '[class*="free-cancellation"], [data-stid*="free-cancel"]'
          );
          const freeCancellation = freeCancelEl !== null;

          results.push({
            id: idMatch ? idMatch[1] : String(idx),
            name,
            url,
            starRating,
            guestRating,
            reviewCount,
            location,
            pricePerNight,
            imageUrl,
            freeCancellation,
          });
        });

        return results;
      },
      Math.min(maxResults, 50)
    );

    await saveCookies(context);
    return hotels;
  } catch (error) {
    throw new Error(
      `Failed to search hotels: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function getHotelDetails(
  hotelIdOrUrl: string
): Promise<HotelDetails> {
  const { page, context } = await initBrowser();

  try {
    let url: string;
    if (hotelIdOrUrl.startsWith("http")) {
      url = hotelIdOrUrl;
    } else {
      url = `${EXPEDIA_BASE_URL}/h/${hotelIdOrUrl}`;
    }

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    const captcha = await page.$('iframe[src*="captcha"], #captcha');
    if (captcha) {
      throw new Error("CAPTCHA detected. Please complete it manually.");
    }

    const details = await page.evaluate(() => {
      const nameEl = document.querySelector(
        'h1, [data-stid="content-hotel-title"]'
      );
      const name = nameEl?.textContent?.trim() || "Hotel";

      const ratingEl = document.querySelector(
        '[class*="star-rating"], [aria-label*="star"]'
      );
      const ratingText =
        ratingEl?.getAttribute("aria-label") || ratingEl?.textContent || "";
      const starMatch = ratingText.match(/(\d+(?:\.\d+)?)\s*star/i);
      const starRating = starMatch ? parseFloat(starMatch[1]) : undefined;

      const guestRatingEl = document.querySelector(
        '[data-stid="content-hotel-rating-score"], [class*="guest-rating"]'
      );
      const guestRating = guestRatingEl?.textContent?.trim() || undefined;

      const reviewEl = document.querySelector(
        '[class*="review-count"], [data-stid="content-hotel-reviews-count"]'
      );
      const reviewText = reviewEl?.textContent?.trim() || "";
      const reviewMatch = reviewText.match(/(\d[\d,]*)/);
      const reviewCount = reviewMatch
        ? parseInt(reviewMatch[1].replace(",", ""))
        : undefined;

      const locationEl = document.querySelector(
        '[data-stid="content-hotel-address"], [class*="address"], [itemprop="address"]'
      );
      const address = locationEl?.textContent?.trim() || undefined;

      const priceEl = document.querySelector(
        '[data-stid="content-hotel-lead-price-formatted"], [class*="price"]'
      );
      const priceText = priceEl?.textContent?.trim() || "";
      const priceMatch = priceText.match(/\$[\d,]+/);
      const pricePerNight = priceMatch ? priceMatch[0] : undefined;

      const imageEl = document.querySelector(
        '[class*="gallery"] img, [class*="hero"] img'
      ) as HTMLImageElement | null;
      const imageUrl = imageEl?.src || undefined;

      const descEl = document.querySelector(
        '[class*="description"], [data-stid="content-hotel-about"]'
      );
      const description =
        descEl?.textContent?.trim().slice(0, 500) || undefined;

      const amenityEls = document.querySelectorAll(
        '[class*="amenity"], [data-stid*="amenity"] li'
      );
      const amenities: string[] = [];
      amenityEls.forEach((el) => {
        const text = el.textContent?.trim();
        if (text) amenities.push(text);
      });

      const checkInEl = document.querySelector(
        '[data-stid*="check-in"], [class*="check-in"]'
      );
      const checkOutEl = document.querySelector(
        '[data-stid*="check-out"], [class*="check-out"]'
      );

      const idMatch = window.location.pathname.match(/\/h\/([^/?]+)/);

      return {
        id: idMatch ? idMatch[1] : "",
        name,
        url: window.location.href,
        starRating,
        guestRating,
        reviewCount,
        address,
        pricePerNight,
        imageUrl,
        description,
        amenities: amenities.slice(0, 20),
        checkInTime: checkInEl?.textContent?.trim() || undefined,
        checkOutTime: checkOutEl?.textContent?.trim() || undefined,
      };
    });

    await saveCookies(context);
    return details;
  } catch (error) {
    throw new Error(
      `Failed to get hotel details: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Cars ─────────────────────────────────────────────────────────────────────

export async function searchCars(params: {
  pickupLocation: string;
  pickupDate: string;
  pickupTime?: string;
  dropoffDate: string;
  dropoffTime?: string;
  dropoffLocation?: string;
  maxResults?: number;
}): Promise<CarResult[]> {
  const { page, context } = await initBrowser();

  try {
    const {
      pickupLocation,
      pickupDate,
      pickupTime = "10:00AM",
      dropoffDate,
      dropoffTime = "10:00AM",
      dropoffLocation,
      maxResults = 10,
    } = params;

    const searchParams = new URLSearchParams({
      locn: pickupLocation,
      date1: pickupDate,
      time1: pickupTime,
      date2: dropoffDate,
      time2: dropoffTime,
    });
    if (dropoffLocation) {
      searchParams.set("locn2", dropoffLocation);
    }

    const searchUrl = `${EXPEDIA_BASE_URL}/carsearch?${searchParams.toString()}`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay(1000, 2000);

    const captcha = await page.$(
      'iframe[src*="captcha"], [class*="captcha"], #captcha'
    );
    if (captcha) {
      return [];
    }

    await page
      .waitForSelector('[class*="CarCard"], [class*="car-card"], [data-test-id*="car"]', {
        timeout: 15000,
      })
      .catch(() => {});

    await randomDelay();

    const cars = await page.evaluate(
      (max: number) => {
        const cards = document.querySelectorAll(
          '[class*="CarCard"], [class*="car-listing"], [data-test-id*="car-card"]'
        );

        const results: Array<{
          id: string;
          carType: string;
          carModel?: string;
          vendor: string;
          seats?: number;
          bags?: number;
          transmission?: string;
          pricePerDay?: string;
          totalPrice?: string;
          imageUrl?: string;
          freeCancellation?: boolean;
        }> = [];

        cards.forEach((card, idx) => {
          if (idx >= max) return;

          const typeEl = card.querySelector(
            '[class*="car-type"], [class*="vehicle-class"], h3'
          );
          const carType = typeEl?.textContent?.trim() || "Car";

          const modelEl = card.querySelector(
            '[class*="car-model"], [class*="vehicle-name"]'
          );
          const carModel = modelEl?.textContent?.trim() || undefined;

          const vendorEl = card.querySelector(
            '[class*="vendor-name"], [class*="supplier"], img[alt]'
          );
          const vendor =
            vendorEl?.textContent?.trim() ||
            vendorEl?.getAttribute("alt") ||
            "Unknown Vendor";

          const priceEl = card.querySelector(
            '[class*="price-text"], [class*="total-price"], [data-test-id*="price"]'
          );
          const priceText = priceEl?.textContent?.trim() || "";
          const priceMatch = priceText.match(/\$[\d,]+(?:\.\d{2})?/);
          const pricePerDay = priceMatch ? priceMatch[0] : undefined;

          const imageEl = card.querySelector("img");
          const imageUrl = imageEl?.src || undefined;

          const freeCancelEl = card.querySelector(
            '[class*="free-cancel"], [class*="cancellation"]'
          );
          const freeCancellation =
            freeCancelEl !== null &&
            freeCancelEl.textContent?.toLowerCase().includes("free") === true;

          const seatsEl = card.querySelector(
            '[class*="seats"], [class*="passenger"]'
          );
          const seatsText = seatsEl?.textContent?.trim() || "";
          const seatsMatch = seatsText.match(/(\d+)/);
          const seats = seatsMatch ? parseInt(seatsMatch[1]) : undefined;

          const transEl = card.querySelector('[class*="transmission"]');
          const transmission = transEl?.textContent?.trim() || undefined;

          results.push({
            id: String(idx),
            carType,
            carModel,
            vendor,
            seats,
            transmission,
            pricePerDay,
            imageUrl,
            freeCancellation,
          });
        });

        return results;
      },
      Math.min(maxResults, 50)
    );

    await saveCookies(context);
    return cars;
  } catch (error) {
    throw new Error(
      `Failed to search cars: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Packages ─────────────────────────────────────────────────────────────────

export async function searchPackages(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  maxResults?: number;
}): Promise<PackageResult[]> {
  const { page, context } = await initBrowser();

  try {
    const {
      origin,
      destination,
      departureDate,
      returnDate,
      adults = 2,
      children = 0,
      maxResults = 10,
    } = params;

    const searchParams = new URLSearchParams({
      packageType: "fh",
      trip: "roundtrip",
      leg1: `from:${origin},to:${destination},departure:${departureDate}TANYT`,
      passengers: `adults:${adults},children:${children}`,
      startDate: departureDate,
      endDate: returnDate || "",
      rooms: "1",
    });

    const searchUrl = `${EXPEDIA_BASE_URL}/Vacations?${searchParams.toString()}`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay(1000, 2000);

    const captcha = await page.$(
      'iframe[src*="captcha"], [class*="captcha"], #captcha'
    );
    if (captcha) {
      return [];
    }

    await page
      .waitForSelector(
        '[class*="PackageCard"], [class*="package-card"], [data-test-id*="package"]',
        { timeout: 15000 }
      )
      .catch(() => {});

    await randomDelay();

    const packages = await page.evaluate(
      (max: number) => {
        const cards = document.querySelectorAll(
          '[class*="PackageCard"], [class*="package-listing"], article[class*="result"]'
        );

        const results: Array<{
          id: string;
          title: string;
          destination: string;
          duration?: string;
          price?: string;
          pricePerPerson?: string;
          includes?: string[];
          imageUrl?: string;
          url?: string;
          rating?: string;
        }> = [];

        cards.forEach((card, idx) => {
          if (idx >= max) return;

          const titleEl = card.querySelector(
            "[class*='title'], [class*='name'], h3, h2"
          );
          const title = titleEl?.textContent?.trim() || "Vacation Package";

          const durationEl = card.querySelector(
            '[class*="duration"], [class*="nights"]'
          );
          const duration = durationEl?.textContent?.trim() || undefined;

          const priceEl = card.querySelector(
            '[class*="price"], [data-test-id*="price"]'
          );
          const priceText = priceEl?.textContent?.trim() || "";
          const priceMatch = priceText.match(/\$[\d,]+/);
          const price = priceMatch ? priceMatch[0] : undefined;

          const imageEl = card.querySelector("img");
          const imageUrl = imageEl?.src || undefined;

          const linkEl = card.querySelector("a");
          const href = linkEl?.getAttribute("href") || "";
          const url = href.startsWith("http")
            ? href
            : href
            ? `https://www.expedia.com${href}`
            : undefined;

          const includesEls = card.querySelectorAll(
            '[class*="amenity"], [class*="includes"] li, [class*="feature"] li'
          );
          const includes: string[] = [];
          includesEls.forEach((el) => {
            const text = el.textContent?.trim();
            if (text) includes.push(text);
          });

          results.push({
            id: String(idx),
            title,
            destination: "",
            duration,
            price,
            includes: includes.slice(0, 5),
            imageUrl,
            url,
          });
        });

        return results;
      },
      Math.min(maxResults, 50)
    );

    const annotated = packages.map((p) => ({ ...p, destination }));

    await saveCookies(context);
    return annotated;
  } catch (error) {
    throw new Error(
      `Failed to search packages: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Trip Management ──────────────────────────────────────────────────────────

export async function addToTrip(params: {
  itemType: "flight" | "hotel" | "car" | "package";
  itemUrl: string;
  tripName?: string;
}): Promise<{ success: boolean; message: string }> {
  const { page, context } = await initBrowser();

  try {
    const { itemUrl, tripName } = params;

    await page.goto(itemUrl, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    if (page.url().includes("/signin")) {
      throw new Error("Login required. Use login to authenticate.");
    }

    // Try to find a Save or Add to Trip button
    const saveButton = await page.$(
      'button[aria-label*="Save"], button:has-text("Save to trip"), [data-stid*="save"], [class*="save-trip"]'
    );

    if (!saveButton) {
      return {
        success: false,
        message:
          "Could not find a Save to Trip button on this page. The item may not support this feature directly, or you need to be on the specific listing page.",
      };
    }

    await saveButton.click();
    await randomDelay(500, 1000);

    if (tripName) {
      const nameInput = await page
        .$(
          'input[placeholder*="trip"], input[aria-label*="trip name"], [data-stid*="trip-name"]'
        )
        .catch(() => null);
      if (nameInput) {
        await nameInput.fill(tripName);
        await randomDelay(200, 400);
        const saveBtn = await page
          .$('button:has-text("Save"), [data-stid*="save-trip"]')
          .catch(() => null);
        if (saveBtn) await saveBtn.click();
      }
    }

    await saveCookies(context);

    return {
      success: true,
      message: `Item added to trip${tripName ? ` "${tripName}"` : ""}`,
    };
  } catch (error) {
    throw new Error(
      `Failed to add to trip: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function viewTrip(): Promise<{
  items: TripItem[];
  totalPrice?: string;
}> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${EXPEDIA_BASE_URL}/trips`, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    if (page.url().includes("/signin")) {
      throw new Error("Login required. Use login to authenticate.");
    }

    const captcha = await page.$('iframe[src*="captcha"], #captcha');
    if (captcha) {
      throw new Error("CAPTCHA detected. Please complete it manually.");
    }

    const tripData = await page.evaluate(() => {
      const itemEls = document.querySelectorAll(
        '[class*="TripItem"], [data-stid*="trip-item"], [class*="cart-item"]'
      );
      const items: Array<{
        type: string;
        id: string;
        title: string;
        price?: string;
        dates?: string;
        details?: string;
      }> = [];

      itemEls.forEach((el, idx) => {
        const titleEl = el.querySelector("[class*='title'], h3, h2");
        const title = titleEl?.textContent?.trim() || "Trip Item";

        const priceEl = el.querySelector("[class*='price']");
        const priceText = priceEl?.textContent?.trim() || "";
        const priceMatch = priceText.match(/\$[\d,]+/);
        const price = priceMatch ? priceMatch[0] : undefined;

        const dateEl = el.querySelector("[class*='date'], [class*='dates']");
        const dates = dateEl?.textContent?.trim() || undefined;

        // Determine type from icon or class
        const classes = el.className.toLowerCase();
        const type = classes.includes("flight")
          ? "flight"
          : classes.includes("hotel")
          ? "hotel"
          : classes.includes("car")
          ? "car"
          : "package";

        items.push({ type, id: String(idx), title, price, dates });
      });

      const totalEl = document.querySelector(
        '[class*="total-price"], [data-stid*="total"]'
      );
      const totalText = totalEl?.textContent?.trim() || "";
      const totalMatch = totalText.match(/\$[\d,]+/);
      const totalPrice = totalMatch ? totalMatch[0] : undefined;

      return { items, totalPrice };
    });

    await saveCookies(context);
    return tripData as { items: TripItem[]; totalPrice?: string };
  } catch (error) {
    throw new Error(
      `Failed to view trip: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function getSavedTrips(): Promise<SavedTrip[]> {
  const { page, context } = await initBrowser();

  try {
    await page.goto(`${EXPEDIA_BASE_URL}/trips`, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    if (page.url().includes("/signin")) {
      throw new Error("Login required. Use login to authenticate.");
    }

    const captcha = await page.$('iframe[src*="captcha"], #captcha');
    if (captcha) {
      throw new Error("CAPTCHA detected. Please complete it manually.");
    }

    const trips = await page.evaluate(() => {
      const cards = document.querySelectorAll(
        '[class*="TripCard"], [data-stid*="trip-card"], [class*="saved-trip"]'
      );
      const results: Array<{
        id: string;
        name: string;
        createdAt?: string;
      }> = [];

      cards.forEach((card, idx) => {
        const nameEl = card.querySelector(
          "[class*='title'], [class*='name'], h3"
        );
        const name = nameEl?.textContent?.trim() || `Trip ${idx + 1}`;

        const dateEl = card.querySelector(
          "[class*='date'], [class*='created']"
        );
        const createdAt = dateEl?.textContent?.trim() || undefined;

        const linkEl = card.querySelector("a");
        const href = linkEl?.getAttribute("href") || "";
        const idMatch = href.match(/\/trips\/([^/?]+)/);

        results.push({
          id: idMatch ? idMatch[1] : String(idx),
          name,
          createdAt,
        });
      });

      return results;
    });

    await saveCookies(context);
    return trips;
  } catch (error) {
    throw new Error(
      `Failed to get saved trips: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Checkout ─────────────────────────────────────────────────────────────────

export async function checkout(params: {
  confirm?: boolean;
}): Promise<
  | { requiresConfirmation: true; preview: object }
  | { success: true; confirmationNumber: string; message: string }
> {
  const { confirm = false } = params;

  if (!confirm) {
    const trip = await viewTrip();
    return {
      requiresConfirmation: true,
      preview: {
        ...trip,
        message:
          "Checkout not initiated. Call checkout with confirm=true to proceed.",
      },
    };
  }

  const { page, context } = await initBrowser();

  try {
    await page.goto(`${EXPEDIA_BASE_URL}/trips`, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    if (page.url().includes("/signin")) {
      throw new Error("Login required. Use login to authenticate.");
    }

    // Click checkout button
    const checkoutButton = await page.$(
      'button:has-text("Checkout"), button:has-text("Book"), [data-stid*="checkout"], a:has-text("Checkout")'
    );

    if (!checkoutButton) {
      throw new Error(
        "Could not find Checkout button. Ensure you have items in your trip and are logged in."
      );
    }

    await checkoutButton.click();
    await randomDelay(1000, 2000);

    await page
      .waitForURL(/\/checkout|\/book\//, { timeout: 15000 })
      .catch(() => {});

    await randomDelay(1000, 2000);

    // Click complete booking
    const completeButton = await page.$(
      'button:has-text("Complete booking"), button:has-text("Confirm"), [data-stid*="complete-booking"]'
    );

    if (!completeButton) {
      throw new Error(
        "Reached checkout page but could not find Complete booking button. Manual completion may be needed."
      );
    }

    await completeButton.click();
    await randomDelay(2000, 4000);

    await page
      .waitForURL(/\/itinerary|\/confirmation|\/booking\//, { timeout: 30000 })
      .catch(() => {});

    const confirmationNumber = await page.evaluate(() => {
      const el = document.querySelector(
        "[data-stid*='confirmation'], [class*='confirmationNumber'], [class*='itinerary-number']"
      );
      return el?.textContent?.trim() || null;
    });

    await saveCookies(context);

    return {
      success: true,
      confirmationNumber:
        confirmationNumber || "See your email for confirmation",
      message: `Booking confirmed. Itinerary number: ${confirmationNumber || "Check your email"}`,
    };
  } catch (error) {
    throw new Error(
      `Failed to checkout: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Itinerary ────────────────────────────────────────────────────────────────

export async function getItinerary(
  itineraryNumber?: string
): Promise<Itinerary[]> {
  const { page, context } = await initBrowser();

  try {
    const url = itineraryNumber
      ? `${EXPEDIA_BASE_URL}/trips/${itineraryNumber}`
      : `${EXPEDIA_BASE_URL}/trips`;

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay();

    if (page.url().includes("/signin")) {
      throw new Error("Login required. Use login to authenticate.");
    }

    const captcha = await page.$('iframe[src*="captcha"], #captcha');
    if (captcha) {
      throw new Error("CAPTCHA detected. Please complete it manually.");
    }

    const itineraries = await page.evaluate(() => {
      // On the trips page, each trip is a card
      const cards = document.querySelectorAll(
        '[class*="ItineraryCard"], [data-stid*="itinerary"], [class*="booking-card"]'
      );
      const results: Array<{
        confirmationNumber: string;
        status: string;
        items: Array<{
          type: string;
          title: string;
          dates: string;
          confirmationCode?: string;
          price?: string;
        }>;
        totalPrice?: string;
        travelerName?: string;
      }> = [];

      cards.forEach((card, idx) => {
        const confEl = card.querySelector(
          "[class*='confirmation'], [data-stid*='confirmation-number']"
        );
        const confirmationNumber =
          confEl?.textContent?.trim() || `TRIP-${idx + 1}`;

        const statusEl = card.querySelector(
          "[class*='status'], [data-stid*='status']"
        );
        const status = statusEl?.textContent?.trim() || "Confirmed";

        const priceEl = card.querySelector("[class*='total'], [class*='price']");
        const priceText = priceEl?.textContent?.trim() || "";
        const priceMatch = priceText.match(/\$[\d,]+/);
        const totalPrice = priceMatch ? priceMatch[0] : undefined;

        const nameEl = card.querySelector(
          "[class*='traveler'], [class*='guest-name']"
        );
        const travelerName = nameEl?.textContent?.trim() || undefined;

        const itemEls = card.querySelectorAll(
          "[class*='item'], [data-stid*='item']"
        );
        const items: Array<{
          type: string;
          title: string;
          dates: string;
          price?: string;
        }> = [];

        itemEls.forEach((item) => {
          const titleEl = item.querySelector("[class*='title'], h3, h4");
          const dateEl = item.querySelector("[class*='date']");
          const priceEl2 = item.querySelector("[class*='price']");
          const classes = item.className.toLowerCase();

          items.push({
            type: classes.includes("flight")
              ? "flight"
              : classes.includes("hotel")
              ? "hotel"
              : classes.includes("car")
              ? "car"
              : "package",
            title: titleEl?.textContent?.trim() || "Item",
            dates: dateEl?.textContent?.trim() || "",
            price: priceEl2?.textContent?.match(/\$[\d,]+/)?.[0] || undefined,
          });
        });

        results.push({
          confirmationNumber,
          status,
          items,
          totalPrice,
          travelerName,
        });
      });

      return results;
    });

    await saveCookies(context);
    return itineraries;
  } catch (error) {
    throw new Error(
      `Failed to get itinerary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

// ─── Process Cleanup ──────────────────────────────────────────────────────────

process.on("exit", () => {
  if (browser) {
    browser.close().catch(() => {});
  }
});

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
