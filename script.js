class PullRequest {
    constructor(prData) {
        this.data = prData;
    }

    get title() { return this.data.title; }
    get url() { return this.data.url; }
    get number() { return this.data.number; }
    get isDraft() { return this.data.isDraft; }
    get isNotDraft() { return !this.isDraft; }
    get mergeable() { return this.data.mergeable; }
    get mergeStateStatus() { return this.data.mergeStateStatus; }
    get createdAt() { return this.data.createdAt; }
    get updatedAt() { return this.data.updatedAt; }
    get repository() { return this.data.repository; }
    get author() { return this.data.author; }
    get commits() { return this.data.commits; }
    get reviews() { return this.data.reviews; }

    isReadyToBeMerged() {
        return this.isNotDraft && this.hasBeenApproved() && this.hasNoConflicts();
    }

    isBlockedByOther() {
        return this.isNotDraft && this.waitingForReview() && this.hasNoConflicts();
    }

    hasBeenApproved() {
        const reviews = this.reviews.nodes || [];
        const hasApprovalReview = reviews.some((review) => {
            const assignees = this.data.assignees.nodes || [];
            const isAssignee = assignees.some(assignee => assignee.login === review.author.login);
            return review.state === 'APPROVED' && !isAssignee;
        });
        return hasApprovalReview && !this.hasChangesRequested();
    }

    approvedBy(){
        const reviews = this.reviews.nodes || [];
        const approvedBy = [];
        reviews.forEach((review) => {
            if (review.state === 'APPROVED') {
                approvedBy.push(review.author);
            }
        });
        return approvedBy;
    }

    hasChangesRequested() {
        const reviews = this.reviews.nodes || [];
        const hasChangesRequested = reviews.some(review => review.state === 'CHANGES_REQUESTED');
        if (hasChangesRequested) {
            return true;
        }
        return reviews.some(review => review.state === 'COMMENTED');
    }

    waitingForReview() {
        return this.isNotDraft && !this.hasBeenApproved() && !this.hasChangesRequested();
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
        return this.title.replace(/^\[([A-Z]+-\d+)\]\s*/, '');
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
        this.token = localStorage.getItem('github_token');
        this.apiEndpoint = 'https://api.github.com/graphql';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.checkAuthentication();
    }

    setupEventListeners() {
        document.getElementById('saveToken').addEventListener('click', () => this.saveToken());
        document.getElementById('clearToken').addEventListener('click', () => this.clearToken());
        document.getElementById('refreshButton').addEventListener('click', () => this.loadPullRequests());

        // Allow Enter key to save token
        document.getElementById('githubToken').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveToken();
        });
    }

    checkAuthentication() {
        if (this.token) {
            this.showMainContent();
            this.loadPullRequests();
        } else {
            this.showAuthSection();
        }
    }

    saveToken() {
        const tokenInput = document.getElementById('githubToken');
        const token = tokenInput.value.trim();

        if (!token) {
            this.showError('Please enter a valid GitHub token');
            return;
        }

        this.token = token;
        localStorage.setItem('github_token', token);
        tokenInput.value = '';

        this.showMainContent();
        this.loadPullRequests();
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('github_token');
        this.showAuthSection();
    }

    showAuthSection() {
        document.getElementById('authSection').style.display = 'block';
        document.getElementById('mainContent').style.display = 'none';
    }

    showMainContent() {
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
    }

    async loadPullRequests() {
        this.showLoading(true);
        this.hideError();
        this.hideNoDataMessage();

        try {
            const data = await this.fetchPullRequests();
            this.displayPullRequests(data);
            this.updateLastRefreshed();
        } catch (error) {
            console.error('Error loading pull requests:', error);
            this.showError(`Failed to load pull requests: ${error.message}`);
        } finally {
            this.showLoading(false);
        }
    }

    async fetchPullRequests() {
        const query = `
            query GetAssignedPRs {
                search(
                    query: "is:pr is:open org:hoverinc assignee:@me"
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

        const response = await fetch(this.apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid or expired GitHub token. Please check your token and try again.');
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();

        // Update rate limit info from response headers
        this.updateRateLimitInfo(response.headers);

        if (result.errors) {
            throw new Error(result.errors.map(e => e.message).join(', '));
        }

        return result.data;
    }

    displayPullRequests(data) {
        const tbody = document.getElementById('prTableBody');
        tbody.innerHTML = '';

        const pullRequests = data.search.edges.map(edge => new PullRequest(edge.node));

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

        pullRequests.forEach(async (pr, index) => {
            const row = this.createPRRow(pr);
            tbody.appendChild(row);

            // Load CI status asynchronously for each PR
            this.loadCIStatusForPR(pr, row, index);
        });
    }

    createPRRow(pr) {
        const row = document.createElement('tr');

        this.applyRowStyling(row, pr);

        row.appendChild(this.createRepositoryCell(pr));
        row.appendChild(this.createAuthorCell(pr));
        row.appendChild(this.createTitleCell(pr));
        row.appendChild(this.createUpToDateCell(pr));
        row.appendChild(this.createStatusCell(pr));
        row.appendChild(this.createCICell());

        return row;
    }

    applyRowStyling(row, pr) {
        if (pr.isBlockedByOther()) {
            row.classList.add('blocked-by-other-pr');
        } else if (pr.isReadyToBeMerged()) {
            row.classList.add('ready-to-be-merged');
        } else if (pr.isStale()) {
            row.classList.add('stale-pr');
        }
    }

    createRepositoryCell(pr) {
        const cell = document.createElement('td');
        cell.textContent = pr.repository.name;
        return cell;
    }

    createAuthorCell(pr) {
        const cell = document.createElement('td');

        if (pr.author) {
            const avatar = document.createElement('img');
            avatar.src = pr.author.avatarUrl;
            avatar.alt = pr.author.login;
            avatar.className = 'author-avatar';
            avatar.title = pr.author.login;
            cell.appendChild(avatar);
        } else {
            cell.textContent = '?';
        }

        return cell;
    }

    createTitleCell(pr) {
        const cell = document.createElement('td');

        const jiraKey = pr.getJiraKey();

        if (jiraKey) {
            this.addJiraLink(cell, jiraKey);
            cell.appendChild(document.createTextNode(' '));
            this.addPRTitleLink(cell, pr.url, pr.getTitleWithoutJira());
        } else {
            this.addPRTitleLink(cell, pr.url, pr.title);
        }

        if (pr.isDraft) {
            this.addDraftBadge(cell);
        }

        return cell;
    }

    addJiraLink(cell, jiraKey) {
        const jiraLink = document.createElement('a');
        jiraLink.href = `https://hoverinc.atlassian.net/browse/${jiraKey}`;
        jiraLink.target = '_blank';
        jiraLink.textContent = `[${jiraKey}]`;
        jiraLink.className = 'jira-link';
        cell.appendChild(jiraLink);
    }

    addPRTitleLink(cell, url, title) {
        const titleLink = document.createElement('a');
        titleLink.href = url;
        titleLink.target = '_blank';
        titleLink.textContent = title ;
        titleLink.className = 'pr-link';
        cell.appendChild(titleLink);
    }

    addDraftBadge(cell) {
        const draftBadge = document.createElement('span');
        draftBadge.className = 'draft-badge';
        draftBadge.textContent = 'DRAFT';
        cell.appendChild(draftBadge);
    }

    createUpToDateCell(pr) {
        const cell = document.createElement('td');
        if (pr.hasMergeConflicts) {
            cell.innerHTML = '<span class="status-badge error">❌ Conflicts</span>';
        } else if (pr.hasUnknownMergeStatus) {
            cell.innerHTML = '<span class="status-badge neutral">🔄 Loading</span>';
        } else if ( pr.isBehindMainBranch) {
            cell.innerHTML = '<span class="status-badge warning">⚠️ Behind</span>';
        }
        return cell;
    }

    createStatusCell(pr) {
        const cell = document.createElement('td');

        if (pr.hasBeenApproved()) {
            cell.innerHTML = '<span class="status-badge success">✅ Approved by ' + pr.approvedBy().map(a => {
                return `<img src="${a.avatarUrl}" alt="${a.login}" class="author-avatar">`;
        }).join(', ') +'</span>';

        } else if (pr.hasChangesRequested()) {
            cell.innerHTML = '<span class="status-badge warning">🔄 Changes Requested</span>';
        } else if (pr.waitingForReview()) {
            console.log('waitingForReview', pr);
            cell.innerHTML = '<span class="status-badge neutral">⏳ Waiting for Review</span>';
        }

        return cell;
    }

    createCICell() {
        const cell = document.createElement('td');
        cell.innerHTML = '<span class="status-badge neutral">🔄 Loading...</span>';
        return cell;
    }

    async loadCIStatusForPR(pr, row, index) {
        try {
            const sha = pr.latestCommitSha;
            if (!sha) {
                this.updateCICell(row, { text: 'No CI', class: 'neutral', failedChecks: [] });
                return;
            }

            const statusRollup = pr.getStatusCheckRollup();

            // Get basic status from GraphQL first
            let ciStatus = { text: 'No CI', class: 'neutral', failedChecks: [] };

            if (statusRollup) {
                switch (statusRollup.state) {
                    case 'SUCCESS':
                        ciStatus = { text: '✅ Passed', class: 'success', failedChecks: [] };
                        break;
                    case 'FAILURE':
                    case 'ERROR':
                        // Only use REST API when there are actual failures
                        const [owner, repo] = pr.repository.nameWithOwner.split('/');
                        const failedChecks = await this.fetchFailedChecks(owner, repo, sha);
                        ciStatus = {
                            text: statusRollup.state === 'FAILURE' ? '❌ Failed' : '💥 Error',
                            class: 'error',
                            failedChecks: failedChecks
                        };
                        break;
                    case 'PENDING':
                        ciStatus = { text: '🟡 Running', class: 'warning', failedChecks: [] };
                        break;
                }
            }

            this.updateCICell(row, ciStatus);
        } catch (error) {
            console.warn(`Failed to load CI status for PR ${pr.number}:`, error);
            this.updateCICell(row, { text: 'Error', class: 'error', failedChecks: [] });
        }
    }

    async fetchFailedChecks(owner, repo, sha) {
        try {
            // Use REST API to get check runs for the commit
            const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                }
            });

            if (!response.ok) {
                console.warn(`Failed to fetch check runs for ${owner}/${repo}@${sha}`);
                return [];
            }

            const data = await response.json();
            const failedChecks = [];

            if (data.check_runs) {
                data.check_runs.forEach(checkRun => {
                    if (checkRun.conclusion === 'failure') {
                        let checkName = checkRun.name;

                        // Clean up Hyperion check names
                        checkName = checkName.replace(/^rails-ci\s\/ /, '');

                        failedChecks.push({
                            name: checkName,
                            url: checkRun.html_url || checkRun.details_url || '#'
                        });
                    }
                });
            }

            return failedChecks;
        } catch (error) {
            console.warn(`Error fetching failed checks for ${owner}/${repo}@${sha}:`, error);
            return [];
        }
    }

    updateCICell(row, ciStatus) {
        const ciCell = row.cells[5]; // CI Status is the 6th column (0-indexed)

        if (ciStatus.class === 'error' && ciStatus.failedChecks.length > 0) {
            ciCell.innerHTML = `
                <div class="ci-status-container">
                    <span class="status-badge ${ciStatus.class}">${ciStatus.text}</span>
                    <ul class="failed-checks-list">
                        ${ciStatus.failedChecks.map(check =>
                            `<li><a href="${check.url}" target="_blank" class="check-link">${check.name}</a></li>`
                        ).join('')}
                    </ul>
                </div>
            `;
        } else {
            ciCell.innerHTML = `<span class="status-badge ${ciStatus.class}">${ciStatus.text}</span>`;
        }
    }





    showLoading(show) {
        document.getElementById('loadingSpinner').style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('errorMessage').style.display = 'none';
    }

    showNoDataMessage() {
        document.getElementById('noPrsMessage').style.display = 'block';
    }

    hideNoDataMessage() {
        document.getElementById('noPrsMessage').style.display = 'none';
    }

    updateRateLimitInfo(headers) {
        const remaining = headers.get('x-ratelimit-remaining');
        const limit = headers.get('x-ratelimit-limit');
        const resetTime = headers.get('x-ratelimit-reset');

        if (remaining && limit) {
            const resetDate = resetTime ? new Date(parseInt(resetTime) * 1000) : null;
            const resetString = resetDate ? ` (resets ${resetDate.toLocaleTimeString()})` : '';

            const rateLimitElement = document.getElementById('rateLimit');
            rateLimitElement.textContent = `API: ${remaining}/${limit}${resetString}`;
            rateLimitElement.className = remaining < 100 ? 'rate-limit-low' : 'rate-limit-ok';
        }
    }

    updateLastRefreshed() {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        document.getElementById('lastUpdated').textContent = `Last updated: ${timeString}`;
    }
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GitHubPRDashboard();
});