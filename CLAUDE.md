# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML/JavaScript application that displays GitHub pull requests assigned to the user within any GitHub organization they have access to. The application is a client-side only dashboard with no build process or server dependencies.

## Architecture

### Core Components

- **`index.html`**: Single-page application structure with multi-step authentication and PR data table
- **`auth.js`**: Authentication management in `GitHubAuth` class
- **`org.js`**: Organization selection logic in `GitHubOrgOrg` class
- **`script.js`**: `PullRequest` model class (PR status logic, Jira key parsing, behind-count) and `GitHubPRDashboard` class (rendering, actions, UI)
- **`github.js`**: GitHub API abstraction layer in `GitHubAPI` class with LRU caching utilities
- **`bootstrap.js`**: Application initialization and event management
- **`style.css`**: Responsive styling for the dashboard interface

### Application Flow

1. **Token Authentication**: User enters GitHub Personal Access Token (stored in localStorage)
2. **Organization Selection**: System fetches user's organizations via REST API, user selects one
3. **Data Fetching**: GraphQL query to GitHub API: `is:pr is:open org:{selected-org} assignee:@me`
4. **Display**: Renders PR table with columns: Repository, Author (avatar), PR Title, Status, Up to Date, CI Status, Actions
5. **Organization Switching**: Dropdown allows switching between organizations with URL parameter updates
6. **Auto-refresh**: Refreshes data when tab regains focus

### Key Technical Details

- **GitHub APIs**: GraphQL for PR data, REST for organizations, CI checks, branch operations, and GitHub Actions
- **Authentication**: Requires GitHub Personal Access Token with `repo` and `read:org` scopes
- **No Framework**: Pure JavaScript/HTML/CSS - no build tools or dependencies
- **State Management**: Event-driven communication between modules using custom `organizationChanged` event
- **URL Parameters**: Organization selection stored in URL (`?org=orgname`) for bookmarking
- **Global instances**: `window.auth`, `window.org`, `window.main`, `window.githubAPI`
- **Jira Integration**: PR titles matching `[PROJ-123]` pattern are linked to `hoverinc.atlassian.net`

### Actions Column

- **Convert Draft to Open**: Marks a draft PR as ready for review via GraphQL mutation
- **Re-run Failed CI**: Re-runs failed GitHub Actions workflow jobs
- **Sync with Base Branch**: Updates PR branch when behind the base branch

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
