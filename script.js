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
                                        }
                                    }
                                }
                                reviewRequests(first: 10) {
                                    nodes {
                                        requestedReviewer {
                                            ... on User {
                                                login
                                            }
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

        const pullRequests = data.search.edges.map(edge => edge.node);

        if (pullRequests.length === 0) {
            this.showNoDataMessage();
            return;
        }

        pullRequests.forEach(async (pr, index) => {
            const row = this.createPRRow(pr);
            tbody.appendChild(row);
            
            // Load CI status asynchronously for each PR
            this.loadCIStatusForPR(pr, row, index);
        });
    }

    createPRRow(pr) {
        const row = document.createElement('tr');

        // Repository
        const repoCell = document.createElement('td');
        repoCell.textContent = pr.repository.name;
        row.appendChild(repoCell);

        // Author (avatar only)
        const authorCell = document.createElement('td');

        if (pr.author) {
            const avatar = document.createElement('img');
            avatar.src = pr.author.avatarUrl;
            avatar.alt = pr.author.login;
            avatar.className = 'author-avatar';
            avatar.title = pr.author.login;

            authorCell.appendChild(avatar);
        } else {
            authorCell.textContent = '?';
        }

        row.appendChild(authorCell);

        // PR Title (with link)
        const titleCell = document.createElement('td');
        const titleLink = document.createElement('a');
        titleLink.href = pr.url;
        titleLink.target = '_blank';
        titleLink.textContent = pr.title;
        titleLink.className = 'pr-link';
        titleCell.appendChild(titleLink);
        if (pr.isDraft) {
            const draftBadge = document.createElement('span');
            draftBadge.className = 'draft-badge';
            draftBadge.textContent = 'DRAFT';
            titleCell.appendChild(draftBadge);
        }
        row.appendChild(titleCell);

        // Up to Date Status
        const upToDateCell = document.createElement('td');
        const upToDateStatus = this.getMergeableStatus(pr);
        upToDateCell.innerHTML = `<span class="status-badge ${upToDateStatus.class}">${upToDateStatus.text}</span>`;
        row.appendChild(upToDateCell);

        // PR Status
        const statusCell = document.createElement('td');
        const prStatus = this.getPRStatus(pr);
        if (prStatus.text) {
            const statusBadge = document.createElement('span');
            statusBadge.className = `status-badge ${prStatus.class}`;
            statusBadge.textContent = prStatus.text;
            statusCell.appendChild(statusBadge);
        }
        row.appendChild(statusCell);

        // CI Status (initially loading)
        const ciCell = document.createElement('td');
        ciCell.innerHTML = '<span class="status-badge neutral">🔄 Loading...</span>';
        row.appendChild(ciCell);

        return row;
    }

    async loadCIStatusForPR(pr, row, index) {
        try {
            const commits = pr.commits.nodes;
            if (!commits.length) {
                this.updateCICell(row, { text: 'No CI', class: 'neutral', failedChecks: [] });
                return;
            }

            const statusRollup = commits[0].commit.statusCheckRollup;

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
                        const sha = commits[0].commit.oid;
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
                        failedChecks.push({
                            name: checkRun.name,
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

    getPRStatus(pr) {
        // Draft PRs show no status
        if (pr.isDraft) {
            return { text: '', class: '' };
        }

        // Check review status
        const reviews = pr.reviews.nodes || [];
        const reviewRequests = pr.reviewRequests.nodes || [];

        // Get latest review states by reviewer
        const reviewsByAuthor = {};
        reviews.forEach(review => {
            const author = review.author.login;
            // Keep only the latest review per author
            if (!reviewsByAuthor[author] || reviewsByAuthor[author].state !== 'APPROVED') {
                reviewsByAuthor[author] = review;
            }
        });

        const latestReviews = Object.values(reviewsByAuthor);
        const hasApprovalReview = latestReviews.some(review => review.state === 'APPROVED');
        const hasChangesRequested = latestReviews.some(review => review.state === 'CHANGES_REQUESTED');
        const hasPendingRequests = reviewRequests.length > 0;

        if (hasChangesRequested) {
            return { text: '🔄 Changes Requested', class: 'warning' };
        }

        if (hasApprovalReview && !hasPendingRequests) {
            return { text: '✅ Approved', class: 'success' };
        }

        if (hasPendingRequests || latestReviews.length === 0) {
            return { text: '⏳ Waiting for Review', class: 'neutral' };
        }

        return { text: '👀 Need change', class: 'warning' };
    }

    getMergeableStatus(pr) {
        if (pr.mergeable === false) {
            return { text: '❌ Not mergeable', class: 'error' };
        }
        if (pr.mergeable === null) {
            return { text: '🔄 Loading', class: 'neutral' };
        }

        // Check merge state status first (more detailed info)
        switch (pr.mergeStateStatus) {
            case 'CLEAN':
                return { text: '✅ Up to date', class: 'success' };
            case 'BEHIND':
                return { text: '⚠️ Behind', class: 'warning' };
            case 'DIRTY':
                return { text: '❌ Conflicts', class: 'error' };
            // case 'UNSTABLE':
            // case 'BLOCKED':
            //     return { text: '🚫 Blocked', class: 'error' };
            // case 'DRAFT':
            //     return { text: '📝 Draft', class: 'neutral' };
            // default:
                // return { text: pr.mergeStateStatus, class: 'neutral' };
        }
        return { text: '', class: 'success' };

        // // Fallback to mergeable field
        // if (pr.mergeable === true) {
        //     return { text: '✅ Up to date', class: 'success' };
        // } else  else {
        //     return { text: '❓ Unknown', class: 'neutral' };
        // }
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