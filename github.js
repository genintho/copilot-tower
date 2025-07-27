class GitHubAPI {
  constructor() {
    this.restEndpoint = "https://api.github.com";
    this.graphqlEndpoint = "https://api.github.com/graphql";
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
      Authorization: `Bearer ${window.auth.token}`,
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
   * Fetch user's organizations
   * @returns {Promise<Array>} - Array of organization objects
   */
  async getUserOrganizations() {
    const cached = localStorage.getItem("github_orgs_cache");
    if (cached) {
      const data = JSON.parse(cached);
      const now = Date.now();

      if (data.organizations && now < data.expiresAt) {
        return data.organizations;
      }
    }
    // Cache expired, remove it
    localStorage.removeItem("github_orgs_cache");

    try {
      const res = await this.query("/user/orgs");
      const cacheData = {
        organizations: res,
        cachedAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      };

      localStorage.setItem("github_orgs_cache", JSON.stringify(cacheData));
      return res;
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
                                reviewDecision
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
        `/repos/${owner}/${repo}/commits/${sha}/check-runs?status=completed&per_page=100`,
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
   * Fetch workflow runs for a specific commit
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {string} sha - Commit SHA
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<Array>} - Array of workflow run objects
   */
  async fetchWorkflowRuns(owner, repo, sha, rateLimitCallback = null) {
    try {
      const data = await this.query(
        `/repos/${owner}/${repo}/actions/runs?head_sha=${sha}&per_page=100`,
        {
          rateLimitCallback,
        },
      );

      return data.workflow_runs || [];
    } catch (error) {
      console.warn(
        `Error fetching workflow runs for ${owner}/${repo}@${sha}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Re-run failed jobs for a workflow run
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} runId - Workflow run ID
   * @param {Function} rateLimitCallback - Callback to handle rate limit info
   * @returns {Promise<boolean>} - Success status
   */
  async rerunFailedJobs(owner, repo, runId, rateLimitCallback = null) {
    try {
      await this.query(
        `/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
        {
          method: "POST",
          rateLimitCallback,
        },
      );
      return true;
    } catch (error) {
      console.error(
        `Error re-running failed jobs for ${owner}/${repo} run ${runId}:`,
        error,
      );
      return false;
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
