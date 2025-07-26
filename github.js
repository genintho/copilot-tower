class GitHubAPI {
  constructor() {
    this.restEndpoint = "https://api.github.com";
    this.graphqlEndpoint = "https://api.github.com/graphql";
  }

  /**
   * Validate a GitHub personal access token
   * @param {string} token - GitHub personal access token
   * @returns {Promise<boolean>} - True if token is valid
   */
  async validateToken(token) {
    try {
      const response = await fetch(`${this.restEndpoint}/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      return response.ok;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  }

  /**
   * Fetch user's organizations
   * @param {string} token - GitHub personal access token
   * @returns {Promise<Array>} - Array of organization objects
   */
  async getUserOrganizations(token) {
    try {
      const response = await fetch(`${this.restEndpoint}/user/orgs`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch organizations: ${response.statusText}`,
        );
      }

      const organizations = await response.json();
      return organizations;
    } catch (error) {
      console.error("Error fetching organizations:", error);
      throw new Error(
        "Failed to fetch organizations. Please check your token permissions.",
      );
    }
  }

  /**
   * Fetch assigned pull requests for an organization using GraphQL
   * @param {string} token - GitHub personal access token
   * @param {string} organization - Organization name
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<Object>} - GraphQL response data
   */
  async fetchPullRequests(token, organization, rateLimitCallback = null) {
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

    const response = await fetch(this.graphqlEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Invalid or expired GitHub token. Please check your token and try again.",
        );
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    // Handle rate limit info if callback provided
    if (rateLimitCallback) {
      const rateLimitInfo = this.extractRateLimitInfo(
        response.headers,
        "graphql",
      );
      rateLimitCallback(rateLimitInfo);
    }

    if (result.errors) {
      throw new Error(result.errors.map((e) => e.message).join(", "));
    }

    return result.data;
  }

  /**
   * Fetch failed CI checks for a specific commit
   * @param {string} token - GitHub personal access token
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} sha - Commit SHA
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<Array>} - Array of failed check objects
   */
  async fetchFailedChecks(token, owner, repo, sha, rateLimitCallback = null) {
    try {
      const response = await fetch(
        `${this.restEndpoint}/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        console.warn(`Failed to fetch check runs for ${owner}/${repo}@${sha}`);
        return [];
      }

      // Handle rate limit info if callback provided
      if (rateLimitCallback) {
        const rateLimitInfo = this.extractRateLimitInfo(
          response.headers,
          "rest",
        );
        rateLimitCallback(rateLimitInfo);
      }

      const data = await response.json();
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
