#!/usr/bin/env node

/**
 * Strider Labs Expedia MCP Server
 *
 * MCP server that gives AI agents the ability to search flights, hotels,
 * rental cars, and vacation packages, manage trips, and complete bookings
 * on Expedia via browser automation.
 * https://striderlabs.ai
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  checkLoginStatus,
  initiateLogin,
  searchFlights,
  getFlightDetails,
  searchHotels,
  getHotelDetails,
  searchCars,
  searchPackages,
  addToTrip,
  viewTrip,
  getSavedTrips,
  checkout,
  getItinerary,
  closeBrowser,
} from "./browser.js";
import { loadSessionInfo, clearAuthData, getConfigDir } from "./auth.js";

// Initialize server
const server = new Server(
  {
    name: "strider-expedia",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "status",
        description:
          "Check Expedia login status and session info. Use this to verify authentication before performing other actions.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "login",
        description:
          "Initiate Expedia login flow. Returns a URL and instructions for the user to complete login manually. After logging in, use status to verify.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "logout",
        description:
          "Clear saved Expedia session and cookies. Use this to log out or reset authentication state.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "search_flights",
        description:
          "Search for flights on Expedia. Returns flight options with airlines, times, stops, and prices.",
        inputSchema: {
          type: "object",
          properties: {
            origin: {
              type: "string",
              description:
                "Origin airport code or city (e.g., 'LAX', 'Los Angeles', 'JFK')",
            },
            destination: {
              type: "string",
              description:
                "Destination airport code or city (e.g., 'JFK', 'New York', 'LHR')",
            },
            departureDate: {
              type: "string",
              description: "Departure date in YYYY-MM-DD format (e.g., '2025-07-01')",
            },
            returnDate: {
              type: "string",
              description:
                "Return date in YYYY-MM-DD format for round trips. Omit for one-way.",
            },
            adults: {
              type: "number",
              description: "Number of adult passengers (default: 1)",
            },
            children: {
              type: "number",
              description: "Number of child passengers (default: 0)",
            },
            cabinClass: {
              type: "string",
              enum: ["coach", "premium coach", "business", "first"],
              description: "Cabin class (default: 'coach')",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["origin", "destination", "departureDate"],
        },
      },
      {
        name: "search_hotels",
        description:
          "Search for hotels on Expedia by destination and dates. Returns hotel names, ratings, locations, and prices.",
        inputSchema: {
          type: "object",
          properties: {
            destination: {
              type: "string",
              description:
                "Destination city or area (e.g., 'Paris, France', 'New York, NY', 'Miami Beach')",
            },
            checkIn: {
              type: "string",
              description: "Check-in date in YYYY-MM-DD format (e.g., '2025-07-01')",
            },
            checkOut: {
              type: "string",
              description: "Check-out date in YYYY-MM-DD format (e.g., '2025-07-07')",
            },
            adults: {
              type: "number",
              description: "Number of adults per room (default: 1)",
            },
            rooms: {
              type: "number",
              description: "Number of rooms (default: 1)",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["destination", "checkIn", "checkOut"],
        },
      },
      {
        name: "search_cars",
        description:
          "Search for rental cars on Expedia. Returns car types, vendors, and daily rates.",
        inputSchema: {
          type: "object",
          properties: {
            pickupLocation: {
              type: "string",
              description:
                "Pickup location — airport code, city, or address (e.g., 'LAX', 'Los Angeles, CA')",
            },
            pickupDate: {
              type: "string",
              description: "Pickup date in YYYY-MM-DD format (e.g., '2025-07-01')",
            },
            pickupTime: {
              type: "string",
              description:
                "Pickup time (e.g., '10:00AM'). Defaults to '10:00AM'.",
            },
            dropoffDate: {
              type: "string",
              description: "Drop-off date in YYYY-MM-DD format (e.g., '2025-07-07')",
            },
            dropoffTime: {
              type: "string",
              description:
                "Drop-off time (e.g., '10:00AM'). Defaults to '10:00AM'.",
            },
            dropoffLocation: {
              type: "string",
              description:
                "Drop-off location if different from pickup. Omit for same-location return.",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["pickupLocation", "pickupDate", "dropoffDate"],
        },
      },
      {
        name: "search_packages",
        description:
          "Search for vacation packages on Expedia (flight + hotel bundles). Returns package deals with combined pricing.",
        inputSchema: {
          type: "object",
          properties: {
            origin: {
              type: "string",
              description:
                "Origin airport code or city (e.g., 'LAX', 'New York')",
            },
            destination: {
              type: "string",
              description:
                "Destination city or airport (e.g., 'Cancun', 'Paris')",
            },
            departureDate: {
              type: "string",
              description: "Departure date in YYYY-MM-DD format (e.g., '2025-07-01')",
            },
            returnDate: {
              type: "string",
              description: "Return date in YYYY-MM-DD format (e.g., '2025-07-14')",
            },
            adults: {
              type: "number",
              description: "Number of adults (default: 2)",
            },
            children: {
              type: "number",
              description: "Number of children (default: 0)",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 10, max: 50)",
            },
          },
          required: ["origin", "destination", "departureDate"],
        },
      },
      {
        name: "get_flight_details",
        description:
          "Get detailed information about a specific flight result, including aircraft type, baggage policy, layover details, and fare rules.",
        inputSchema: {
          type: "object",
          properties: {
            flightId: {
              type: "string",
              description:
                "Flight result ID from search_flights (e.g., '0', '1', '2')",
            },
          },
          required: ["flightId"],
        },
      },
      {
        name: "get_hotel_details",
        description:
          "Get detailed information about a hotel by its ID or URL. Returns full description, amenities, room types, check-in/out times, and policies.",
        inputSchema: {
          type: "object",
          properties: {
            hotelIdOrUrl: {
              type: "string",
              description:
                "Hotel ID (e.g., '3503040') or full URL from search_hotels results",
            },
          },
          required: ["hotelIdOrUrl"],
        },
      },
      {
        name: "add_to_trip",
        description:
          "Add a flight, hotel, car, or package to your Expedia trip/cart. Requires being logged in. Provide the item URL from search results.",
        inputSchema: {
          type: "object",
          properties: {
            itemType: {
              type: "string",
              enum: ["flight", "hotel", "car", "package"],
              description: "Type of item to add to the trip",
            },
            itemUrl: {
              type: "string",
              description:
                "URL of the flight, hotel, car, or package listing to add",
            },
            tripName: {
              type: "string",
              description:
                "Optional name for a new trip. If omitted, adds to the default/current trip.",
            },
          },
          required: ["itemType", "itemUrl"],
        },
      },
      {
        name: "view_trip",
        description:
          "View the current trip/cart with all added items and the total price. Requires being logged in.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_saved_trips",
        description:
          "Retrieve all saved trips from your Expedia account. Requires being logged in.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "checkout",
        description:
          "Complete the booking for all items in the current trip. IMPORTANT: Set confirm=true only when you have explicit user confirmation. Without confirm=true, returns a preview instead of booking.",
        inputSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              description:
                "Set to true to actually initiate booking. If false or omitted, returns a preview only. NEVER set to true without explicit user confirmation.",
            },
          },
        },
      },
      {
        name: "get_itinerary",
        description:
          "Get booked itinerary details from your Expedia account. Returns confirmation numbers, booking status, and item details.",
        inputSchema: {
          type: "object",
          properties: {
            itineraryNumber: {
              type: "string",
              description:
                "Optional specific itinerary number to retrieve. If omitted, returns all recent itineraries.",
            },
          },
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "status": {
        const sessionInfo = loadSessionInfo();
        const liveStatus = await checkLoginStatus();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  session: liveStatus,
                  savedSession: sessionInfo,
                  configDir: getConfigDir(),
                  message: liveStatus.isLoggedIn
                    ? `Logged in${
                        liveStatus.userName
                          ? ` as ${liveStatus.userName}`
                          : liveStatus.userEmail
                          ? ` as ${liveStatus.userEmail}`
                          : ""
                      }`
                    : "Not logged in. Use login to authenticate.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "login": {
        const result = await initiateLogin();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "logout": {
        clearAuthData();
        await closeBrowser();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message: "Logged out. Session and cookies cleared.",
              }),
            },
          ],
        };
      }

      case "search_flights": {
        const {
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          children,
          cabinClass,
          maxResults = 10,
        } = args as {
          origin: string;
          destination: string;
          departureDate: string;
          returnDate?: string;
          adults?: number;
          children?: number;
          cabinClass?: string;
          maxResults?: number;
        };

        const flights = await searchFlights({
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          children,
          cabinClass,
          maxResults: Math.min(maxResults, 50),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  origin,
                  destination,
                  departureDate,
                  returnDate,
                  count: flights.length,
                  flights,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_hotels": {
        const {
          destination,
          checkIn,
          checkOut,
          adults,
          rooms,
          maxResults = 10,
        } = args as {
          destination: string;
          checkIn: string;
          checkOut: string;
          adults?: number;
          rooms?: number;
          maxResults?: number;
        };

        const hotels = await searchHotels({
          destination,
          checkIn,
          checkOut,
          adults,
          rooms,
          maxResults: Math.min(maxResults, 50),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  destination,
                  checkIn,
                  checkOut,
                  count: hotels.length,
                  hotels,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_cars": {
        const {
          pickupLocation,
          pickupDate,
          pickupTime,
          dropoffDate,
          dropoffTime,
          dropoffLocation,
          maxResults = 10,
        } = args as {
          pickupLocation: string;
          pickupDate: string;
          pickupTime?: string;
          dropoffDate: string;
          dropoffTime?: string;
          dropoffLocation?: string;
          maxResults?: number;
        };

        const cars = await searchCars({
          pickupLocation,
          pickupDate,
          pickupTime,
          dropoffDate,
          dropoffTime,
          dropoffLocation,
          maxResults: Math.min(maxResults, 50),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  pickupLocation,
                  pickupDate,
                  dropoffDate,
                  count: cars.length,
                  cars,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "search_packages": {
        const {
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          children,
          maxResults = 10,
        } = args as {
          origin: string;
          destination: string;
          departureDate: string;
          returnDate?: string;
          adults?: number;
          children?: number;
          maxResults?: number;
        };

        const packages = await searchPackages({
          origin,
          destination,
          departureDate,
          returnDate,
          adults,
          children,
          maxResults: Math.min(maxResults, 50),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  origin,
                  destination,
                  departureDate,
                  returnDate,
                  count: packages.length,
                  packages,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_flight_details": {
        const { flightId } = args as { flightId: string };
        const details = await getFlightDetails(flightId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  details,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_hotel_details": {
        const { hotelIdOrUrl } = args as { hotelIdOrUrl: string };
        const details = await getHotelDetails(hotelIdOrUrl);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  details,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "add_to_trip": {
        const { itemType, itemUrl, tripName } = args as {
          itemType: "flight" | "hotel" | "car" | "package";
          itemUrl: string;
          tripName?: string;
        };

        const result = await addToTrip({ itemType, itemUrl, tripName });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  message: result.message,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "view_trip": {
        const trip = await viewTrip();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...trip,
                  itemCount: trip.items.length,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_saved_trips": {
        const trips = await getSavedTrips();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  count: trips.length,
                  trips,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "checkout": {
        const { confirm = false } = args as { confirm?: boolean };

        const result = await checkout({ confirm });

        if ("requiresConfirmation" in result) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                    requiresConfirmation: result.requiresConfirmation,
                    preview: result.preview,
                    note: "Call checkout with confirm=true to initiate booking. IMPORTANT: Only do this after getting explicit user confirmation.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: result.success,
                  confirmationNumber: result.confirmationNumber,
                  message: result.message,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_itinerary": {
        const { itineraryNumber } = (args as { itineraryNumber?: string }) ||
          {};
        const itineraries = await getItinerary(itineraryNumber);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  count: itineraries.length,
                  itineraries,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: errorMessage,
              suggestion:
                errorMessage.toLowerCase().includes("login") ||
                errorMessage.toLowerCase().includes("auth") ||
                errorMessage.toLowerCase().includes("signin")
                  ? "Try running login to authenticate"
                  : errorMessage.toLowerCase().includes("captcha")
                  ? "CAPTCHA encountered. Try again in a moment or use a different network."
                  : errorMessage.toLowerCase().includes("timeout")
                  ? "The page took too long to load. Try again."
                  : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on server close
server.onclose = async () => {
  await closeBrowser();
};

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strider Expedia MCP server running");
  console.error(`Config directory: ${getConfigDir()}`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
