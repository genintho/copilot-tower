# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML/JavaScript application that displays GitHub pull requests assigned to the user within any GitHub organization they have access to. The application is a client-side only dashboard with no build process or server dependencies.

## Architecture

### Core Components

- **`index.html`**: Single-page application structure with multi-step authentication and PR data table
- **`auth.js`**: Authentication management in `GitHubAuth` class
- **`org.js`**: Organization selection logic in `GitHubOrgOrg` class
- **`script.js`**: Main dashboard logic in `GitHubPRDashboard` class with PR data handling
- **`github.js`**: GitHub API abstraction layer in `GitHubAPI` class
- **`bootstrap.js`**: Application initialization and event management
- **`style.css`**: Responsive styling for the dashboard interface

### Application Flow

1. **Token Authentication**: User enters GitHub Personal Access Token (stored in localStorage)
2. **Organization Selection**: System fetches user's organizations via REST API, user selects one
3. **Data Fetching**: GraphQL query to GitHub API: `is:pr is:open org:{selected-org} assignee:@me`
4. **Display**: Renders PR table with columns: Repository, Author (avatar), PR Title, Status, Up to Date, CI Status
5. **Organization Switching**: Dropdown allows switching between organizations with URL parameter updates
6. **Rate Limiting**: Displays GitHub API quota usage in real-time
7. **Auto-refresh**: Refreshes data when tab regains focus

### Key Technical Details

- **GitHub APIs**:
  - GraphQL endpoint at `https://api.github.com/graphql` for PR data
  - REST API at `https://api.github.com` for organization listing and GitHub Actions
- **Authentication**: Requires GitHub Personal Access Token with `repo` and `read:org` scopes
- **Organization Caching**: 24-hour cache for user organizations to minimize API calls
- **URL Parameters**: Organization selection stored in URL (`?org=orgname`) for bookmarking
- **State Management**: Event-driven communication between modules using custom events
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
- **Event-driven Architecture**: Custom events for communication between modules (`organizationChanged`)
- **CI Status Integration**:
  - Handles both GraphQL `statusCheckRollup` and REST API `check-runs`
  - Failed checks are fetched individually and sorted alphabetically
  - Re-run failed jobs functionality using GitHub Actions API
- **Rate Limit Monitoring**: Uses GitHub response headers for both GraphQL and REST APIs
- **UI States**: Loading states and error handling for API failures
- **Status Column Logic**: Draft badge appears exclusively in Status column for draft PRs
- **Responsive Design**: Full-width table layout with mobile compatibility

## GitHub API Integration

### GraphQL Query Structure

The main query fetches:

- Basic PR info (title, state, mergeable status, reviewDecision)
- Repository and author details
- Latest commit with CI check status (`statusCheckRollup`)
- Assignee information

### REST API Usage

- Organization listing with caching
- Individual check-runs for failed CI status details
- GitHub Actions workflow runs and re-run failed jobs functionality

### API Class Structure (`GitHubAPI`)

- Universal `query()` method handles both GraphQL and REST calls
- Rate limit extraction and callback system
- Error handling with proper HTTP status codes
- Methods: `fetchPullRequests()`, `fetchFailedChecks()`, `fetchWorkflowRuns()`, `rerunFailedJobs()`

## Module Communication

### Bootstrap Flow

1. `bootstrap.js` initializes the application on DOM load
2. Checks for stored token → shows auth or org selection
3. Handles organization changes via custom events
4. Manages auto-refresh on tab focus

### Class Instances

- `window.auth` (GitHubAuth)
- `window.org` (GitHubOrgOrg)
- `window.main` (GitHubPRDashboard)
- `window.githubAPI` (GitHubAPI)

## UI Status Logic

### PR Status Column (4th column)

- **Draft PRs**: Shows only draft badge (exclusive)
- **Non-draft PRs**: Shows approval status, changes requested, or waiting for review

### CI Status Features

- Failed checks displayed as clickable links
- Re-run button appears for failed CI status
- Button states: loading, success, warning, error with auto-reset
- Integrates with existing rate limiting system
