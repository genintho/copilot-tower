class PullRequest {
  constructor(prData) {
    this.data = prData;
  }

  get id() {
    return this.data.id;
  }
  get title() {
    return this.data.title;
  }
  get url() {
    return this.data.url;
  }
  get number() {
    return this.data.number;
  }
  get isDraft() {
    return this.data.isDraft;
  }
  get isNotDraft() {
    return !this.isDraft;
  }
  get mergeable() {
    return this.data.mergeable;
  }
  get mergeStateStatus() {
    return this.data.mergeStateStatus;
  }
  get createdAt() {
    return this.data.createdAt;
  }
  get updatedAt() {
    return this.data.updatedAt;
  }
  get repository() {
    return this.data.repository;
  }
  get author() {
    return this.data.author;
  }
  get baseRefName() {
    return this.data.baseRefName;
  }
  get commits() {
    return this.data.commits;
  }
  get reviews() {
    return this.data.reviews;
  }

  get reviewDecision() {
    return this.data.reviewDecision;
  }

  isReadyToBeMerged() {
    return this.isNotDraft && this.hasBeenApproved() && this.hasNoConflicts();
  }

  isBlockedByOther() {
    return this.isNotDraft && this.waitingForReview() && this.hasNoConflicts();
  }

  hasBeenApproved() {
    if (this.hasChangesRequested()) {
      return false;
    }
    return this.reviewDecision === "APPROVED";
    // const reviews = this.reviews.nodes || [];
    // const hasApprovalReview = reviews.some((review) => {
    //   const assignees = this.data.assignees.nodes || [];
    //   const isAssignee = assignees.some(
    //     (assignee) => assignee.login === review.author.login,
    //   );
    //   return review.state === "APPROVED" && !isAssignee;
    // });
    // return hasApprovalReview && !this.hasChangesRequested();
  }

  approvedBy() {
    return [];
    // const reviews = this.reviews.nodes || [];
    // const approvedBy = [];
    // reviews.forEach((review) => {
    //   if (review.state === "APPROVED") {
    //     approvedBy.push(review.author);
    //   }
    // });
    // return approvedBy;
  }

  hasChangesRequested() {
    if (this.reviewDecision === "CHANGES_REQUESTED") {
      return true;
    }
    return false;
    // const reviews = this.reviews.nodes || [];
    // const hasChangesRequested = reviews.some(
    //   (review) => review.state === "CHANGES_REQUESTED",
    // );
    // if (hasChangesRequested) {
    //   return true;
    // }
    // return reviews.some((review) => review.state === "COMMENTED");
  }

  waitingForReview() {
    return (
      this.isNotDraft &&
      !this.hasBeenApproved() &&
      !this.hasChangesRequested() &&
      this.reviewDecision === "REVIEW_REQUIRED"
    );
  }

  hasNoConflicts() {
    return this.mergeable === "MERGEABLE";
  }

  get hasMergeConflicts() {
    return this.mergeable === "CONFLICTING";
  }

  get hasUnknownMergeStatus() {
    return this.mergeable === "UNKNOWN";
  }

  get isBehindMainBranch() {
    return this.mergeStateStatus === "BEHIND";
  }

  isStale() {
    const updatedDate = new Date(this.updatedAt).toDateString();
    const today = new Date().toDateString();
    return updatedDate !== today;
  }

  getJiraKey() {
    const jiraMatch = this.title.match(/^\[([A-Z]+-\d+)\]/);
    return jiraMatch ? jiraMatch[1] : null;
  }

  getTitleWithoutJira() {
    return this.title.replace(/^\[([A-Z]+-\d+)\]\s*/, "");
  }

  get latestCommitSha() {
    const commits = this.commits.nodes;
    return commits.length > 0 ? commits[0].commit.oid : null;
  }

  getStatusCheckRollup() {
    const commits = this.commits.nodes;
    return commits.length > 0 ? commits[0].commit.statusCheckRollup : null;
  }
}

