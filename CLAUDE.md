# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML/JavaScript application that displays GitHub pull requests assigned to the user within any GitHub organization they have access to. The application is a client-side only dashboard with no build process or server dependencies.

## Architecture

### Core Components

- **`index.html`**: Single-page application structure with multi-step authentication and PR data table
- **`auth.js`**: Authentication and organization management in `GitHubAuth` class
- **`script.js`**: Main dashboard logic in `GitHubPRDashboard` class
- **`style.css`**: Responsive styling for the dashboard interface

### Application Flow

1. **Token Authentication**: User enters GitHub Personal Access Token (stored in localStorage)
2. **Organization Selection**: System fetches user's organizations via REST API, user selects one
3. **Data Fetching**: GraphQL query to GitHub API: `is:pr is:open org:{selected-org} assignee:@me`
4. **Display**: Renders PR table with columns: Repository, Author (avatar), PR Title, Up to Date status, PR Status, CI Status
5. **Organization Switching**: Dropdown allows switching between organizations with URL parameter updates
6. **Rate Limiting**: Displays GitHub API quota usage in real-time

### Key Technical Details

- **GitHub APIs**:
  - GraphQL endpoint at `https://api.github.com/graphql` for PR data
  - REST API at `https://api.github.com` for organization listing
- **Authentication**: Requires GitHub Personal Access Token with `repo` and `read:org` scopes
- **Organization Caching**: 24-hour cache for user organizations to minimize API calls
- **URL Parameters**: Organization selection stored in URL (`?org=orgname`) for bookmarking
- **State Management**: Event-driven communication between auth.js and script.js
- **Data Structure**: Fetches PR data including commit status, check suites, and mergeable state
- **No Framework**: Pure JavaScript/HTML/CSS - no build tools or dependencies

## Development Commands

This is a static application with no build process. To develop:

```bash
npx serve .
# or simply open index.html in browser
```

### Code Formatting

The project uses Prettier for consistent code formatting:

```bash
# Format all files
npm run format

# Check if files are formatted correctly
npm run format:check
```

## Key Implementation Notes

- **Multi-step Authentication**: Two-step process (token → organization selection)
- **Dynamic Organization Support**: Works with any GitHub organization the user has access to
- **Organization Caching**: REST API calls cached for 24 hours to reduce API usage
- **URL State Management**: Selected organization stored in URL parameters for bookmarking
- **Event-driven Architecture**: Custom events for communication between auth and dashboard modules
- **CI Status Parsing**: Handles both `statusCheckRollup` and individual `checkSuites`
- **Rate Limit Monitoring**: Uses GitHub response headers (`x-ratelimit-remaining`, `x-ratelimit-limit`)
- **UI States**: Loading states and error handling for API failures
- **Responsive Design**: Full-width table layout with mobile compatibility
- **Avatar Images**: Loaded directly from GitHub CDN via GraphQL response

## GraphQL Query Structure

The main query fetches:

- Basic PR info (title, state, mergeable status)
- Repository and author details
- Latest commit with CI check status
- Assignee information

## Styling Philosophy

- Clean, minimal interface focused on PR data
- GitHub-inspired color scheme and status badges
- Full-width layout for maximum data visibility
- Responsive design for mobile compatibility
