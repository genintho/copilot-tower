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
                                            statusCheckRollup {
                                                state
                                            }
                                            checkSuites(first: 10) {
                                                nodes {
                                                    status
                                                    conclusion
                                                    app {
                                                        name
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                                assignees(first: 10) {
                                    nodes {
                                        login
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

        pullRequests.forEach(pr => {
            const row = this.createPRRow(pr);
            tbody.appendChild(row);
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
        const upToDateStatus = this.getMergeableStatus(pr.mergeable);
        upToDateCell.innerHTML = `<span class="status-badge ${upToDateStatus.class}">${upToDateStatus.text}</span>`;
        row.appendChild(upToDateCell);

        // PR Status
        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge ${pr.state.toLowerCase()}`;
        statusBadge.textContent = pr.isDraft ? 'DRAFT' : pr.state;
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        // CI Status
        const ciCell = document.createElement('td');
        const ciStatus = this.getCIStatus(pr);
        ciCell.innerHTML = `<span class="status-badge ${ciStatus.class}">${ciStatus.text}</span>`;
        row.appendChild(ciCell);

        return row;
    }

    getMergeableStatus(mergeable) {
        if (mergeable === true) {
            return { text: '✅ Mergeable', class: 'success' };
        } else if (mergeable === false) {
            return { text: '❌ Not mergeable', class: 'error' };
        } else {
            return { text: '❓ Unknown', class: 'neutral' };
        }
    }

    getCIStatus(pr) {
        const commits = pr.commits.nodes;
        if (!commits.length) {
            return { text: 'No CI', class: 'neutral' };
        }

        const lastCommit = commits[0].commit;
        const statusRollup = lastCommit.statusCheckRollup;
        
        if (statusRollup) {
            switch (statusRollup.state) {
                case 'SUCCESS':
                    return { text: '✅ Passed', class: 'success' };
                case 'FAILURE':
                    return { text: '❌ Failed', class: 'error' };
                case 'PENDING':
                    return { text: '🟡 Running', class: 'warning' };
                case 'ERROR':
                    return { text: '💥 Error', class: 'error' };
                default:
                    return { text: statusRollup.state, class: 'neutral' };
            }
        }

        // Check individual check suites if no rollup
        const checkSuites = lastCommit.checkSuites.nodes;
        if (checkSuites.length > 0) {
            const hasFailure = checkSuites.some(cs => cs.conclusion === 'FAILURE');
            const hasPending = checkSuites.some(cs => cs.status === 'IN_PROGRESS' || cs.status === 'QUEUED');
            
            if (hasFailure) return { text: '❌ Failed', class: 'error' };
            if (hasPending) return { text: '🟡 Running', class: 'warning' };
            
            const allComplete = checkSuites.every(cs => cs.status === 'COMPLETED');
            if (allComplete) return { text: '✅ Passed', class: 'success' };
        }

        return { text: 'No CI', class: 'neutral' };
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