class GitHubPRDashboard {
  constructor() {
    this.organization = null;
    document.getElementById("orgDropdown").addEventListener("change", (e) => {
      const newOrg = e.target.value;
      window.dispatchEvent(
        new CustomEvent("organizationChanged", {
          detail: { organization: newOrg },
        }),
      );
    });
  }

  hide() {
    document.getElementById("mainContent")?.classList.add("hidden");
  }
  show(org) {
    console.log("Showing main content for organization:", org);
    this.organization = org;
    window.auth.hide();
    window.org.hide();
    document.getElementById("mainContent")?.classList.remove("hidden");
    this.loadPullRequests();
    this.populateOrgDropdown(org);
  }

  populateOrgDropdown(selectOrganization) {
    const dropdown = document.getElementById("orgDropdown");
    dropdown.innerHTML = "";

    window.githubAPI.getUserOrganizations().then((orgs) => {
      orgs.forEach((org) => {
        const option = document.createElement("option");
        option.value = org.login;
        option.textContent = org.login;
        if (org.login === selectOrganization) {
          option.selected = true;
        }
        dropdown.appendChild(option);
      });
    });
  }

  async loadPullRequests() {
    console.log("Loading pull requests for organization:", this.organization);
    if (!this.organization) {
      console.warn("Cannot load pull requests: missing token or organization");
      return;
    }

    this.showLoading(true);
    this.hideError();
    this.hideNoDataMessage();

    // Add loading class to table for visual feedback
    const tableContainer = document.querySelector(".table-container");
    if (tableContainer) {
      tableContainer.classList.add("loading");
    }

    try {
      const data = await this.fetchPullRequests();
      this.displayPullRequests(data);
      this.updateLastRefreshed();
      this.updateNoPrsMessage();
    } catch (error) {
      console.error("Error loading pull requests:", error);
      this.showError(`Failed to load pull requests: ${error.message}`);
    } finally {
      this.showLoading(false);
      if (tableContainer) {
        tableContainer.classList.remove("loading");
      }
    }
  }

