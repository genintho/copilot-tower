# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML/JavaScript application that displays GitHub pull requests assigned to the user within the `hoverinc` organization. The application is a client-side only dashboard with no build process or server dependencies.

## Architecture

### Core Components

- **`index.html`**: Single-page application structure with authentication form and PR data table
- **`script.js`**: Main application logic in `GitHubPRDashboard` class
- **`style.css`**: Responsive styling for the dashboard interface

### Application Flow

1. **Authentication**: User enters GitHub Personal Access Token (stored in localStorage)
2. **Data Fetching**: GraphQL query to GitHub API: `is:pr is:open org:hoverinc assignee:@me`
3. **Display**: Renders PR table with columns: Repository, Author (avatar), PR Title, Up to Date status, PR Status, CI Status
4. **Rate Limiting**: Displays GitHub API quota usage in real-time

### Key Technical Details

- **GitHub API**: Uses GraphQL endpoint at `https://api.github.com/graphql`
- **Authentication**: Requires GitHub Personal Access Token with `repo` scope
- **Data Structure**: Fetches PR data including commit status, check suites, and mergeable state
- **State Management**: Simple class-based approach with localStorage for token persistence
- **No Framework**: Pure JavaScript/HTML/CSS - no build tools or dependencies

## Development Commands

This is a static application with no build process. To develop:

```bash
npx serve .
# or simply open index.html in browser
```

## Key Implementation Notes

- The application targets only the `hoverinc` organization (hardcoded in GraphQL query)
- CI status parsing handles both `statusCheckRollup` and individual `checkSuites`
- Rate limit monitoring uses GitHub response headers (`x-ratelimit-remaining`, `x-ratelimit-limit`)
- UI shows loading states and error handling for API failures
- Responsive design with full-width table layout
- Avatar images loaded directly from GitHub CDN via GraphQL response

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