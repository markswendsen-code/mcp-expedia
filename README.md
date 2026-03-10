# @striderlabs/mcp-expedia

MCP server for Expedia — let AI agents search flights, hotels, rental cars, and vacation packages, manage trips, and complete bookings via browser automation.

Built by [Strider Labs](https://striderlabs.ai).

## Features

- **14 tools** covering the full Expedia travel booking workflow
- **Playwright browser automation** with stealth patches to avoid bot detection
- **Session persistence** via cookies at `~/.striderlabs/expedia/cookies.json`
- **Human-like behavior** — random delays, realistic user agent, locale/timezone spoofing
- **CAPTCHA detection** with helpful error messages
- **Confirmation gates** for destructive actions (checkout) to prevent accidental bookings
- **JSON responses** for easy parsing by AI agents

## Tools

| Tool | Description |
|------|-------------|
| `status` | Check Expedia login status and session info |
| `login` | Initiate Expedia login flow (returns URL + instructions) |
| `logout` | Clear saved session and cookies |
| `search_flights` | Search for flights by origin, destination, dates, and passenger count |
| `search_hotels` | Search for hotels by destination and dates |
| `search_cars` | Search for rental cars by pickup location and dates |
| `search_packages` | Search for vacation packages (flight + hotel bundles) |
| `get_flight_details` | Get detailed info about a specific flight result |
| `get_hotel_details` | Get full hotel details including amenities, room types, and policies |
| `add_to_trip` | Add a flight, hotel, car, or package to your Expedia trip |
| `view_trip` | View the current trip/cart with all items and total price |
| `get_saved_trips` | Retrieve all saved trips from your Expedia account |
| `checkout` | Complete booking for all items in the current trip |
| `get_itinerary` | Get booked itinerary details and confirmation numbers |

## Installation

```bash
npm install -g @striderlabs/mcp-expedia
npx playwright install chromium
```

## Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "expedia": {
      "command": "striderlabs-mcp-expedia"
    }
  }
}
```

Or with `npx`:

```json
{
  "mcpServers": {
    "expedia": {
      "command": "npx",
      "args": ["-y", "@striderlabs/mcp-expedia"]
    }
  }
}
```

## Authentication

Expedia requires a logged-in session for trip management, checkout, and itinerary access. The server persists your session cookies at `~/.striderlabs/expedia/cookies.json`.

**Login flow:**

1. Ask the AI agent to run `login`
2. Open the returned URL in your browser
3. Log in to your Expedia account
4. Run `status` to verify the session was saved

Search tools (flights, hotels, cars, packages) work without authentication.

## Safety

The `checkout` tool requires `confirm: true` to actually complete a booking. Without it, the tool returns a preview of the trip contents. **Never set `confirm: true` without explicit user confirmation.**

## Session Storage

Cookies and session info are stored at:
- `~/.striderlabs/expedia/cookies.json`
- `~/.striderlabs/expedia/session.json`

## Development

```bash
git clone https://github.com/markswendsen-code/mcp-expedia
cd mcp-expedia
npm install
npm run build
node dist/index.js
```

## License

MIT — © Strider Labs
