class GitHubAPI {
  constructor() {
    this.restEndpoint = "https://api.github.com";
    this.graphqlEndpoint = "https://api.github.com/graphql";
  }

  /**
   * Check if a valid token exists
   * @returns {boolean} - True if token exists
   */
  hasValidToken() {
    return !!localStorage.getItem("github_token");
  }

  /**
   * Universal query method for GitHub API calls
   * @param {string} endpoint - API endpoint (relative for REST, full URL for GraphQL)
   * @param {Object} options - Request options
   * @param {string} options.method - HTTP method (default: GET)
   * @param {Object} options.body - Request body for POST requests
   * @param {string} options.type - API type: "rest" or "graphql" (default: "rest")
   * @param {Function} options.rateLimitCallback - Callback for rate limit info
   * @returns {Promise<Object>} - Response data
   */
  async query(endpoint, options = {}) {
    const token = localStorage.getItem("github_token");
    if (!token) {
      throw new Error("No GitHub token available. Please authenticate first.");
    }

    const {
      method = "GET",
      body = null,
      type = "rest",
      rateLimitCallback = null,
    } = options;

    const isGraphQL = type === "graphql";
    const url = isGraphQL
      ? this.graphqlEndpoint
      : `${this.restEndpoint}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      ...(isGraphQL
        ? { "Content-Type": "application/json" }
        : { Accept: "application/vnd.github.v3+json" }),
    };

    const fetchOptions = {
      method,
      headers,
      ...(body && { body: isGraphQL ? JSON.stringify(body) : body }),
    };

    const response = await fetch(url, fetchOptions);

    // Handle rate limit info if callback provided
    if (rateLimitCallback) {
      const rateLimitInfo = this.extractRateLimitInfo(response.headers, type);
      rateLimitCallback(rateLimitInfo);
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Invalid or expired GitHub token. Please check your token and try again.",
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Validate a GitHub personal access token
   * @param {string} [token] - Token to validate (defaults to instance token)
   * @returns {Promise<boolean>} - True if token is valid
   */
  async validateToken(token = null) {
    const tokenToValidate = token || localStorage.getItem("github_token");
    if (!tokenToValidate) {
      return false;
    }

    try {
      // Temporarily store the provided token for validation
      const originalToken = localStorage.getItem("github_token");
      localStorage.setItem("github_token", tokenToValidate);

      await this.query("/user");

      // Restore original token
      if (originalToken) {
        localStorage.setItem("github_token", originalToken);
      } else {
        localStorage.removeItem("github_token");
      }
      return true;
    } catch (error) {
      // Restore original token on error
      const originalToken = localStorage.getItem("github_token");
      if (originalToken && originalToken !== tokenToValidate) {
        localStorage.setItem("github_token", originalToken);
      }
      console.error("Token validation failed:", error);
      return false;
    }
  }

  /**
   * Fetch user's organizations
   * @returns {Promise<Array>} - Array of organization objects
   */
  async getUserOrganizations() {
    try {
      return await this.query("/user/orgs");
    } catch (error) {
      console.error("Error fetching organizations:", error);
      throw new Error(
        "Failed to fetch organizations. Please check your token permissions.",
      );
    }
  }

  /**
   * Fetch assigned pull requests for an organization using GraphQL
   * @param {string} organization - Organization name
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<Object>} - GraphQL response data
   */
  async fetchPullRequests(organization, rateLimitCallback = null) {
    const query = `
            query GetAssignedPRs {
                search(
                    query: "is:pr is:open org:${organization} assignee:@me"
                    type: ISSUE
                    first: 100
                ) {
                    issueCount
                    edges {
                        node {
                            ... on PullRequest {
                                title
                                url
                                number
                                state
                                isDraft
                                mergeable
                                mergeStateStatus
                                headRefName
                                baseRefName
                                createdAt
                                updatedAt
                                repository {
                                    name
                                    nameWithOwner
                                }
                                author {
                                    login
                                    avatarUrl
                                }
                                commits(last: 1) {
                                    nodes {
                                        commit {
                                            oid
                                            statusCheckRollup {
                                                state
                                            }
                                        }
                                    }
                                }
                                assignees(first: 10) {
                                    nodes {
                                        login
                                    }
                                }
                                reviews(first: 10) {
                                    nodes {
                                        state
                                        author {
                                            login
                                            avatarUrl
                                        }
                                    }
                                }

                            }
                        }
                    }
                }
            }
        `;

    const result = await this.query("", {
      method: "POST",
      body: { query },
      type: "graphql",
      rateLimitCallback,
    });

    if (result.errors) {
      throw new Error(result.errors.map((e) => e.message).join(", "));
    }

    return result.data;
  }

  /**
   * Fetch failed CI checks for a specific commit
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} sha - Commit SHA
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<Array>} - Array of failed check objects
   */
  async fetchFailedChecks(owner, repo, sha, rateLimitCallback = null) {
    try {
      const data = await this.query(
        `/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        {
          rateLimitCallback,
        },
      );

      const failedChecks = [];

      if (data.check_runs) {
        data.check_runs.forEach((checkRun) => {
          if (checkRun.conclusion === "failure") {
            let checkName = checkRun.name;

            // Clean up Hyperion check names
            checkName = checkName.replace(/^rails-ci\s\/ /, "");

            failedChecks.push({
              name: checkName,
              url: checkRun.html_url || checkRun.details_url || "#",
            });
          }
        });
      }

      return failedChecks;
    } catch (error) {
      console.warn(
        `Error fetching failed checks for ${owner}/${repo}@${sha}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Extract rate limit information from response headers
   * @param {Headers} headers - Response headers
   * @param {string} type - API type ("graphql" or "rest")
   * @returns {Object} - Rate limit information
   */
  extractRateLimitInfo(headers, type) {
    const remaining = headers.get("x-ratelimit-remaining");
    const limit = headers.get("x-ratelimit-limit");
    const resetTime = headers.get("x-ratelimit-reset");

    if (!remaining || !limit) {
      return null;
    }

    const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : null;
    const resetString = resetDate
      ? ` (resets ${resetDate.toLocaleTimeString()})`
      : "";

    return {
      type,
      remaining: parseInt(remaining),
      limit: parseInt(limit),
      resetString,
      isLow: remaining < 100,
    };
  }
}

// Global instance
window.githubAPI = new GitHubAPI();
