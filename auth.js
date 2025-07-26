class GitHubAuth {
  constructor() {
    this.token = localStorage.getItem("github_token");
    this.apiEndpoint = "https://api.github.com";
    this.currentStep = 1; // 1: token, 2: organization selection
    this.organizations = [];
    this.selectedOrganization = this.getOrgFromURL();
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.initializeAuth();
  }

  setupEventListeners() {
    // Token form events
    document
      .getElementById("saveToken")
      ?.addEventListener("click", () => this.handleTokenSubmit());
    document
      .getElementById("clearToken")
      ?.addEventListener("click", () => this.clearAuth());
    document
      .getElementById("githubToken")
      ?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") this.handleTokenSubmit();
      });

    // Organization selection events
    document
      .getElementById("orgBackButton")
      ?.addEventListener("click", () => this.showTokenStep());
    document
      .getElementById("selectOrgButton")
      ?.addEventListener("click", () => this.handleOrgSelection());

    // Main dashboard events
    document
      .getElementById("clearDataButton")
      ?.addEventListener("click", () => this.clearAllData());

    // Handle browser back/forward for URL changes
    window.addEventListener("popstate", () => {
      this.selectedOrganization = this.getOrgFromURL();
      this.updateOrgDropdown();
    });
  }

  async initializeAuth() {
    if (this.token) {
      const isValid = await this.validateToken(this.token);
      if (isValid) {
        if (this.selectedOrganization) {
          // User has token and org in URL, check if org is valid
          const orgs = await this.getUserOrganizations();
          if (orgs.find((org) => org.login === this.selectedOrganization)) {
            this.showMainContent();
            return;
          }
        }
        // Show org selection step
        this.showOrganizationStep();
      } else {
        // Invalid token, clear and show token step
        this.clearAuth();
        this.showTokenStep();
      }
    } else {
      this.showTokenStep();
    }
  }

  async validateToken(token) {
    return await window.githubAPI.validateToken(token);
  }

  async getUserOrganizations() {
    // Check cache first
    const cached = this.getCachedOrganizations();
    if (cached) {
      this.organizations = cached;
      return cached;
    }

    try {
      const organizations = await window.githubAPI.getUserOrganizations();
      this.cacheOrganizations(organizations);
      this.organizations = organizations;
      return organizations;
    } catch (error) {
      this.showError(error.message);
      return [];
    }
  }

  getCachedOrganizations() {
    try {
      const cached = localStorage.getItem("github_orgs_cache");
      if (!cached) return null;

      const data = JSON.parse(cached);
      const now = Date.now();

      if (now < data.expiresAt) {
        return data.organizations;
      } else {
        // Cache expired, remove it
        localStorage.removeItem("github_orgs_cache");
        return null;
      }
    } catch (error) {
      console.error("Error reading organizations cache:", error);
      localStorage.removeItem("github_orgs_cache");
      return null;
    }
  }

  cacheOrganizations(organizations) {
    const cacheData = {
      organizations: organizations,
      cachedAt: Date.now(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };

    try {
      localStorage.setItem("github_orgs_cache", JSON.stringify(cacheData));
    } catch (error) {
      console.error("Error caching organizations:", error);
    }
  }

  getOrgFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("org");
  }

  setOrgInURL(orgName) {
    const url = new URL(window.location);
    if (orgName) {
      url.searchParams.set("org", orgName);
    } else {
      url.searchParams.delete("org");
    }
    window.history.pushState({}, "", url);
  }

  async handleTokenSubmit() {
    const tokenInput = document.getElementById("githubToken");
    const token = tokenInput.value.trim();

    if (!token) {
      this.showError("Please enter a valid GitHub token");
      return;
    }

    this.showLoading("Validating token...");

    const isValid = await this.validateToken(token);
    if (isValid) {
      this.token = token;
      localStorage.setItem("github_token", token);
      tokenInput.value = "";
      this.hideError();
      this.showOrganizationStep();
    } else {
      this.hideLoading();
      this.showError(
        "Invalid GitHub token. Please check your token and try again.",
      );
    }
  }

  async showOrganizationStep() {
    this.currentStep = 2;
    this.showLoading("Fetching your organizations...");

    const organizations = await this.getUserOrganizations();
    this.hideLoading();

    if (organizations.length === 0) {
      this.showError(
        "No organizations found. Make sure your token has the correct permissions.",
      );
      return;
    }

    this.updateOrganizationUI(organizations);
    this.showOrganizationSelection();
  }

  updateOrganizationUI(organizations) {
    const orgList = document.getElementById("orgList");
    if (!orgList) return;

    orgList.innerHTML = "";

    organizations.forEach((org) => {
      const orgItem = document.createElement("div");
      orgItem.className = "org-item";
      orgItem.innerHTML = `
                <input type="radio" name="organization" value="${org.login}" id="org-${org.login}">
                <label for="org-${org.login}">
                    <img src="${org.avatar_url}" alt="${org.login}" class="org-avatar">
                    <div class="org-info">
                        <strong>${org.login}</strong>
                        ${org.description ? `<p>${org.description}</p>` : ""}
                    </div>
                </label>
            `;
      orgList.appendChild(orgItem);
    });

    // Pre-select organization if it's in URL
    if (this.selectedOrganization) {
      const radio = document.getElementById(`org-${this.selectedOrganization}`);
      if (radio) radio.checked = true;
    }

    // Also populate the main dropdown
    this.populateOrgDropdown(organizations);
  }

  handleOrgSelection() {
    const selectedRadio = document.querySelector(
      'input[name="organization"]:checked',
    );
    if (!selectedRadio) {
      this.showError("Please select an organization");
      return;
    }

    const orgName = selectedRadio.value;
    this.selectedOrganization = orgName;
    this.setOrgInURL(orgName);
    this.showMainContent();
  }

  populateOrgDropdown(organizations) {
    const dropdown = document.getElementById("orgDropdown");
    if (!dropdown) return;

    // Clear existing options
    dropdown.innerHTML = "";

    // Add options for each organization
    organizations.forEach((org) => {
      const option = document.createElement("option");
      option.value = org.login;
      option.textContent = org.login;
      if (org.login === this.selectedOrganization) {
        option.selected = true;
      }
      dropdown.appendChild(option);
    });
  }

  updateOrgDropdown() {
    const dropdown = document.getElementById("orgDropdown");
    if (dropdown && this.selectedOrganization) {
      dropdown.value = this.selectedOrganization;
    }
  }

  setupOrgDropdownEvents() {
    const dropdown = document.getElementById("orgDropdown");
    if (dropdown) {
      // Remove existing event listeners to avoid duplicates
      dropdown.removeEventListener("change", this.handleOrgDropdownChange);

      // Bind the handler to maintain context
      this.handleOrgDropdownChange = (e) => {
        const newOrg = e.target.value;
        this.selectedOrganization = newOrg;
        this.setOrgInURL(newOrg);

        // Dispatch custom event for main app to listen to
        window.dispatchEvent(
          new CustomEvent("organizationChanged", {
            detail: { organization: newOrg },
          }),
        );
      };

      dropdown.addEventListener("change", this.handleOrgDropdownChange);
    }
  }

  showTokenStep() {
    this.currentStep = 1;
    document.getElementById("initialLoading")?.classList.add("hidden");
    document.getElementById("tokenStep")?.classList.remove("hidden");
    document.getElementById("orgStep")?.classList.add("hidden");
    document.getElementById("mainContent")?.classList.add("hidden");
  }

  showOrganizationSelection() {
    this.currentStep = 2;
    document.getElementById("initialLoading")?.classList.add("hidden");
    document.getElementById("tokenStep")?.classList.add("hidden");
    document.getElementById("orgStep")?.classList.remove("hidden");
    document.getElementById("mainContent")?.classList.add("hidden");
  }

  showMainContent() {
    document.getElementById("initialLoading")?.classList.add("hidden");
    document.getElementById("tokenStep")?.classList.add("hidden");
    document.getElementById("orgStep")?.classList.add("hidden");
    document.getElementById("mainContent")?.classList.remove("hidden");

    // Add organization dropdown to controls
    this.addOrgDropdownToControls();

    // Dispatch event for main app initialization
    window.dispatchEvent(
      new CustomEvent("authComplete", {
        detail: {
          token: this.token,
          organization: this.selectedOrganization,
        },
      }),
    );
  }

  addOrgDropdownToControls() {
    // Always populate dropdown if organizations are available
    if (this.organizations.length > 0) {
      this.populateOrgDropdown(this.organizations);
      this.setupOrgDropdownEvents();
    }
  }

  clearAuth() {
    this.token = null;
    this.selectedOrganization = null;
    this.organizations = [];
    localStorage.clear();
    this.setOrgInURL(null);
    this.showTokenStep();
  }

  clearAllData() {
    const confirmed = confirm(
      "Are you sure you want to clear all stored data? This will log you out and clear all cached information.",
    );

    if (!confirmed) {
      return;
    }

    localStorage.clear();
    window.location.reload();
  }

  showError(message) {
    const errorDiv = document.getElementById("authError");
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = "block";
    }
  }

  hideError() {
    const errorDiv = document.getElementById("authError");
    if (errorDiv) {
      errorDiv.style.display = "none";
    }
  }

  showLoading(message) {
    const loadingDiv = document.getElementById("authLoading");
    if (loadingDiv) {
      loadingDiv.textContent = message;
      loadingDiv.style.display = "block";
    }
  }

  hideLoading() {
    const loadingDiv = document.getElementById("authLoading");
    if (loadingDiv) {
      loadingDiv.style.display = "none";
    }
  }

  // Public API for main app
  getToken() {
    return this.token;
  }

  getSelectedOrganization() {
    return this.selectedOrganization;
  }

  isAuthenticated() {
    return !!(this.token && this.selectedOrganization);
  }
}

// Global instance
window.githubAuth = new GitHubAuth();