  async fetchPullRequests() {
    return await window.githubAPI.fetchPullRequests(
      this.organization,
      (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
    );
  }

  displayPullRequests(data) {
    console.log("Displaying pull requests:", data);
    const tbody = document.getElementById("prTableBody");
    const pullRequests = data.search.edges.map(
      (edge) => new PullRequest(edge.node),
    );

    if (pullRequests.length === 0) {
      this.showNoDataMessage();
      return;
    }

    // Sort PRs with custom priority logic
    pullRequests.sort((a, b) => {
      const aIsReadyToBeMerged = a.isReadyToBeMerged();
      const bIsReadyToBeMerged = b.isReadyToBeMerged();

      // PRs that are ready to be merged go to top
      if (aIsReadyToBeMerged && !bIsReadyToBeMerged) return -1;
      if (!aIsReadyToBeMerged && bIsReadyToBeMerged) return 1;

      const aIsBlockedByOther = a.isBlockedByOther();
      const bIsBlockedByOther = b.isBlockedByOther();

      // PRs that are blocked by other go to bottom
      if (aIsBlockedByOther && !bIsBlockedByOther) return 1;
      if (!aIsBlockedByOther && bIsBlockedByOther) return -1;

      // Within same category, sort by updatedAt (oldest first)
      return new Date(a.updatedAt) - new Date(b.updatedAt);
    });

    // Create new content in document fragment first
    const fragment = document.createDocumentFragment();
    const newRows = [];

    pullRequests.forEach(async (pr, index) => {
      const row = this.createPRRow(pr);
      fragment.appendChild(row);
      newRows.push({ pr, row, index });
    });

    // Fade out current content
    tbody.style.opacity = "0.5";

    // Replace content after a brief delay for smooth transition
    setTimeout(() => {
      tbody.innerHTML = "";
      tbody.appendChild(fragment);
      tbody.style.opacity = "1";

      // Load CI status asynchronously for each PR after content is visible
      newRows.forEach(({ pr, row, index }) => {
        this.loadCIStatusForPR(pr, row, index);
      });
    }, 150);
  }

  createPRRow(pr) {
    const row = document.createElement("tr");

    this.applyRowStyling(row, pr);

    row.appendChild(this.createRepositoryCell(pr));
    row.appendChild(this.createAuthorCell(pr));
    row.appendChild(this.createTitleCell(pr));
    row.appendChild(this.createStatusCell(pr));
    row.appendChild(this.createUpToDateCell(pr));
    row.appendChild(this.createCICell());
    row.appendChild(this.createActionsCell());

    return row;
  }

  applyRowStyling(row, pr) {
    if (pr.isBlockedByOther()) {
      row.classList.add("blocked-by-other-pr");
    } else if (pr.isReadyToBeMerged()) {
      row.classList.add("ready-to-be-merged");
    } else if (pr.isStale()) {
      row.classList.add("stale-pr");
    }
  }

  createRepositoryCell(pr) {
    const cell = document.createElement("td");
    cell.textContent = pr.repository.name;
    cell.title = pr.repository.name; // Show full name on hover
    return cell;
  }

  createAuthorCell(pr) {
    const cell = document.createElement("td");

    if (pr.author) {
      const avatar = document.createElement("img");
      avatar.src = pr.author.avatarUrl;
      avatar.alt = pr.author.login;
      avatar.className = "author-avatar";
      avatar.title = pr.author.login;
      cell.appendChild(avatar);
    } else {
      cell.textContent = "?";
    }

    return cell;
  }

  createTitleCell(pr) {
    const cell = document.createElement("td");

    const jiraKey = pr.getJiraKey();

    if (jiraKey) {
      this.addJiraLink(cell, jiraKey);
      cell.appendChild(document.createTextNode(" "));
      this.addPRTitleLink(cell, pr.url, pr.getTitleWithoutJira());
    } else {
      this.addPRTitleLink(cell, pr.url, pr.title);
    }

    return cell;
  }

  addJiraLink(cell, jiraKey) {
    const jiraLink = document.createElement("a");
    jiraLink.href = `https://hoverinc.atlassian.net/browse/${jiraKey}`;
    jiraLink.target = "_blank";
    jiraLink.textContent = `[${jiraKey}]`;
    jiraLink.className = "jira-link";
    cell.appendChild(jiraLink);
  }

  addPRTitleLink(cell, url, title) {
    const titleLink = document.createElement("a");
    titleLink.href = url;
    titleLink.target = "_blank";
    titleLink.textContent = title;
    titleLink.className = "pr-link";
    cell.appendChild(titleLink);
  }

  addDraftBadge(cell) {
    const draftBadge = document.createElement("span");
    draftBadge.className = "draft-badge";
    draftBadge.textContent = "DRAFT";
    cell.appendChild(draftBadge);
  }

  createUpToDateCell(pr) {
    const cell = document.createElement("td");
    if (pr.hasMergeConflicts) {
      cell.innerHTML = '<span class="status-badge error">❌ Conflicts</span>';
    } else if (pr.hasUnknownMergeStatus) {
      cell.innerHTML = '<span class="status-badge neutral">🔄 Loading</span>';
    } else if (pr.isBehindMainBranch) {
      cell.innerHTML = '<span class="status-badge warning">⚠️ Behind</span>';
    }
    return cell;
  }

  createStatusCell(pr) {
    const cell = document.createElement("td");

    if (pr.isDraft) {
      this.addDraftBadge(cell);
      return cell;
    }

    if (pr.hasBeenApproved()) {
      cell.innerHTML =
        '<span class="status-badge success">✅ Approved by ' +
        pr
          .approvedBy()
          .map((a) => {
            return `<img src="${a.avatarUrl}" alt="${a.login}" class="author-avatar">`;
          })
          .join(", ") +
        "</span>";
    } else if (pr.hasChangesRequested()) {
      cell.innerHTML =
        '<span class="status-badge warning">🔄 Changes Requested</span>';
    } else if (pr.waitingForReview()) {
      console.log("waitingForReview", pr);
      cell.innerHTML =
        '<span class="status-badge neutral">⏳ Waiting for Review</span>';
    }

    return cell;
  }

  createCICell() {
    const cell = document.createElement("td");
    cell.innerHTML = '<span class="status-badge neutral">🔄 Loading...</span>';
    return cell;
  }

  createActionsCell() {
    const cell = document.createElement("td");
    cell.className = "actions-cell";
    return cell;
  }

  async loadCIStatusForPR(pr, row, index) {
    try {
      const sha = pr.latestCommitSha;
      if (!sha) {
        this.updateCICell(
          row,
          {
            text: "sha latest commit not found",
            class: "neutral",
            failedChecks: [],
          },
          pr,
        );
        return;
      }

      const statusRollup = pr.getStatusCheckRollup();

      // Get basic status from GraphQL first
      let ciStatus = {
        text: "No CI",
        class: "neutral",
        failedChecks: [],
      };

      if (statusRollup) {
        switch (statusRollup.state) {
          case "SUCCESS":
            ciStatus = {
              text: "✅ Passed",
              class: "success",
              failedChecks: [],
            };
            break;
          case "FAILURE":
          case "ERROR":
            // Only use REST API when there are actual failures
            const [owner, repo] = pr.repository.nameWithOwner.split("/");
            const failedChecks = await this.fetchFailedChecks(owner, repo, sha);
            ciStatus = {
              text: statusRollup.state === "FAILURE" ? "❌ Failed" : "💥 Error",
              class: "error",
              failedChecks: failedChecks,
            };
            break;
          case "PENDING":
            ciStatus = {
              text: "🟡 Running",
              class: "warning",
              failedChecks: [],
            };
            break;
        }
      }

      this.updateCICell(row, ciStatus, pr);
    } catch (error) {
      console.warn(`Failed to load CI status for PR ${pr.number}:`, error);
      this.updateCICell(
        row,
        {
          text: "Error",
          class: "error",
          failedChecks: [],
        },
        pr,
      );
    }
  }

  async fetchFailedChecks(owner, repo, sha) {
    return await window.githubAPI.fetchFailedChecks(
      owner,
      repo,
      sha,
      (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
    );
  }

  updateCICell(row, ciStatus, pr = null) {
    const ciCell = row.cells[5]; // CI Status is the 6th column (0-indexed)
    const actionsCell = row.cells[6]; // Actions is the 7th column (0-indexed)

    if (ciStatus.class === "error" && ciStatus.failedChecks.length > 0) {
      const failedChecks = ciStatus.failedChecks;
      const showExpandButton = failedChecks.length > 3;
      const visibleChecks = showExpandButton
        ? failedChecks.slice(0, 2)
        : failedChecks;
      const hiddenChecks = showExpandButton ? failedChecks.slice(2) : [];

      const expandButton = showExpandButton
        ? `<li class="expand-checks-item"><button class="expand-checks-button" onclick="window.main.toggleFailedChecks(this)" data-expanded="false">more... (${hiddenChecks.length})</button></li>`
        : "";

      ciCell.innerHTML = `
                <div class="ci-status-container">
                    <div class="ci-status-left">
                        <span class="status-badge ${ciStatus.class}">${ciStatus.text}</span>
                    </div>
                    <ul class="failed-checks-list">
                        ${visibleChecks
                          .map(
                            (check) =>
                              `<li><a href="${check.url}" target="_blank" class="check-link">${check.name}</a></li>`,
                          )
                          .join("")}
                        ${expandButton}
                        ${
                          hiddenChecks.length > 0
                            ? `<div class="hidden-checks" style="display: none;">
                            ${hiddenChecks
                              .map(
                                (check) =>
                                  `<li><a href="${check.url}" target="_blank" class="check-link">${check.name}</a></li>`,
                              )
                              .join("")}
                        </div>`
                            : ""
                        }
                    </ul>
                </div>
            `;
    } else {
      ciCell.innerHTML = `<span class="status-badge ${ciStatus.class}">${ciStatus.text}</span>`;
    }

    // Update Actions column based on PR state
    this.updateActionsCell(actionsCell, pr, ciStatus);
  }

  updateActionsCell(actionsCell, pr, ciStatus) {
    const actions = [];

    // Add convert draft button for draft PRs
    if (pr && pr.isDraft) {
      actions.push(
        `<button class="convert-draft-button" onclick="window.main.handleConvertDraftToOpen('${pr.id}', this)" title="Convert to ready for review">📝 Draft => Open</button>`,
      );
    }

    // Add sync button for PRs behind base branch
    if (pr && pr.isBehindMainBranch) {
      actions.push(
        `<button class="sync-button" onclick="window.main.handleSyncWithBaseBranch('${pr.repository.nameWithOwner}', ${pr.number}, '${pr.baseRefName}', this)" title="Sync with base branch">🔄 Sync with ${pr.baseRefName}</button>`,
      );
    }

    // Add re-run button for failed CI
    if (pr && ciStatus.class === "error" && ciStatus.failedChecks.length > 0) {
      actions.push(
        `<button class="rerun-button" onclick="window.main.handleRerunFailedJobs('${pr.repository.nameWithOwner}', '${pr.latestCommitSha}', this)" title="Re-run failed jobs">🔄 Re-run</button>`,
      );
    }

    actionsCell.innerHTML = actions.join(" ");
  }

  showLoading(show) {
    const spinner = document.getElementById("loadingSpinner");
    if (show) {
      spinner.style.display = "block";
      // Force reflow to ensure display change is applied before opacity transition
      spinner.offsetHeight;
    } else {
      setTimeout(() => {
        spinner.style.display = "none";
      }, 200); // Match the CSS transition duration
    }
  }

  showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  }

  hideError() {
    document.getElementById("errorMessage").style.display = "none";
  }

  showNoDataMessage() {
    document.getElementById("prTableBody").innerHTML = "";
    document.getElementById("noPrsMessage").style.display = "block";
  }

  hideNoDataMessage() {
    document.getElementById("noPrsMessage").style.display = "none";
  }

  updateNoPrsMessage() {
    const noPrsText = document.getElementById("noPrsText");
    if (noPrsText && this.organization) {
      noPrsText.textContent = `No assigned pull requests found in the ${this.organization} organization.`;
    }
  }

  handleRateLimitInfo(rateLimitInfo) {
    if (!rateLimitInfo) return;

    const elementId =
      rateLimitInfo.type === "graphql" ? "rateLimit" : "restRateLimit";
    const prefix = rateLimitInfo.type === "graphql" ? "GraphQL" : "REST";

    const rateLimitElement = document.getElementById(elementId);
    if (rateLimitElement) {
      rateLimitElement.textContent = `${prefix}: ${rateLimitInfo.remaining}/${rateLimitInfo.limit}${rateLimitInfo.resetString}`;
      rateLimitElement.className = rateLimitInfo.isLow
        ? "rate-limit-low"
        : "rate-limit-ok";
    }
  }

  updateLastRefreshed() {
    this.lastRefreshTime = new Date();
    this.updateRelativeTime();

    // Update relative time every minute
    if (this.relativeTimeInterval) {
      clearInterval(this.relativeTimeInterval);
    }
    this.relativeTimeInterval = setInterval(
      () => this.updateRelativeTime(),
      60000,
    );
  }

  updateRelativeTime() {
    if (!this.lastRefreshTime) return;

    const now = new Date();
    const diffMs = now - this.lastRefreshTime;
    const diffMinutes = Math.floor(diffMs / 60000);

    let relativeText;
    if (diffMinutes < 1) {
      relativeText = "just now";
    } else if (diffMinutes === 1) {
      relativeText = "1 minute ago";
    } else if (diffMinutes < 60) {
      relativeText = `${diffMinutes} minutes ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours === 1) {
        relativeText = "1 hour ago";
      } else {
        relativeText = `${diffHours} hours ago`;
      }
    }

    document.getElementById("lastUpdated").textContent =
      `Last updated: ${relativeText}`;
  }

  /**
   * Shared button state management utilities
   */
  setButtonLoading(button, loadingText) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
    button.classList.add("loading");
  }

  setButtonSuccess(button, successText, resetDelay = 3000) {
    button.textContent = successText;
    button.classList.remove("loading");
    button.classList.add("success");
    this.scheduleButtonReset(button, resetDelay);
  }

  setButtonWarning(button, warningText, resetDelay = 5000) {
    button.textContent = warningText;
    button.classList.remove("loading");
    button.classList.add("warning");
    this.scheduleButtonReset(button, resetDelay);
  }

  setButtonError(button, errorText, resetDelay = 3000) {
    button.textContent = errorText;
    button.classList.remove("loading");
    button.classList.add("error");
    this.scheduleButtonReset(button, resetDelay);
  }

  scheduleButtonReset(button, delay) {
    setTimeout(() => {
      this.resetButton(button);
    }, delay);
  }

  resetButton(button) {
    const originalText = button.dataset.originalText || button.textContent;
    button.textContent = originalText;
    button.disabled = false;
    button.classList.remove("loading", "success", "warning", "error");
    delete button.dataset.originalText;
  }

  /**
   * Generic action button handler
   * @param {HTMLButtonElement} button - The button that was clicked
   * @param {Object} actionConfig - Configuration object
   * @param {string} actionConfig.loadingText - Text to show while loading
   * @param {Function} actionConfig.action - Async function to execute
   * @param {Function} actionConfig.onSuccess - Function to handle success result
   * @param {Function} actionConfig.onError - Function to handle error (optional)
   */
  async handleActionButton(button, actionConfig) {
    this.setButtonLoading(button, actionConfig.loadingText);

    try {
      const result = await actionConfig.action();
      actionConfig.onSuccess(result);
    } catch (error) {
      console.error(`Action button error:`, error);
      if (actionConfig.onError) {
        actionConfig.onError(error);
      } else {
        this.setButtonError(button, "❌ Error");
      }
    }
  }

  /**
   * Handle converting a draft PR to ready for review
   * @param {string} nodeId - Pull request node ID (GraphQL ID)
   * @param {HTMLButtonElement} button - The button that was clicked
   */
  async handleConvertDraftToOpen(nodeId, button) {
    await this.handleActionButton(button, {
      loadingText: "⏳ Converting...",
      action: async () => {
        return await window.githubAPI.markPullRequestReadyForReview(
          nodeId,
          (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
        );
      },
      onSuccess: (result) => {
        this.setButtonSuccess(button, "✅ Ready for Review");
        // Refresh the PR data to update the UI
        setTimeout(() => {
          this.loadPullRequests();
        }, 1000);
      },
      onError: (error) => {
        console.error("Error converting draft to open:", error);
        this.setButtonError(button, "❌ Failed");
      },
    });
  }

  /**
   * Handle syncing a PR branch with the base branch
   * @param {string} repoNameWithOwner - Repository name with owner (e.g., "owner/repo")
   * @param {number} pullNumber - Pull request number
   * @param {string} baseBranch - Base branch name
   * @param {HTMLButtonElement} button - The button that was clicked
   */
  async handleSyncWithBaseBranch(
    repoNameWithOwner,
    pullNumber,
    baseBranch,
    button,
  ) {
    const [owner, repo] = repoNameWithOwner.split("/");

    await this.handleActionButton(button, {
      loadingText: "⏳ Syncing...",
      action: async () => {
        return await window.githubAPI.updatePullRequestBranch(
          owner,
          repo,
          pullNumber,
          (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
        );
      },
      onSuccess: (result) => {
        this.setButtonSuccess(button, "✅ Synced");
        // Refresh the PR data to update the UI
        setTimeout(() => {
          this.loadPullRequests();
        }, 1000);
      },
      onError: (error) => {
        console.error("Error syncing with base branch:", error);
        this.setButtonError(button, "❌ Failed");
      },
    });
  }

  /**
   * Handle re-running failed CI jobs for a PR
   * @param {string} repoNameWithOwner - Repository name with owner (e.g., "owner/repo")
   * @param {string} sha - Commit SHA
   * @param {HTMLButtonElement} button - The button that was clicked
   */
  async handleRerunFailedJobs(repoNameWithOwner, sha, button) {
    const [owner, repo] = repoNameWithOwner.split("/");

    // Update button state to loading
    const originalText = button.textContent;
    button.textContent = "⏳ Running...";
    button.disabled = true;
    button.classList.add("loading");

    try {
      // Get workflow runs for this commit
      const workflowRuns = await window.githubAPI.fetchWorkflowRuns(
        owner,
        repo,
        sha,
        (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
      );

      // Find failed or cancelled runs
      const failedRuns = workflowRuns.filter(
        (run) => run.conclusion === "failure" || run.conclusion === "cancelled",
      );

      if (failedRuns.length === 0) {
        button.textContent = "✅ No Failed Jobs";
        button.classList.remove("loading");
        button.classList.add("success");
        setTimeout(() => {
          button.textContent = originalText;
          button.disabled = false;
          button.classList.remove("success");
        }, 3000);
        return;
      }

      // Re-run failed jobs for each failed run
      let successCount = 0;
      for (const run of failedRuns) {
        const success = await window.githubAPI.rerunFailedJobs(
          owner,
          repo,
          run.id,
          (rateLimitInfo) => this.handleRateLimitInfo(rateLimitInfo),
        );
        if (success) successCount++;
      }

      // Update button based on results
      if (successCount === failedRuns.length) {
        button.textContent = `✅ Re-ran ${successCount} job${successCount > 1 ? "s" : ""}`;
        button.classList.remove("loading");
        button.classList.add("success");
      } else {
        button.textContent = `⚠️ ${successCount}/${failedRuns.length} succeeded`;
        button.classList.remove("loading");
        button.classList.add("warning");
      }

      // Reset button after 5 seconds
      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
        button.classList.remove("success", "warning");
      }, 5000);
    } catch (error) {
      console.error("Error re-running failed jobs:", error);
      button.textContent = "❌ Error";
      button.classList.remove("loading");
      button.classList.add("error");

      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
        button.classList.remove("error");
      }, 3000);
    }
  }

  /**
   * Toggle the visibility of failed checks list
   * @param {HTMLButtonElement} button - The expand/collapse button
   */
  toggleFailedChecks(button) {
    const isExpanded = button.dataset.expanded === "true";
    const checksContainer = button.closest(".failed-checks-list");
    const hiddenChecks = checksContainer.querySelector(".hidden-checks");

    if (isExpanded) {
      // Collapse: hide additional checks
      hiddenChecks.style.display = "none";
      button.textContent = `more... (${hiddenChecks.children.length})`;
      button.dataset.expanded = "false";
    } else {
      // Expand: show all checks
      hiddenChecks.style.display = "block";
      button.textContent = "less...";
      button.dataset.expanded = "true";
    }
  }
}
window.main = new GitHubPRDashboard();
